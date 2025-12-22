import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File, Response, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.agmarknet import fetch_prices, forecast_prices
from services.anthrokrishi import query_parcel_by_plus_code, s2_cell_from_latlon
from services.earth_engine import fetch_hazards, fetch_ndvi_timeseries, init_earth_engine
from services.vision import diagnose_leaf, load_u2net_model, load_vit_model, poi_using_models
from services.sync import push_docs, pull_docs, hub as sync_hub
from agents.planner import plan_tasks
from agents.validator import validate_recommendations
from agents.orchestrator import create_orchestrator, AgentOrchestrator
from services.weather import fetch_weather, crop_advisories
import auth as auth_module
from fastapi import Depends, Header

app = FastAPI(title="Kisan-Mitra API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VisionRequest(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    crop: Optional[str] = None
    language: Optional[str] = "en"  # Language code: en, hi, kn, te, ta, mr, pa, bn, gu, or
    location: Optional[Dict[str, float]] = None  # {"lat": float, "lng": float}
    _nonce: Optional[int] = None

class TreatmentDetails(BaseModel):
    immediateActions: List[str] = []
    organicRemedies: List[str] = []
    futurePrevention: List[str] = []

class VisionResponse(BaseModel):
    diagnosis: str
    diagnosisHindi: Optional[str] = None
    diagnosisRegional: Optional[str] = None
    crop: Optional[str] = None
    confidence: float
    severity: Optional[str] = None
    isHealthy: Optional[bool] = False
    symptoms: List[str] = []
    treatment: Optional[TreatmentDetails] = None
    warnings: List[str] = []


class POIRequest(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None


class POIResponse(BaseModel):
    DLA: float
    TLA: float
    POI: float
    stage: str
    note: Optional[str] = None

class AgmarknetRequest(BaseModel):
    commodity: str
    market: Optional[str] = None
    state: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class PriceEntry(BaseModel):
    city: str
    commodity: str
    min_price: float
    max_price: float
    modal_price: float
    date: str


class NearbyPriceEntry(BaseModel):
    city: str
    state: Optional[str] = None
    modal_price: float
    distance_km: float
    effective_price: float


class AgmarknetNearbyRequest(BaseModel):
    commodity: str
    location: Dict[str, float]  # {"lat": float, "lng": float}
    radius_km: Optional[int] = 100
    top_n: Optional[int] = 5
    fuel_rate_per_ton_km: Optional[float] = 0.05
    mandi_fees: Optional[float] = 0.0


class AgmarknetNearbyResponse(BaseModel):
    nearby: List[NearbyPriceEntry]

class AgmarknetResponse(BaseModel):
    prices: List[PriceEntry]
    forecast: Optional[List[Dict[str, Any]]] = None

class ParcelRequest(BaseModel):
    plus_code: Optional[str] = None
    location: Optional[Dict[str, float]] = None

class ParcelResponse(BaseModel):
    s2_cell: str
    parcel_features: Dict[str, Any]

class HazardsRequest(BaseModel):
    # Accept either a lat/lng location or a textual place name (village, town, city)
    location: Optional[Dict[str, float]] = None
    place: Optional[str] = None

class HazardsResponse(BaseModel):
    flood_risk: float
    drought_risk: float
    window_days: int = 14

class PlanRequest(BaseModel):
    intent: str
    inputs: Dict[str, Any]

class PlanResponse(BaseModel):
    tasks: List[Dict[str, Any]]


class SpreadRequest(BaseModel):
    location: Dict[str, float]
    current_poi: Optional[float] = None
    user_id: Optional[int] = None


class SpreadResponse(BaseModel):
    poi: float
    velocity_pct_per_day: float
    days_to_full: float
    will_cover_within_48h: bool
    rationale: List[str]

class ValidateRequest(BaseModel):
    crop: str
    recommendations: List[Dict[str, Any]]
    context: Optional[Dict[str, Any]] = None

class ValidateResponse(BaseModel):
    validated: List[Dict[str, Any]]
    warnings: List[str] = []


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/api/vision_diagnostic", response_model=VisionResponse)
def vision_diagnostic(req: VisionRequest, response: Response):
    try:
        # Ensure each request is treated as fresh by clients/proxies
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

        # Forward nonce to diagnostic service (client should provide `_nonce`)
        result = diagnose_leaf(req.image_base64, image_url=req.image_url, crop=req.crop, language=req.language or "en", nonce=req._nonce)
        return VisionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/vision_poi", response_model=POIResponse)
def vision_poi(req: POIRequest):
    try:
        if not req.image_base64 and not req.image_url:
            raise HTTPException(status_code=400, detail="image_base64 or image_url required")
        # If image_url provided, try to fetch and convert to base64 (small helper)
        image_b64 = req.image_base64
        if req.image_url and not image_b64:
            import httpx, base64
            with httpx.Client(timeout=30.0) as client:
                r = client.get(req.image_url)
                r.raise_for_status()
                image_b64 = base64.b64encode(r.content).decode("utf-8")

        from services.vision import poi_using_models
        out = poi_using_models(image_b64)
        return POIResponse(DLA=out.get("DLA", 0.0), TLA=out.get("TLA", 0.0), POI=out.get("POI", 0.0), stage=out.get("stage", "low"), note=out.get("note"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/upload_image')
def upload_image(file: UploadFile = File(...)):
    """Accept multipart upload and save to backend/tmp_uploads, return a public URL."""
    try:
        uploads_dir = os.path.join(os.path.dirname(__file__), 'tmp_uploads')
        os.makedirs(uploads_dir, exist_ok=True)
        filename = f"upload_{int(__import__('time').time()*1000)}_{file.filename}"
        path = os.path.join(uploads_dir, filename)
        with open(path, 'wb') as out:
            out.write(file.file.read())
        # Return a URL path under /static/tmp_uploads/
        url = f"/static/tmp_uploads/{filename}"
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class VisionChatRequest(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    message: str
    language: Optional[str] = 'en'


@app.post('/api/vision_chat')
def vision_chat(req: VisionChatRequest):
    try:
        # Use the new helpers in services.vision
        from services.vision import groq_chat, groq_detect_crop, groq_analyze_full

        msg = (req.message or "").lower()
        # If user explicitly asks to identify the crop/plant, run a focused crop detection
        if any(k in msg for k in ["which crop", "which plant", "what crop", "identify crop", "which plant is this", "which crop is this"]):
            out = groq_detect_crop(image_base64=req.image_base64, image_url=req.image_url, language=req.language or 'en')
            return {"crop": out.get("crop", "Unknown"), "confidence": out.get("confidence", 0.0)}

        # Use the exhaustive pixel-level analyzer for general requests to maximize accuracy
        out = groq_analyze_full(image_base64=req.image_base64, image_url=req.image_url, message=req.message, language=req.language or 'en')
        return out
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/upload_model')
def upload_model(file: UploadFile = File(...), model_name: Optional[str] = None):
    """Upload a model state_dict (pth) to backend/models/ with a given model_name (u2net.pth or vit_stage.pth).
    Intended for local/hackathon use only.
    """
    try:
        models_dir = os.path.join(os.path.dirname(__file__), 'models')
        os.makedirs(models_dir, exist_ok=True)
        name = model_name or file.filename
        if not name.endswith('.pth'):
            raise HTTPException(status_code=400, detail='model file must be .pth')
        path = os.path.join(models_dir, name)
        with open(path, 'wb') as out:
            out.write(file.file.read())
        return {"saved": path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/upload_cobra_wasm')
def upload_cobra_wasm(file: UploadFile = File(...)):
    """Upload Cobra VAD WASM binary to frontend/public/cobra_vad.wasm for local integration.
    Only allowed in local/dev environments.
    """
    try:
        base_frontend = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
        target = os.path.join(base_frontend, 'public', 'cobra_vad.wasm')
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as out:
            out.write(file.file.read())
        return {"saved": target}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/ndvi_timeseries')
def ndvi_timeseries(req: HazardsRequest):
    try:
        out = fetch_ndvi_timeseries(req.location, days=30)
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/soil_test')
def soil_test(images: List[UploadFile] = File(...), location_lat: Optional[float] = None, location_lng: Optional[float] = None, notes: Optional[str] = None):
    """Accept one or more soil images and optional location/notes, return a farmer-friendly report.
    This endpoint performs an indicative, image-based analysis only.
    """
    try:
        from services.soil import analyze_images, generate_farmer_report

        img_bytes = []
        for f in images:
            content = f.file.read()
            if content:
                img_bytes.append(content)

        if not img_bytes:
            raise HTTPException(status_code=400, detail='At least one image is required')

        analysis = analyze_images(img_bytes)
        loc = None
        if location_lat is not None and location_lng is not None:
            loc = {'lat': float(location_lat), 'lng': float(location_lng)}
        report = generate_farmer_report(analysis, location=loc, notes=notes)
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/filter_markets')
def filter_markets(payload: Dict[str, Any]):
    """Filter a provided list of markets to those within a radius of the given location.

    Expected payload JSON:
      {
        "markets": [{"name": "Etawah APMC", "lat": 26.8, "lon": 79.0}, ...]  // lat/lon optional
        "location": {"lat": 21.23, "lng": 81.34},
        "radius_km": 100
      }
    Returns filtered market entries with `distance_km`.
    """
    try:
        markets = payload.get('markets') or []
        loc = payload.get('location') or {}
        if not markets:
            raise HTTPException(status_code=400, detail='markets list required in payload')
        lat = loc.get('lat')
        lng = loc.get('lng') or loc.get('lon')
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail='location.lat and location.lng required')
        radius = float(payload.get('radius_km', 100))
        from services.agmarknet import filter_markets_by_distance

        origin = (float(lat), float(lng))
        out = filter_markets_by_distance(markets, origin, radius_km=radius)
        return {'markets': out}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/upload_ee_service_account')
def upload_ee_service_account(file: UploadFile = File(...)):
    """Upload Google Earth Engine service account JSON to backend and attempt initialization.
    Save to `backend/ee_service_account.json` and call `init_earth_engine`.
    """
    try:
        path = os.path.join(os.path.dirname(__file__), 'ee_service_account.json')
        with open(path, 'wb') as out:
            out.write(file.file.read())
        ok = init_earth_engine(path)
        return {"saved": path, "ee_initialized": bool(ok)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/models/test_inference')
def models_test_inference():
    """Run a small synthetic inference using uploaded/created models to verify pipeline.
    Returns POI and stage computed by U2Net+ViT or heuristic fallback.
    """
    try:
        # Create a small green image base64
        import base64
        from io import BytesIO
        from PIL import Image

        img = Image.new('RGB', (128, 128), color=(34, 139, 34))
        buf = BytesIO()
        img.save(buf, format='JPEG')
        b = base64.b64encode(buf.getvalue()).decode('utf-8')

        # Ensure models are loaded via vision service
        u2 = load_u2net_model()
        vit = load_vit_model()
        out = poi_using_models(b)
        return {"u2_loaded": bool(u2 is not None), "vit_loaded": bool(vit is not None), "poi_result": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/sync/push')
def sync_push(docs: List[Dict[str, Any]]):
    try:
        push_docs(docs)
        return {"status": "ok", "received": len(docs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/sync/pull')
def sync_pull(since: Optional[float] = None):
    try:
        docs = pull_docs(since)
        return {"docs": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket('/ws/sync')
async def websocket_sync_endpoint(websocket: WebSocket):
    """WebSocket replication gateway for RxDB/CRDT clients.

    Clients should send JSON messages; the gateway will persist and broadcast.
    """
    await websocket.accept()
    sync_hub.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Persist LWW
            try:
                sync_hub.persist_patch(data)
            except Exception:
                pass
            # Broadcast to other clients
            await sync_hub.broadcast_json(data, exclude=websocket)
    except WebSocketDisconnect:
        sync_hub.disconnect(websocket)
    except Exception:
        sync_hub.disconnect(websocket)


# Mount static files for uploaded images
# Ensure upload folders exist and are served under /static/tmp_uploads
uploads_root = os.path.join(os.path.dirname(__file__), 'tmp_uploads')
os.makedirs(uploads_root, exist_ok=True)
# Map static/tmp_uploads to the uploads directory
# Mount uploads first so they take precedence over frontend files
app.mount('/static/tmp_uploads', StaticFiles(directory=uploads_root), name='uploads')

# If a Next.js exported site exists at ../frontend/out, serve it at root ONLY
# when explicitly configured via SERVE_FRONTEND=1. This avoids StaticFiles mounts
# from intercepting API POST requests during local backend development.
frontend_out = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'out'))
serve_frontend = os.getenv('SERVE_FRONTEND', '0') == '1'
if os.path.isdir(frontend_out) and serve_frontend:
    print(f"Serving frontend from {frontend_out}")
    app.mount('/', StaticFiles(directory=frontend_out, html=True), name='frontend')
else:
    # Fallback: serve backend/static at /static (legacy)
    app.mount('/static', StaticFiles(directory=os.path.join(os.path.dirname(__file__), 'static')), name='static')


@app.post("/api/agmarknet_proactive", response_model=AgmarknetResponse)
def agmarknet_proactive(req: AgmarknetRequest, authorization: Optional[str] = Header(None)):
    try:
        # If caller omitted state/market, and an authenticated user is present,
        # prefer the user's saved region for Agmarknet queries.
        state = req.state
        market = req.market
        if (not state or state == "") and authorization:
            token = None
            if authorization.lower().startswith("bearer "):
                token = authorization.split(" ", 1)[1]
            else:
                token = authorization
            data = auth_module.decode_access_token(token) if token else None
            if data and data.get("sub"):
                user = auth_module.get_user_by_id(data.get("sub"))
                if user and not state:
                    # store region as state fallback
                    state = user.get("region")

        prices = fetch_prices(
            commodity=req.commodity,
            market=market,
            state=state,
            start_date=req.start_date,
            end_date=req.end_date,
        )
        forecast = forecast_prices(prices)
        return AgmarknetResponse(prices=[PriceEntry(**p) for p in prices], forecast=forecast)
    except ValueError as e:
        # Upstream data provider errors (bad key, auth) surface as 502 with helpful guidance
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        # Log detailed traceback to server stdout for debugging
        print("AGMARKNET ERROR:", repr(e))
        print(tb)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agmarknet_nearby", response_model=AgmarknetNearbyResponse)
def agmarknet_nearby(req: AgmarknetNearbyRequest):
    try:
        lat = req.location.get("lat")
        lng = req.location.get("lng")
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="location.lat and location.lng required")
        from services.agmarknet import find_nearest_mandis

        origin = (float(lat), float(lng))
        # Validate and clamp parameters to safe ranges
        radius = int(req.radius_km or 100)
        if radius <= 0 or radius > 200:
            radius = max(10, min(radius, 200))
        topn = int(req.top_n or 5)
        if topn <= 0 or topn > 10:
            topn = max(1, min(topn, 10))
        fuel_rate = float(req.fuel_rate_per_ton_km or 0.05)
        if fuel_rate < 0:
            fuel_rate = 0.05
        mandi_fees = float(req.mandi_fees or 0.0)

        results = find_nearest_mandis(
            commodity=req.commodity,
            origin=origin,
            radius_km=radius,
            top_n=topn,
            fuel_rate_per_ton_km=fuel_rate,
            mandi_fees=mandi_fees,
        )

        nearby = [NearbyPriceEntry(**{
            "city": r["city"],
            "state": r.get("state"),
            "modal_price": r["modal_price"],
            "distance_km": r["distance_km"],
            "effective_price": r["effective_price"],
        }) for r in results]

        return AgmarknetNearbyResponse(nearby=nearby)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RegisterRequest(BaseModel):
    username: str
    password: str
    region: Optional[str] = None


@app.post("/api/register")
def register(req: RegisterRequest):
    try:
        user = auth_module.create_user(req.username, req.password, req.region)
        token = auth_module.create_access_token(user)
        return {"user": user, "token": token}
    except ValueError as e:
        if str(e) == "username_taken":
            raise HTTPException(status_code=400, detail="username already exists")
        raise HTTPException(status_code=500, detail=str(e))


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/login")
def login(req: LoginRequest):
    user = auth_module.authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="invalid_credentials")
    token = auth_module.create_access_token(user)
    return {"user": user, "token": token}


def _get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    else:
        token = authorization
    data = auth_module.decode_access_token(token)
    if not data:
        return None
    return {"id": data.get("sub"), "username": data.get("username")}


@app.post("/api/diagnosis_history")
def save_diagnosis(item: VisionResponse, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="authentication_required")
    import json
    saved = auth_module.save_diagnosis(user_id=user["id"], diagnosis_json=json.dumps(item.dict()), crop=item.crop, location=str(item)
                                       )
    return {"saved": saved}


@app.get("/api/diagnosis_history")
def list_history(authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="authentication_required")
    out = auth_module.list_diagnosis(user_id=user["id"])
    return {"history": out}


@app.post("/api/weather_forecast")
def weather_forecast(req: HazardsRequest, crop: Optional[str] = None, authorization: Optional[str] = Header(None)):
    try:
        # Fail fast when backend not configured with an API key
        if not os.getenv("WEATHER_API_KEY"):
            raise HTTPException(status_code=401, detail="Weather service unauthorized: missing WEATHER_API_KEY")

        # Use provided location; caller may pass user location later
        forecast = fetch_weather(req.location)
        advisories = crop_advisories(forecast, crop=crop)
        from services.weather import farmer_report
        farmer = farmer_report(forecast, crop=crop, horizon_days=14)
        return {"forecast": forecast, "advisories": advisories, "farmer_report": farmer}
    except Exception as e:
        msg = str(e)
        # If provider returned 401/Unauthorized, surface that as a provider error
        if "401" in msg or "unauthorized" in msg.lower() or "Unauthorized" in msg:
            raise HTTPException(status_code=502, detail=f"Weather provider error: {msg}")
        raise HTTPException(status_code=500, detail=msg)


@app.post("/api/anthrokrishi_parcel", response_model=ParcelResponse)
def anthrokrishi_parcel(req: ParcelRequest):
    try:
        if req.plus_code:
            parcel = query_parcel_by_plus_code(req.plus_code)
            return ParcelResponse(s2_cell=parcel["s2_cell"], parcel_features=parcel["features"])
        if req.location:
            forecast = fetch_weather(req.location)
        elif req.place:
            # Geocode the place and fetch weather
            from services.weather import fetch_weather_by_place
            forecast = fetch_weather_by_place(req.place)
        else:
            raise HTTPException(status_code=400, detail="location or place required")

        # Ensure provider returned JSON
        if not forecast or not isinstance(forecast, dict):
            raise HTTPException(status_code=502, detail="Weather provider returned no data")
            raise HTTPException(status_code=400, detail="plus_code or location required")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/earth_engine_hazards", response_model=HazardsResponse)
def earth_engine_hazards(req: HazardsRequest):
    try:
        risks = fetch_hazards(req.location)
        return HazardsResponse(**risks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/spread_velocity", response_model=SpreadResponse)
def spread_velocity(req: SpreadRequest, authorization: Optional[str] = Header(None)):
    try:
        lat = req.location.get("lat")
        lng = req.location.get("lng")
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="location.lat and location.lng required")

        # Use provided POI or derive from last diagnosis if user_id present
        poi = float(req.current_poi) if req.current_poi is not None else None
        if poi is None and req.user_id:
            history = auth_module.list_diagnosis(user_id=req.user_id)
            if history and len(history) > 0:
                # try to parse latest diagnosis JSON for POI
                try:
                    import json
                    latest = history[0]
                    dj = json.loads(latest.get("diagnosis", "{}"))
                    poi = float(dj.get("POI", dj.get("poi", dj.get("severity_pct", 0))))
                except Exception:
                    poi = None

        if poi is None:
            # default conservative estimate
            poi = 10.0

        location = {"lat": lat, "lng": lng}
        # NDVI timeseries (stubbed)
        ndvi_ts = fetch_ndvi_timeseries(location, days=30)
        ndvi_vals = [d["ndvi"] for d in ndvi_ts["ndvi_timeseries"]]

        # Compute simple NDVI slope (last 7 days)
        import numpy as np
        last_n = 7
        arr = np.array([d["ndvi"] for d in ndvi_ts["ndvi_timeseries"][-last_n:]])
        x = np.arange(len(arr))
        if arr.size >= 2:
            slope = float(np.polyfit(x, arr, 1)[0])
        else:
            slope = 0.0

        # Fetch short-term humidity forecast
        try:
            forecast = fetch_weather(location)
            # average hourly humidity for next 48 hours
            hours = forecast.get("hourly", [])[:48]
            hums = [h.get("humidity", 50) for h in hours]
            avg_humidity = float(sum(hums) / max(len(hums), 1))
        except Exception:
            avg_humidity = 60.0

        # Heuristic model to compute velocity (pct of area per day)
        # base velocity scales with current poi
        base = max(0.1, poi / 100.0)  # fraction per day baseline
        humidity_factor = (avg_humidity / 100.0) * 0.8
        ndvi_factor = max(0.0, -slope) * 50.0

        velocity_frac_per_day = base * (1.0 + humidity_factor + ndvi_factor)
        velocity_pct_per_day = round(velocity_frac_per_day * 100.0, 2)

        days_to_full = float('inf')
        if velocity_frac_per_day > 1e-6:
            days_to_full = round((100.0 - poi) / velocity_pct_per_day, 2) if velocity_pct_per_day > 0 else float('inf')

        will_cover = days_to_full <= 2.0

        rationale = [f"NDVI slope (7d): {slope:.4f}", f"avg_humidity_48h: {avg_humidity:.1f}%", f"baseline_poi: {poi}"]

        return SpreadResponse(poi=round(poi, 2), velocity_pct_per_day=velocity_pct_per_day, days_to_full=days_to_full, will_cover_within_48h=will_cover, rationale=rationale)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/plan", response_model=PlanResponse)
def plan(req: PlanRequest):
    try:
        tasks = plan_tasks(req.intent, req.inputs)
        return PlanResponse(tasks=tasks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/validate", response_model=ValidateResponse)
def validate(req: ValidateRequest):
    try:
        out = validate_recommendations(req.crop, req.recommendations, req.context or {})
        return ValidateResponse(**out)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ORCHESTRATOR ENDPOINT - Research-Grade ReAct Framework
# =============================================================================

class OrchestrateRequest(BaseModel):
    """Request for the agentic orchestration endpoint."""
    intent: str
    inputs: Dict[str, Any]
    session_id: Optional[str] = None
    include_trace: bool = True  # Whether to include full XAI trace


class OrchestrateResponse(BaseModel):
    """Response with results, confidence breakdown, and optional trace."""
    status: str
    results: List[Dict[str, Any]] = []
    task_summary: Dict[str, int] = {}
    confidence: Dict[str, Any] = {}
    validation: Optional[Dict[str, Any]] = None
    recommendations: List[Dict[str, Any]] = []
    trace: Optional[Dict[str, Any]] = None
    warnings: List[str] = []


def _create_configured_orchestrator(session_id: str = None) -> AgentOrchestrator:
    """Create an orchestrator with real task executors wired to services."""
    orchestrator = create_orchestrator(session_id)
    
    # Wire up real executors for each task type
    def vision_executor(inputs: Dict) -> Dict:
        result = diagnose_leaf(
            inputs.get("image_base64"),
            image_url=inputs.get("image_url"),
            crop=inputs.get("crop"),
            language=inputs.get("language", "en")
        )
        return result
    
    def agmarknet_executor(inputs: Dict) -> Dict:
        prices = fetch_prices(
            commodity=inputs.get("commodity", ""),
            market=inputs.get("market"),
            state=inputs.get("state")
        )
        forecast = forecast_prices(prices)
        return {
            "prices": prices,
            "forecast": forecast,
            "confidence": 0.9 if prices else 0.3
        }
    
    def hazards_executor(inputs: Dict) -> Dict:
        location = inputs.get("location", {})
        if not location:
            return {"error": "Location required", "confidence": 0.0}
        risks = fetch_hazards(location)
        return {**risks, "confidence": 0.85}
    
    def weather_executor(inputs: Dict) -> Dict:
        location = inputs.get("location", {})
        if not location:
            return {"error": "Location required", "confidence": 0.0}
        forecast = fetch_weather(location)
        advisories = crop_advisories(forecast, inputs.get("crop"))
        return {
            "forecast": forecast,
            "advisories": advisories,
            "confidence": 0.8
        }
    
    def parcel_executor(inputs: Dict) -> Dict:
        if inputs.get("plus_code"):
            parcel = query_parcel_by_plus_code(inputs["plus_code"])
            return {**parcel, "confidence": 0.9}
        elif inputs.get("location"):
            loc = inputs["location"]
            cell = s2_cell_from_latlon(loc.get("lat", 0), loc.get("lng", 0), level=13)
            return {
                "s2_cell": cell,
                "features": {"status": "pending"},
                "confidence": 0.7
            }
        return {"error": "No location provided", "confidence": 0.0}
    
    # Register executors
    orchestrator.register_executor("vision_diagnostic", vision_executor)
    orchestrator.register_executor("agmarknet_proactive", agmarknet_executor)
    orchestrator.register_executor("earth_engine_hazards", hazards_executor)
    orchestrator.register_executor("weather_check", weather_executor)
    orchestrator.register_executor("anthrokrishi_parcel", parcel_executor)
    
    return orchestrator


@app.post("/api/orchestrate", response_model=OrchestrateResponse)
def orchestrate(req: OrchestrateRequest):
    """
    Research-grade agentic orchestration endpoint.
    
    Implements the full ReAct (Reasoning and Acting) cognitive cycle:
    1. INPUT: Parse and understand user intent
    2. VALIDATION: Check input constraints
    3. ANALYSIS: Decompose into sub-tasks via Planner
    4. REASONING: Execute with Chain-of-Thought
    5. OUTPUT: Aggregate and validate via CIB&RC
    6. ACTION: Generate actionable recommendations
    
    Returns complete execution trace for XAI overlay.
    """
    try:
        orchestrator = _create_configured_orchestrator(req.session_id)
        result = orchestrator.orchestrate(req.intent, req.inputs)
        
        # Optionally strip trace for bandwidth
        if not req.include_trace:
            result.pop("trace", None)
        
        return OrchestrateResponse(**result)
    except Exception as e:
        import traceback
        return OrchestrateResponse(
            status="error",
            warnings=[str(e)],
            confidence={"overall": 0.0, "components": {}, "reasoning": f"Orchestration failed: {str(e)}"}
        )


# =============================================================================
# CHAT ENDPOINT (Enhanced with orchestration awareness)
# =============================================================================

class ChatRequest(BaseModel):
    message: str
    language: Optional[str] = "en"


class ChatResponse(BaseModel):
    reply: str
    suggestions: List[str] = []  # Wayfinder suggestions
    intent_detected: Optional[str] = None


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        text = (req.message or "").lower()
        suggestions = []
        intent = None
        
        # Very small rule-based assistant for quick guidance
        if any(k in text for k in ["leaf", "pest", "disease", "crop", "plant"]):
            reply = (
                "Please tell me the crop name and symptoms (spots, yellowing, holes). "
                "If possible, upload a photo via Crop Health Check for a detailed diagnosis. "
                "In the meantime, ensure adequate spacing, avoid overhead irrigation, and consider pruning infected parts."
            )
            intent = "disease_diagnosis"
            suggestions = ["Upload crop photo", "Describe symptoms", "Check common diseases"]
        elif any(k in text for k in ["price", "market", "mandi"]):
            reply = "Tell me the crop and your state or enable location; I'll fetch latest mandi prices and a short forecast."
            intent = "market_prices"
            suggestions = ["Wheat prices in Punjab", "Today's vegetable rates", "Price forecast"]
        elif any(k in text for k in ["weather", "flood", "drought"]):
            reply = "I can provide a 14-day hazard forecast for your location. Allow location access or tell me your town/village."
            intent = "weather_hazards"
            suggestions = ["Check rain forecast", "Flood risk assessment", "Best spraying time"]
        else:
            reply = "I can help with crop health diagnosis, market prices, and weather hazards. Try: 'My tomato leaves have spots' or 'Show wheat prices'."
            suggestions = ["Diagnose crop disease", "Check market prices", "Weather forecast"]

        return ChatResponse(reply=reply, suggestions=suggestions, intent_detected=intent)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
