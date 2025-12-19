import os
from typing import Dict, Any, Optional
import httpx

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY", "")
OWM_BASE = "https://api.openweathermap.org/data/2.5/onecall"


def fetch_weather(location: Dict[str, float], exclude: Optional[str] = "minutely") -> Dict[str, Any]:
    lat = location.get("lat")
    lon = location.get("lng") or location.get("lon")
    if lat is None or lon is None:
        raise ValueError("location requires lat and lng/lon")
    params = {
        "lat": lat,
        "lon": lon,
        "exclude": exclude,
        "units": "metric",
        "appid": WEATHER_API_KEY,
    }
    try:
        resp = httpx.get(OWM_BASE, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise ValueError(f"Weather API error: {e}")
    return data


def crop_advisories(forecast: Dict[str, Any], crop: Optional[str] = None) -> Dict[str, Any]:
    adv = []
    # Simple rule-based advisories
    # Check daily forecasts for extremes in next 7 days
    days = forecast.get("daily", [])[:7]
    for d in days:
        temp = d.get("temp", {})
        max_t = temp.get("max") if temp else None
        min_t = temp.get("min") if temp else None
        pop = d.get("pop", 0)
        weather = d.get("weather", [])
        main = weather[0]["main"] if weather else ""
        if max_t is not None and max_t >= 40:
            adv.append("High daytime temperatures expected — consider irrigation and heat stress measures.")
        if min_t is not None and min_t <= 2:
            adv.append("Low night temperatures expected — protect sensitive crops from frost.")
        if pop and pop > 0.6:
            adv.append("High probability of heavy rain — secure seedlings and improve drainage.")
        if main.lower() in ["thunderstorm"]:
            adv.append("Thunderstorm risk — avoid field operations and secure shade nets.")
    # Alerts if provided by provider
    alerts = forecast.get("alerts", [])
    for a in alerts:
        adv.append(f"Alert: {a.get('event')}: {a.get('description', '')[:200]}")

    # Basic crop-specific note
    if crop:
        adv.append(f"General advice for {crop}: monitor pest/disease risk after heavy rains; adjust nutrient schedule if stress observed.")

    return {"advisories": adv, "summary_days": len(days)}
