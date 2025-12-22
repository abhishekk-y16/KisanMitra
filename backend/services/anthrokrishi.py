from typing import Dict, Any, Optional
from s2sphere import CellId, LatLng
import random

# AnthroKrishi access requires allowlisting. Provide stubs and local S2 computations.


def s2_cell_from_latlon(lat: float, lng: float, level: int = 13) -> str:
    """Return S2 CellId integer string for given lat/lng at requested level.

    For this project we support levels up to 17 (approx ~70m edge length).
    """
    ll = LatLng.from_degrees(lat, lng)
    cid = CellId.from_lat_lng(ll).parent(level)
    return str(cid.id())


def s2_token_from_latlon(lat: float, lng: float, level: int = 17) -> Dict[str, Any]:
    """Return a human-friendly S2 token and metadata for UI mapping at L17."""
    cell_id = s2_cell_from_latlon(lat, lng, level=level)
    return {"s2_cell": cell_id, "level": level, "approx_resolution": "~70m"}


def query_parcel_by_plus_code(plus_code: str) -> Dict[str, Any]:
    # Placeholder until official allowlisted API handshake is configured
    return {
        "s2_cell": "PENDING_ALLOWLIST",
        "features": {
            "resolution": "1m",
            "source": "ALU/AMED",
            "plus_code": plus_code,
            "status": "allowlist_pending",
        },
    }


def verify_farmer_ufsi(farmer_id: str) -> Dict[str, Any]:
    """Stub for AgriStack UFSI Farmer verification.

    Returns a simulated Record of Rights (RoR) and Crop Sown Registry sample.
    In production this will perform an authenticated query to AgriStack endpoints
    with appropriate consent and allowlisting.
    """
    # Simulate some plausible fields
    parcels = []
    for i in range(1, random.randint(1, 3) + 1):
        parcels.append({
            "parcel_id": f"PAR-{farmer_id[:6]}-{i}",
            "s2_cell": s2_cell_from_latlon(14.0 + random.random(), 77.0 + random.random(), level=17),
            "acreage": round(0.2 + random.random() * 1.5, 2),
            "crop_sown": random.choice(["Maize", "Tomato", "Wheat", "Rice"]),
            "status": "registered",
        })

    return {
        "farmer_id": farmer_id,
        "name": "Demo Farmer",
        "roR": {"document_id": f"ROR-{farmer_id[:8]}", "verified": True},
        "parcels": parcels,
    }
