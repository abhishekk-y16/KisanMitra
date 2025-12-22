import os
from typing import Dict, Any, Optional
import httpx

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY", "57f85014a86a5caeb34f6e409e1eb913")
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
        return data
    except Exception as e:
        # If OpenWeather returns unauthorized or any client error, fall back to Open-Meteo (no key needed)
        msg = str(e)
        try:
            # httpx.HTTPStatusError has response attribute
            if hasattr(e, 'response') and getattr(e, 'response') is not None and getattr(e.response, 'status_code', None) == 401:
                # fall through to fallback
                pass
            else:
                # Other errors (network/timeouts) also try fallback
                pass
        except Exception:
            pass
        # Attempt Open-Meteo fallback
        try:
            return fetch_weather_open_meteo(location)
        except Exception as e2:
            raise ValueError(f"Weather API error: {e}; fallback error: {e2}")


def fetch_weather_open_meteo(location: Dict[str, float], days: int = 16) -> Dict[str, Any]:
    """Fallback to Open-Meteo public API. Returns a OneCall-like dict with `daily` entries.

    This provides free global forecasts (up to ~16 days) without an API key and is suitable
    as a fallback for small/remote places in India.
    """
    lat = location.get("lat")
    lon = location.get("lng") or location.get("lon")
    if lat is None or lon is None:
        raise ValueError("location requires lat and lng/lon")

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max",
        "hourly": "temperature_2m,relativehumidity_2m,precipitation,winddirection_10m,wind_speed_10m",
        "timezone": "auto",
        "forecast_days": days,
    }
    with httpx.Client(timeout=20.0) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        raw = resp.json()

    # Normalize to a minimal OneCall-like structure used by crop_advisories and farmer_report
    daily = []
    d = raw.get("daily", {})
    times = d.get("time", [])
    tmax = d.get("temperature_2m_max", [])
    tmin = d.get("temperature_2m_min", [])
    precip = d.get("precipitation_sum", [])
    windmax = d.get("windspeed_10m_max", [])

    for i, day in enumerate(times):
        entry = {
            "dt": day,
            "temp": {
                "min": float(tmin[i]) if i < len(tmin) else None,
                "max": float(tmax[i]) if i < len(tmax) else None,
            },
            "pop": 0.0,
            "wind_speed": float(windmax[i]) if i < len(windmax) else 0.0,
            "rain": float(precip[i]) if i < len(precip) else 0.0,
        }
        daily.append(entry)

        # Build a `current` object from hourly where possible
        current = {}
        try:
            hourly = raw.get("hourly", {})
            htime = hourly.get("time", [])
            if htime:
                # Use first available hourly entry as 'current'
                cur_idx = 0
                temp_h = hourly.get("temperature_2m", [])
                hum_h = hourly.get("relativehumidity_2m", [])
                wind_h = hourly.get("wind_speed_10m", []) or hourly.get("windspeed_10m", [])
                precip_h = hourly.get("precipitation", [])

                current = {
                    "dt": htime[cur_idx],
                    "temp": float(temp_h[cur_idx]) if cur_idx < len(temp_h) else None,
                    "feels_like": float(temp_h[cur_idx]) if cur_idx < len(temp_h) else None,
                    "humidity": int(hum_h[cur_idx]) if cur_idx < len(hum_h) else None,
                    "wind_speed": float(wind_h[cur_idx]) if cur_idx < len(wind_h) else 0.0,
                    "weather": [{"description": ""}],
                }
        except Exception:
            current = {"temp": None, "feels_like": None, "humidity": None, "wind_speed": 0.0, "weather": [{"description": ""}]}

        return {"source": "open-meteo", "daily": daily, "current": current, "raw": raw}


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


def _sum_precip(days: list, days_n: int = 7) -> float:
    total = 0.0
    for d in days[:days_n]:
        # OpenWeather uses 'rain' or 'pop' probabilities; prefer 'rain' mm if present
        r = d.get("rain") or d.get("rain", 0) or 0
        try:
            total += float(r)
        except Exception:
            # sometimes `rain` is dict for hourly; skip
            continue
    return round(total, 2)


def farmer_report(forecast: Dict[str, Any], crop: Optional[str] = None, horizon_days: int = 14) -> Dict[str, Any]:
    """Produce farmer-oriented summary from a OneCall-style forecast.

    Returns:
      - 7/14-day rainfall totals
      - heatwave/frost day counts
      - average windspeed and high-wind warnings
      - recommended irrigation pressure (simple heuristic)
      - daily condensed forecast (date, temp_min, temp_max, pop, wind_speed, rain)
    """
    out = {
        "horizon_days": horizon_days,
        "rain_7d_mm": 0.0,
        "rain_14d_mm": 0.0,
        "heat_days": 0,
        "frost_days": 0,
        "avg_wind_kmh": 0.0,
        "high_wind_days": 0,
        "daily": [],
        "irrigation_recommendation": "no_data",
    }

    daily = forecast.get("daily") or []
    # Ensure we have at least horizon_days entries in daily; clamp
    horizon = min(horizon_days, len(daily)) if daily else 0

    # Build condensed daily list
    wind_sum = 0.0
    wind_count = 0
    for i in range(horizon):
        d = daily[i]
        dt = d.get("dt")
        temp = d.get("temp") or {}
        tmin = temp.get("min") if temp else None
        tmax = temp.get("max") if temp else None
        pop = d.get("pop", 0.0)
        wind = d.get("wind_speed", 0.0)
        rain = d.get("rain", 0.0)

        # basic checks
        if tmax is not None and tmax >= 40:
            out["heat_days"] += 1
        if tmin is not None and tmin <= 2:
            out["frost_days"] += 1
        if wind and wind >= 10.0:
            out["high_wind_days"] += 1

        wind_sum += float(wind or 0.0)
        wind_count += 1

        out["daily"].append({
            "dt": dt,
            "temp_min": tmin,
            "temp_max": tmax,
            "pop": round(float(pop or 0.0), 2),
            "wind_speed_m_s": round(float(wind or 0.0), 2),
            "rain_mm": round(float(rain or 0.0), 2),
        })

    # Rain sums (use whatever rain fields are present)
    out["rain_7d_mm"] = _sum_precip(daily, days_n=min(7, len(daily)))
    out["rain_14d_mm"] = _sum_precip(daily, days_n=min(14, len(daily)))

    out["avg_wind_kmh"] = round((wind_sum / max(1, wind_count)) * 3.6, 2) if wind_count else 0.0

    # Simple irrigation heuristic:
    # - if upcoming 7d rain < 10mm and heat_days > 0 -> recommend irrigating soon
    # - if upcoming 7d rain > 30mm -> delay irrigation
    rain7 = out["rain_7d_mm"]
    if rain7 < 10 and out["heat_days"] > 0:
        out["irrigation_recommendation"] = "Irrigate within next 48 hours; upcoming week looks dry and hot."
    elif rain7 > 30:
        out["irrigation_recommendation"] = "Delay irrigation; substantial rainfall expected in next 7 days."
    else:
        out["irrigation_recommendation"] = "Monitor soil moisture; light rain expected."

    # Add crop-specific note (very basic)
    if crop:
        out["crop_note"] = f"For {crop}: monitor pests after heavy rain; adjust fertiliser if prolonged wet period."

    return out
