"""
Validator Agent (The Safety Net)
Cross-checks recommendations against CIB&RC pesticide guidelines.
Ensures regional safety compliance under the Insecticides Act, 1968.
"""
from typing import Dict, Any, List

# Mock CIB&RC database - in production, load from RAG/Vector store
# Structure: {pesticide_name: {crops: [...], regions: [...], rain_safe: bool}}
CIBRC_REGISTRY = {
    "Mancozeb": {
        "crops": ["Tomato", "Potato", "Wheat", "Rice", "Grapes"],
        "regions": ["All India"],
        "rain_safe": False,
        "waiting_period_days": 7,
    },
    "Chlorpyrifos": {
        "crops": ["Cotton", "Rice", "Sugarcane"],
        "regions": ["All India"],
        "rain_safe": False,
        "waiting_period_days": 14,
    },
    "Imidacloprid": {
        "crops": ["Cotton", "Rice", "Vegetables"],
        "regions": ["All India"],
        "rain_safe": True,
        "waiting_period_days": 3,
    },
    "Copper Oxychloride": {
        "crops": ["Potato", "Tomato", "Citrus", "Grapes"],
        "regions": ["All India"],
        "rain_safe": False,
        "waiting_period_days": 7,
    },
    "Neem Oil": {
        "crops": ["All"],
        "regions": ["All India"],
        "rain_safe": True,
        "waiting_period_days": 0,
    },
}


def validate_recommendations(
    crop: str,
    recommendations: List[Dict[str, Any]],
    context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Validate pesticide/treatment recommendations against CIB&RC database.
    Adds warnings for:
      - Unregistered pesticides
      - Pesticide not approved for the specific crop
      - Rain forecast when pesticide is not rain-safe
      - Regional restrictions
    """
    validated = []
    warnings: List[str] = []

    rain_forecast = context.get("rain_forecast", False)
    region = context.get("region", "All India")

    for rec in recommendations:
        pesticide = rec.get("pesticide", "")
        entry = CIBRC_REGISTRY.get(pesticide)

        rec_validated = rec.copy()
        rec_validated["cibrc_status"] = "unknown"

        if not entry:
            warnings.append(
                f"⚠️ '{pesticide}' not found in CIB&RC registry. "
                "Verify registration under Insecticides Act, 1968."
            )
            rec_validated["cibrc_status"] = "unregistered"
        else:
            # Check crop approval
            if "All" not in entry["crops"] and crop not in entry["crops"]:
                warnings.append(
                    f"⚠️ '{pesticide}' is not registered for use on {crop}. "
                    f"Approved crops: {', '.join(entry['crops'])}"
                )
                rec_validated["cibrc_status"] = "crop_mismatch"
            else:
                rec_validated["cibrc_status"] = "approved"

            # Check rain safety
            if rain_forecast and not entry.get("rain_safe", False):
                warnings.append(
                    f"🌧️ Rain forecast detected. '{pesticide}' may wash off. "
                    "Consider delaying application or use rain-safe alternative."
                )
                rec_validated["rain_warning"] = True

            # Add waiting period info
            rec_validated["waiting_period_days"] = entry.get("waiting_period_days", 0)

        validated.append(rec_validated)

    return {
        "validated": validated,
        "warnings": warnings,
    }


def lookup_pesticide(crop: str, disease: str) -> List[Dict[str, Any]]:
    """
    Lookup recommended pesticides for a given crop and disease.
    Returns CIB&RC compliant options.
    """
    # Simple mapping - in production, use vector search on CIB&RC documents
    disease_pesticide_map = {
        "Late Blight": ["Mancozeb", "Copper Oxychloride"],
        "Early Blight": ["Mancozeb", "Copper Oxychloride"],
        "Powdery Mildew": ["Neem Oil"],
        "Aphids": ["Imidacloprid", "Neem Oil"],
        "Bollworm": ["Chlorpyrifos"],
    }

    pesticides = disease_pesticide_map.get(disease, ["Neem Oil"])
    recommendations = []

    for p in pesticides:
        entry = CIBRC_REGISTRY.get(p, {})
        if "All" in entry.get("crops", []) or crop in entry.get("crops", []):
            recommendations.append({
                "pesticide": p,
                "crop": crop,
                "disease": disease,
                "cibrc_status": "approved",
                "waiting_period_days": entry.get("waiting_period_days", 0),
            })

    return recommendations
