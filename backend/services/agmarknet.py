import os
import httpx
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
from datetime import datetime, timedelta
import math
import time
import json
from pathlib import Path

CEDA_BASE = os.getenv("CEDA_BASE", "https://api.ceda.ashoka.edu.in/v1")
CEDA_API_KEY = os.getenv("CEDA_API_KEY", "")

# Prefer official data.gov.in resource if configured. To enable, set the
# following env vars in `backend/.env` or your environment:
#   DATAGOV_BASE (optional, default https://api.data.gov.in/resource)
#   DATAGOV_API_KEY (required to use data.gov.in)
#   DATAGOV_RESOURCE_ID (the resource id for the Agmarknet dataset)
#   USE_DATAGOV (optional, defaults to true)
DATAGOV_BASE = os.getenv("DATAGOV_BASE", "https://api.data.gov.in/resource")
DATAGOV_API_KEY = os.getenv("DATAGOV_API_KEY", "")
DATAGOV_RESOURCE_ID = os.getenv("DATAGOV_RESOURCE_ID", "")
USE_DATAGOV = os.getenv("USE_DATAGOV", "true").lower() in ("1", "true", "yes")

# Expected response schema: JSON array with City, Commodity, Min Prize, Max Prize, Date
# We'll normalize keys to snake_case: city, commodity, min_price, max_price, modal_price, date

async def _post_prices_async(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    # Default legacy CEDA client kept for compatibility. Prefer DATA.GOV
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            headers = {}
            if CEDA_API_KEY:
                # Send common header variants; CEDA accepts api-key in header or bearer
                headers = {
                    "Authorization": f"Bearer {CEDA_API_KEY}",
                    "x-api-key": CEDA_API_KEY,
                    "Content-Type": "application/json"
                }
            resp = await client.post(f"{CEDA_BASE}/agmarknet/prices", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            content = None
            try:
                content = e.response.text
            except Exception:
                content = str(e)
            # If CEDA returned 401 and user intended to use data.gov, surface clearer guidance
            if e.response.status_code == 401:
                raise ValueError(
                    "Agmarknet (CEDA) returned 401 Unauthorized. "
                    "If you prefer the official data.gov.in dataset, set DATAGOV_API_KEY and DATAGOV_RESOURCE_ID and set USE_DATAGOV=true. "
                    "Otherwise ensure CEDA_API_KEY is set and valid. Response: " + (content or "(no body)")
                )
            raise ValueError(f"Agmarknet API returned error: {e.response.status_code} {content}")
        except Exception as e:
            raise ValueError(f"Failed to call Agmarknet service: {e}")
        normalized = []
        for row in data:
            normalized.append({
                "city": row.get("City") or row.get("city", ""),
                "commodity": row.get("Commodity") or row.get("commodity", ""),
                "min_price": float(row.get("Min Prize") or row.get("MinPrice") or row.get("min_price", 0) or 0),
                "max_price": float(row.get("Max Prize") or row.get("MaxPrice") or row.get("max_price", 0) or 0),
                "modal_price": float(row.get("Modal Price") or row.get("modal_price", 0) or 0),
                "date": row.get("Date") or row.get("date", ""),
            })
        return normalized


def fetch_prices(commodity: str, market: Optional[str] = None, state: Optional[str] = None,
                 start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
    payload: Dict[str, Any] = {"commodity": commodity}
    if market:
        payload["market"] = market
    if state:
        payload["state"] = state
    if start_date:
        payload["start_date"] = start_date
    if end_date:
        payload["end_date"] = end_date

    # Use sync wrapper around async client for FastAPI dependency simplicity
    import anyio

    # If data.gov integration is requested and configured, attempt it first
    if USE_DATAGOV:
        try:
            return anyio.run(_post_prices_datagov_async, payload)
        except Exception as e:
            # If DATAGOV call fails due to configuration, fall back to CEDA client
            # but surface helpful guidance for missing keys
            msg = str(e)
            if "DATAGOV_RESOURCE_ID" in msg or "DATAGOV_API_KEY" in msg:
                raise
            # Otherwise log and fall back
    return anyio.run(_post_prices_async, payload)


async def _post_prices_datagov_async(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Query data.gov.in resource endpoint for Agmarknet dataset.

    Requires DATAGOV_RESOURCE_ID and DATAGOV_API_KEY to be set. The function maps
    incoming `commodity`, `market`, `state`, `start_date`, `end_date` to
    `filters[...]` query parameters used by the data.gov.in API. The exact
    resource schema may vary; you should set `DATAGOV_RESOURCE_ID` to the
    Agmarknet resource id provided by data.gov.in.
    """
    if not DATAGOV_RESOURCE_ID or not DATAGOV_API_KEY:
        raise ValueError("DATAGOV_RESOURCE_ID and DATAGOV_API_KEY must be set to use data.gov.in integration")

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            params: Dict[str, Any] = {"api-key": DATAGOV_API_KEY, "format": "json", "limit": 200}
            # Map possible filters
            if payload.get("commodity"):
                params["filters[commodity]"] = payload["commodity"]
            if payload.get("market"):
                params["filters[market]"] = payload["market"]
            if payload.get("state"):
                params["filters[state]"] = payload["state"]
            if payload.get("start_date"):
                params["from_date"] = payload["start_date"]
            if payload.get("end_date"):
                params["to_date"] = payload["end_date"]

            url = f"{DATAGOV_BASE}/{DATAGOV_RESOURCE_ID}"
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            content = None
            try:
                content = e.response.text
            except Exception:
                content = str(e)
            if e.response.status_code == 401:
                raise ValueError("data.gov.in returned 401 Unauthorized: check DATAGOV_API_KEY and permissions. Response: " + (content or "(no body)"))
            raise ValueError(f"data.gov.in API returned error: {e.response.status_code} {content}")
        except Exception as e:
            raise ValueError(f"Failed to call data.gov.in Agmarknet resource: {e}")

        # data.gov responses often put results in `records` or `data` depending on API
        records = data.get("records") or data.get("data") or data.get("result") or []
        normalized = []
        for row in records:
            # Attempt to be robust to different key names
            normalized.append({
                "city": row.get("market") or row.get("city") or row.get("Market") or row.get("mandi") or "",
                "commodity": row.get("commodity") or row.get("Commodity") or "",
                "min_price": float(row.get("min_price", row.get("Min Prize", row.get("min_price_inr", 0)) or 0) or 0),
                "max_price": float(row.get("max_price", row.get("Max Prize", 0) or 0) or 0),
                "modal_price": float(row.get("modal_price", row.get("Modal Price", row.get("modal", 0) or 0) or 0)),
                "date": row.get("date") or row.get("Date") or row.get("trade_date") or "",
                "lat": row.get("lat") or row.get("latitude"),
                "lon": row.get("lon") or row.get("longitude"),
            })
        return normalized


def _haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Return great-circle distance between two (lat, lon) points in kilometers."""
    lat1, lon1 = a
    lat2, lon2 = b
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    x = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return 2 * R * math.asin(math.sqrt(x))


def filter_markets_by_distance(markets: List[Dict[str, Any]], origin: Tuple[float, float], radius_km: float = 100.0) -> List[Dict[str, Any]]:
    """Given a list of market entries (each may include 'name' and optional 'lat','lon'),
    return those within `radius_km` of `origin`. If a market lacks coords, try geocoding via OSM.
    Each returned entry will include computed `distance_km`.
    """
    out: List[Dict[str, Any]] = []
    for m in markets:
        name = m.get('name') or m.get('market') or m.get('city')
        lat = m.get('lat') or m.get('latitude')
        lon = m.get('lon') or m.get('longitude')
        coords = None
        if lat is not None and lon is not None:
            try:
                coords = (float(lat), float(lon))
            except Exception:
                coords = None

        if not coords and name:
            coords = geocode_market_osm(name)

        if not coords:
            # skip markets we cannot locate
            continue

        dist = _haversine_km(origin, coords)
        if dist <= float(radius_km):
            entry = dict(m)
            entry['distance_km'] = round(dist, 2)
            entry['lat'] = coords[0]
            entry['lon'] = coords[1]
            out.append(entry)

    # sort by distance ascending
    out = sorted(out, key=lambda x: x['distance_km'])
    return out


def geocode_market_osm(market_name: str, state: Optional[str] = None) -> Optional[Tuple[float, float]]:
    """Lightweight geocode using Nominatim (OpenStreetMap). Returns (lat, lon) or None on failure.
    Intended for hackathon-safe, low-volume use only.
    """
    # Use a small persistent cache to avoid overloading Nominatim and to be rate-limit friendly
    CACHE_PATH = Path(__file__).parent.parent / "tmp_geocache.json"
    try:
        q = market_name
        if state:
            q = f"{market_name}, {state}, India"

        # Load cache
        cache = {}
        try:
            if CACHE_PATH.exists():
                cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

        if q in cache:
            entry = cache[q]
            return (float(entry["lat"]), float(entry["lon"]))

        # Simple rate-limit: ensure at least 1s between geocode calls
        last_call_file = Path(__file__).parent.parent / ".last_geocode"
        try:
            if last_call_file.exists():
                last_ts = float(last_call_file.read_text())
                elapsed = time.time() - last_ts
                if elapsed < 1.0:
                    time.sleep(1.0 - elapsed)
        except Exception:
            pass

        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": q, "format": "json", "limit": 1, "countrycodes": "in"}
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, params=params, headers={"User-Agent": "KisanBuddy/1.0 (hackathon)"})
            resp.raise_for_status()
            data = resp.json()
            if not data:
                return None
            item = data[0]
            lat = float(item["lat"])
            lon = float(item["lon"])

            # Save to cache
            try:
                cache[q] = {"lat": lat, "lon": lon, "timestamp": int(time.time())}
                CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")
            except Exception:
                pass

            try:
                last_call_file.write_text(str(time.time()))
            except Exception:
                pass

            return (lat, lon)
    except Exception:
        return None


def find_nearest_mandis(commodity: str, origin: Tuple[float, float], radius_km: int = 100, top_n: int = 5,
                        fuel_rate_per_ton_km: float = 0.05, mandi_fees: float = 0.0) -> List[Dict[str, Any]]:
    """Fetch recent prices for `commodity`, geocode markets, compute distance and effective price.

    - `fuel_rate_per_ton_km` is a simple transport cost expressed as currency units per ton per km.
    - `mandi_fees` is a flat per-ton fee applied at destination market.
    Returns list of entries with keys: city, modal_price, distance_km, effective_price, raw_entry
    """
    # Fetch broad price list from upstream API
    prices = fetch_prices(commodity=commodity)
    enriched: List[Dict[str, Any]] = []
    for p in prices:
        city = p.get("city") or p.get("City") or ""
        state = p.get("state") or p.get("State")
        modal = float(p.get("modal_price", p.get("Modal Price", 0) or 0))
        # Try to get coords from the row if present
        lat = p.get("lat") or p.get("latitude") or p.get("lat_dd")
        lon = p.get("lon") or p.get("longitude") or p.get("lon_dd")
        coords = None
        if lat and lon:
            try:
                coords = (float(lat), float(lon))
            except Exception:
                coords = None

        if not coords:
            coords = geocode_market_osm(city, state)

        if not coords:
            continue

        distance = _haversine_km(origin, coords)
        if distance > radius_km:
            continue

        # Compute effective price per ton
        # Note: caller should ensure modal_price is per ton units consistent with transport cost
        effective_price = modal - (distance * fuel_rate_per_ton_km) - mandi_fees
        enriched.append({
            "city": city,
            "state": state,
            "modal_price": modal,
            "distance_km": round(distance, 2),
            "effective_price": round(effective_price, 2),
            "raw": p,
        })

    # Sort by effective_price descending
    enriched = sorted(enriched, key=lambda x: x["effective_price"], reverse=True)
    return enriched[:top_n]


def forecast_prices(prices: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Build a simple 14-day forecast using ARIMA if enough history, else naive carry-forward
    if not prices:
        return []
    df = pd.DataFrame(prices)
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df = df.sort_values("date")
    series = df["modal_price"].astype(float)

    horizon = 14
    try:
        import warnings
        warnings.filterwarnings("ignore")
        from statsmodels.tsa.arima.model import ARIMA
        # Simple ARIMA(1,1,1) as a baseline; in production, auto-select via AIC grid
        model = ARIMA(series, order=(1, 1, 1))
        fitted = model.fit()
        forecast_vals = fitted.forecast(steps=horizon)
        # Ensure we have a plain list indexed by integer
        try:
            forecast_vals = list(forecast_vals)
        except Exception:
            # fallback: coerce to list via iteration
            forecast_vals = [float(x) for x in forecast_vals]
    except Exception:
        # Fallback: last value flat forecast
        last = float(series.iloc[-1])
        forecast_vals = [last] * horizon

    start = df["date"].iloc[-1] if "date" in df.columns and pd.notnull(df["date"].iloc[-1]) else datetime.utcnow()
    out: List[Dict[str, Any]] = []
    for i in range(horizon):
        day = (start + timedelta(days=i + 1)).date().isoformat()
        out.append({"date": day, "modal_price": float(forecast_vals[i])})
    return out
