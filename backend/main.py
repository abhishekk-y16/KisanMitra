import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from services.agmarknet import fetch_prices, forecast_prices
from services.anthrokrishi import query_parcel_by_plus_code, s2_cell_from_latlon
from services.earth_engine import fetch_hazards
from services.vision import diagnose_leaf
from agents.planner import plan_tasks
from agents.validator import validate_recommendations
from services.weather import fetch_weather, crop_advisories
import auth as auth_module
from fastapi import Depends, Header

app = FastAPI(title="Kisan-Mitra API", version="0.1.0")

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
    location: Dict[str, float]

class HazardsResponse(BaseModel):
    flood_risk: float
    drought_risk: float
    window_days: int = 14

class PlanRequest(BaseModel):
    intent: str
    inputs: Dict[str, Any]

class PlanResponse(BaseModel):
    tasks: List[Dict[str, Any]]

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


# Mount static files for uploaded images
# Ensure upload folders exist and are served under /static/tmp_uploads
uploads_root = os.path.join(os.path.dirname(__file__), 'tmp_uploads')
os.makedirs(uploads_root, exist_ok=True)
# Map static/tmp_uploads to the uploads directory
app.mount('/static', StaticFiles(directory=os.path.join(os.path.dirname(__file__), 'static')), name='static')
app.mount('/static/tmp_uploads', StaticFiles(directory=uploads_root), name='uploads')


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
        # Use provided location; caller may pass user location later
        forecast = fetch_weather(req.location)
        advisories = crop_advisories(forecast, crop=crop)
        return {"forecast": forecast, "advisories": advisories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/anthrokrishi_parcel", response_model=ParcelResponse)
def anthrokrishi_parcel(req: ParcelRequest):
    try:
        if req.plus_code:
            parcel = query_parcel_by_plus_code(req.plus_code)
            return ParcelResponse(s2_cell=parcel["s2_cell"], parcel_features=parcel["features"])
        elif req.location:
            cell = s2_cell_from_latlon(req.location["lat"], req.location["lng"], level=13)
            # Placeholder features until allowlisting is configured
            features = {"resolution": "1m", "source": "ALU/AMED", "status": "allowlist_pending"}
            return ParcelResponse(s2_cell=cell, parcel_features=features)
        else:
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


class ChatRequest(BaseModel):
    message: str
    language: Optional[str] = "en"


class ChatResponse(BaseModel):
    reply: str


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        text = (req.message or "").lower()
        # Very small rule-based assistant for quick guidance
        if any(k in text for k in ["leaf", "pest", "disease", "crop", "plant"]):
            reply = (
                "Please tell me the crop name and symptoms (spots, yellowing, holes). "
                "If possible, upload a photo via Crop Health Check for a detailed diagnosis. "
                "In the meantime, ensure adequate spacing, avoid overhead irrigation, and consider pruning infected parts."
            )
        elif any(k in text for k in ["price", "market", "mandi"]):
            reply = "Tell me the crop and your state or enable location; I'll fetch latest mandi prices and a short forecast."
        elif any(k in text for k in ["weather", "flood", "drought"]):
            reply = "I can provide a 14-day hazard forecast for your location. Allow location access or tell me your town/village."
        else:
            reply = "I can help with crop health diagnosis, market prices, and weather hazards. Try: 'My tomato leaves have spots' or 'Show wheat prices'."

        return ChatResponse(reply=reply)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
