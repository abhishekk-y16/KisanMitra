"""
Earth Engine Hazards Service
Queries Sentinel-1/2 data for 14-day flood/drought risk.
In production, use the Earth Engine Python API with service account credentials.
"""
from typing import Dict, Any
import os

def fetch_hazards(location: Dict[str, float]) -> Dict[str, Any]:
    """
    Returns flood and drought risk scores for the given location.
    Placeholder implementation - in production, integrate with:
      - ee.ImageCollection("COPERNICUS/S1_GRD") for flood detection
      - ee.ImageCollection("COPERNICUS/S2_SR") for vegetation stress (NDVI/NDWI)
    """
    lat = location.get("lat", 0)
    lng = location.get("lng", 0)

    # Stub: return moderate risk values
    # Real implementation would compute from Sentinel imagery
    return {
        "flood_risk": 0.15,  # 0-1 scale
        "drought_risk": 0.25,
        "window_days": 14,
        "location": {"lat": lat, "lng": lng},
        "source": "Sentinel-1/2 (stub)",
    }


def fetch_ndvi_timeseries(location: Dict[str, float], days: int = 30) -> Dict[str, Any]:
    """Return a stub NDVI time-series for the past `days` days.

    In production, this should query Sentinel-2 surface reflectance and compute NDVI per date.
    """
    from datetime import datetime, timedelta
    import random

    today = datetime.utcnow().date()
    out = []
    base = 0.7 - (random.random() * 0.1)
    # Simulate gentle seasonal decline or stress
    for i in range(days):
        d = today - timedelta(days=(days - i))
        # small random walk with occasional drop
        noise = (random.random() - 0.5) * 0.02
        trend = -0.001 * i
        ndvi = max(0.0, min(1.0, base + trend + noise))
        out.append({"date": d.isoformat(), "ndvi": round(ndvi, 3)})

    return {"location": location, "days": days, "ndvi_timeseries": out, "source": "stub"}


def init_earth_engine(service_account_json_path: str = None) -> bool:
    """Attempt to initialize Google Earth Engine if available and credentials provided.

    Returns True if EE is initialized, else False (stub mode).
    """
    try:
        import ee
    except Exception:
        return False

    try:
        if service_account_json_path is None:
            service_account_json_path = os.getenv("EE_SERVICE_ACCOUNT_JSON")
        if service_account_json_path and os.path.exists(service_account_json_path):
            credentials = ee.ServiceAccountCredentials(None, service_account_json_path)
            ee.Initialize(credentials)
        else:
            ee.Initialize()
        return True
    except Exception:
        return False
