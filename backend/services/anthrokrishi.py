from typing import Dict, Any
from s2sphere import CellId, LatLng

# AnthroKrishi access requires allowlisting. Provide stubs and local S2 computations.

def s2_cell_from_latlon(lat: float, lng: float, level: int = 13) -> str:
    ll = LatLng.from_degrees(lat, lng)
    cid = CellId.from_lat_lng(ll).parent(level)
    return str(cid.id())


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
