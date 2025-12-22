# KisanBuddy Backend Integration Examples

This document shows quick `curl` examples for new endpoints implemented for proximity-based mandi lookup, POI, and AgriStack stubs.

1) Agmarknet Nearby (Effective Price)

Request:

```bash
curl -X POST http://localhost:8080/api/agmarknet_nearby \
  -H "Content-Type: application/json" \
  -d '{
    "commodity": "Tomato",
    "location": {"lat": 17.3850, "lng": 78.4867},
    "radius_km": 100,
    "top_n": 5,
    "fuel_rate_per_ton_km": 0.06,
    "mandi_fees": 20.0
  }'
```

Response (example):

```json
{
  "nearby": [
    {"city":"Hyderabad","state":"Telangana","modal_price":1200.0,"distance_km":10.5,"effective_price":1189.7}
  ]
}
```

2) Vision POI (Percentage of Infection)

```bash
curl -X POST http://localhost:8080/api/vision_poi \
  -H "Content-Type: application/json" \
  -d '{ "image_base64": "<BASE64_IMAGE_DATA>" }'
```

Response (example):

```json
{
  "DLA": 12.5,
  "TLA": 100.0,
  "POI": 12.5,
  "stage": "low",
  "note": "heuristic"
}
```

3) AnthroKrishi UFSI Farmer verification (stub)

```bash
curl -X POST http://localhost:8080/api/anthrokrishi_parcel \
  -H "Content-Type: application/json" \
  -d '{ "plus_code": "7JR5V3R6+" }'
```

Or verify demo farmer via direct stub (new helper):

```python
from backend.services.anthrokrishi import verify_farmer_ufsi
print(verify_farmer_ufsi('FARMER12345'))
```

Notes:
- Geocoding uses Nominatim (OpenStreetMap) and includes a small persistent cache under `backend/tmp_geocache.json` to avoid rate limits.
- U2-Net and ViT are stubbed; place real PyTorch models under `backend/models/` and update loading code.

Uploading models and Cobra VAD WASM

You can upload U2-Net and ViT model files to the backend via `POST /api/upload_model` (multipart/form-data). Example:

```bash
curl -X POST http://localhost:8080/api/upload_model -F "file=@u2net.pth" -F "model_name=u2net.pth"
```

To provide Cobra VAD WASM for the frontend, use `POST /api/upload_cobra_wasm`:

```bash
curl -X POST http://localhost:8080/api/upload_cobra_wasm -F "file=@cobra_vad.wasm"
```

Earth Engine (optional)

To enable real NDVI/flood/drought analytics using Google Earth Engine, set `EE_SERVICE_ACCOUNT_JSON` to a local path containing your service account JSON file and ensure `earthengine-api` is installed in your environment. See `backend/services/earth_engine.py` for `init_earth_engine()` helper.

Uploading Earth Engine credentials via API

You can also upload a service account JSON directly to the backend and attempt initialization:

```bash
curl -X POST http://localhost:8080/api/upload_ee_service_account -F "file=@service-account.json"
```

The backend saves the file to `backend/ee_service_account.json` and attempts to initialize the Earth Engine API.

