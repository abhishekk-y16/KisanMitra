import os
import httpx
from typing import List, Dict, Any, Optional
import pandas as pd
from datetime import datetime, timedelta

CEDA_BASE = os.getenv("CEDA_BASE", "https://api.ceda.ashoka.edu.in/v1")
CEDA_API_KEY = os.getenv("CEDA_API_KEY", "")

# Expected response schema: JSON array with City, Commodity, Min Prize, Max Prize, Date
# We'll normalize keys to snake_case: city, commodity, min_price, max_price, modal_price, date

async def _post_prices_async(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
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
            # Provide clearer error
            content = None
            try:
                content = e.response.text
            except Exception:
                content = str(e)
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
    return anyio.run(_post_prices_async, payload)


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
