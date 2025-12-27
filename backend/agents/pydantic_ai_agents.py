"""
Lightweight Pydantic AI agents for KisanBuddy.

Provides:
- `SoilCropSuitabilityAgent` - analyze soil data and recommend crops
- `DiseasePredictionAgent` - simple disease spread forecasting
- `PesticideSafetyAgent` - validate pesticide recommendations against whitelist
- `IntegratedFarmingAgent` - orchestrates the above agents

The implementations are intentionally self-contained and do not require
external AI SDKs to run; they will use `google.generativeai` if available
but degrade gracefully when it's not.
"""

from __future__ import annotations

import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from pydantic import BaseModel, Field

try:
    import google.generativeai as genai
except Exception:
    genai = None

logger = logging.getLogger(__name__)


class SoilParameter(BaseModel):
    name: str
    value: Optional[float] = None
    unit: Optional[str] = None
    status: str = Field("unknown")
    interpretation: str = Field("")
    recommendation: Optional[str] = None


class SoilProfile(BaseModel):
    lab_name: Optional[str] = None
    report_date: Optional[str] = None
    location: Optional[str] = None
    parameters: List[SoilParameter] = Field(default_factory=list)
    soil_texture: str = Field("Unknown")
    overall_fertility: str = Field("Medium")


class CropSuitability(BaseModel):
    crop_name: str
    suitability_score: float = Field(..., ge=0, le=100)
    reason: str
    limiting_factors: List[str] = Field(default_factory=list)
    fertilizer_recommendations: Dict[str, str] = Field(default_factory=dict)


class CropRecommendationPlan(BaseModel):
    primary_crop: CropSuitability
    alternative_crops: List[CropSuitability] = Field(default_factory=list)
    rotation_plan: List[str] = Field(default_factory=list)
    soil_amendments_needed: List[str] = Field(default_factory=list)
    estimated_yield_improvement: str = Field("")
    risk_factors: List[str] = Field(default_factory=list)


class DiseaseSpreadForecast(BaseModel):
    disease_name: str
    current_severity: float
    predicted_spread_rate: float
    days_until_critical: float
    optimal_intervention_window: str
    weather_risk_factors: List[str] = Field(default_factory=list)
    confidence: float


class SafeChemical(BaseModel):
    chemical_name: str
    active_ingredient: Optional[str] = None
    application_timing: str = Field(...)
    application_method: str = Field(...)
    safety_score: float = Field(..., ge=0, le=100)
    phi_days: int = 0


class SafetyValidationResult(BaseModel):
    original_recommendation: str
    validation_status: str
    safe_alternatives: List[SafeChemical] = Field(default_factory=list)
    risk_warnings: List[str] = Field(default_factory=list)
    conditions_for_approval: List[str] = Field(default_factory=list)


class SoilCropSuitabilityAgent:
    """Analyze soil data and recommend crops.

    This agent is intentionally deterministic and rule-based so it runs
    reliably in the competition environment. It returns structured
    `CropRecommendationPlan` objects.
    """

    CROP_DB = {
        "Rice": {"ph_range": (5.5, 7.5), "texture": ["Loamy", "Clay"]},
        "Wheat": {"ph_range": (6.0, 7.5), "texture": ["Loamy", "Clay"]},
        "Maize": {"ph_range": (6.0, 7.5), "texture": ["Loamy", "Sandy"]},
        "Tomato": {"ph_range": (6.0, 7.0), "texture": ["Loamy"]},
        "Cotton": {"ph_range": (6.0, 8.0), "texture": ["Loamy", "Sandy"]},
    }

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if genai and self.api_key:
            try:
                genai.configure(api_key=self.api_key)
            except Exception:
                logger.debug("genai configure failed, continuing without it")

    def analyze_soil_suitability(self, soil_data: Dict[str, Any]) -> CropRecommendationPlan:
        profile = self._build_soil_profile(soil_data)
        matches = self._match_crops(profile)
        ranked = self._rank_crops(matches, profile)
        plan = self._generate_plan(ranked, profile)
        return plan

    def _build_soil_profile(self, soil_data: Dict[str, Any]) -> SoilProfile:
        params = soil_data.get("parameters", {})
        soil_params: List[SoilParameter] = []

        ph = params.get("ph")
        if ph is not None:
            if 6.0 <= ph <= 7.5:
                status = "optimal"
                interpretation = "Good pH for most crops"
            elif ph < 6.0:
                status = "low"
                interpretation = "Acidic - consider liming"
            else:
                status = "high"
                interpretation = "Alkaline - monitor micronutrients"
            soil_params.append(SoilParameter(name="pH", value=float(ph), status=status, interpretation=interpretation))

        for key, display in [("nitrogen_n", "Nitrogen"), ("phosphorus_p", "Phosphorus"), ("potassium_k", "Potassium")]:
            val = params.get(key)
            if val is not None:
                try:
                    f = float(val)
                except Exception:
                    continue
                status = "optimal" if f >= 100 else "low"
                soil_params.append(SoilParameter(name=display, value=f, unit="kg/ha", status=status, interpretation=f"{display} level"))

        # Coerce None or missing soil_texture to a safe default string to satisfy Pydantic
        texture = soil_data.get("soil_texture") or "Unknown"
        return SoilProfile(lab_name=soil_data.get("lab_name"), report_date=soil_data.get("report_date"), location=soil_data.get("village"), parameters=soil_params, soil_texture=texture)

    def _match_crops(self, profile: SoilProfile) -> List[Dict[str, Any]]:
        ph_val = next((p.value for p in profile.parameters if p.name == "pH"), 7.0)
        matches = []
        for crop, req in self.CROP_DB.items():
            score = 0
            reasons = []
            if req["ph_range"][0] <= ph_val <= req["ph_range"][1]:
                score += 40
                reasons.append("pH suitable")
            else:
                reasons.append("pH not ideal")
            if profile.soil_texture in req.get("texture", []):
                score += 30
                reasons.append("texture matches")
            matches.append({"crop": crop, "score": score, "reasons": reasons, "requirements": req})
        return sorted(matches, key=lambda x: x["score"], reverse=True)

    def _rank_crops(self, matches: List[Dict[str, Any]], profile: SoilProfile) -> List[CropSuitability]:
        ranked: List[CropSuitability] = []
        for m in matches[:4]:
            recs = {"Overall": "Follow standard NPK schedule"}
            limiting = []
            if m["score"] < 50:
                limiting.append("Soil requires amendments for optimal yield")
            ranked.append(CropSuitability(crop_name=m["crop"], suitability_score=m["score"], reason="; ".join(m["reasons"]), limiting_factors=limiting, fertilizer_recommendations=recs))
        return ranked

    def _generate_plan(self, ranked: List[CropSuitability], profile: SoilProfile) -> CropRecommendationPlan:
        primary = ranked[0] if ranked else CropSuitability(crop_name="Unknown", suitability_score=0, reason="Insufficient data", limiting_factors=[], fertilizer_recommendations={})
        alternatives = ranked[1:4] if len(ranked) > 1 else []
        amendments = [p.recommendation for p in profile.parameters if p.recommendation] if any(p.recommendation for p in profile.parameters) else []
        return CropRecommendationPlan(primary_crop=primary, alternative_crops=alternatives, rotation_plan=[alt.crop_name for alt in alternatives], soil_amendments_needed=amendments, estimated_yield_improvement="~20% with recommended amendments")


class DiseasePredictionAgent:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if genai and self.api_key:
            try:
                genai.configure(api_key=self.api_key)
            except Exception:
                logger.debug("genai unavailable")

    def predict_disease_spread(self, disease_name: str, current_poi: float, location: Dict[str, float], crop: str, weather_data: Optional[Dict[str, Any]] = None) -> DiseaseSpreadForecast:
        base_rates = {"Late Blight": 8.0, "Early Blight": 3.0, "Rust": 4.0}
        base = base_rates.get(disease_name, 3.0)
        multiplier = 1.0
        risk_factors: List[str] = []
        if weather_data:
            hum = weather_data.get("humidity", 50)
            rain = weather_data.get("rain_probability", 0)
            if hum > 80:
                multiplier *= 1.3
                risk_factors.append(f"High humidity ({hum}%)")
            if rain > 50:
                multiplier *= 1.2
                risk_factors.append(f"Rain likely ({rain}%)")
        rate = base * multiplier
        remaining = max(0.0, 70.0 - current_poi)
        days = remaining / rate if rate > 0 else 999.0
        return DiseaseSpreadForecast(disease_name=disease_name, current_severity=current_poi, predicted_spread_rate=round(rate, 2), days_until_critical=max(1.0, round(days, 1)), optimal_intervention_window=("IMMEDIATE" if days < 2 else "SOON" if days < 7 else "MONITOR"), weather_risk_factors=risk_factors, confidence=0.7)


class PesticideSafetyAgent:
    def __init__(self):
        # attempt to load whitelist from services; degrade to empty dict
        try:
            from services.chemical_whitelist import CHEMICAL_WHITELIST
            self.whitelist = CHEMICAL_WHITELIST
        except Exception:
            self.whitelist = {}

    def validate_pesticide(self, chemical_name: str, crop: str, weather_data: Optional[Dict[str, Any]] = None, days_to_harvest: int = 30) -> SafetyValidationResult:
        name = chemical_name.strip()
        if name not in self.whitelist:
            # return organic alternatives when available
            alts = []
            try:
                from services.chemical_whitelist import get_organic_alternatives
                organics = get_organic_alternatives(crop)
                for o in organics[:3]:
                    alts.append(SafeChemical(chemical_name=o.get("name", "Organic"), active_ingredient=o.get("active_ingredient", ""), application_timing="Follow label", application_method=o.get("method", "Foliar"), safety_score=95, phi_days=0))
            except Exception:
                pass
            return SafetyValidationResult(original_recommendation=name, validation_status="rejected", safe_alternatives=alts, risk_warnings=[f"{name} not in whitelist"]) 

        data = self.whitelist.get(name, {})
        phi = data.get("phi_days", 7)
        if days_to_harvest < phi:
            return SafetyValidationResult(original_recommendation=name, validation_status="requires_timing", safe_alternatives=[], risk_warnings=[f"PHI {phi} days not met"]) 

        # weather check
        warnings: List[str] = []
        if weather_data:
            rp = weather_data.get("rain_probability", 0)
            if rp > 40 and not data.get("rain_safe", False):
                warnings.append(f"Rain likely ({rp}%) - consider deferring application")

        status = "approved" if not warnings else "requires_conditions"
        return SafetyValidationResult(original_recommendation=name, validation_status=status, safe_alternatives=[], risk_warnings=warnings)


class IntegratedFarmingAgent:
    def __init__(self):
        self.soil_agent = SoilCropSuitabilityAgent()
        self.disease_agent = DiseasePredictionAgent()
        self.safety_agent = PesticideSafetyAgent()

    def comprehensive_farm_analysis(self, soil_data: Dict[str, Any], disease_info: Optional[Dict[str, Any]] = None, location: Optional[Dict[str, float]] = None, weather_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        out: Dict[str, Any] = {"timestamp": datetime.utcnow().isoformat(), "analyses": {}}
        try:
            out["analyses"]["soil_and_crops"] = self.soil_agent.analyze_soil_suitability(soil_data).dict()
        except Exception as e:
            out["analyses"]["soil_and_crops"] = {"error": str(e)}

        if disease_info and location:
            try:
                fc = self.disease_agent.predict_disease_spread(disease_info.get("name", "Unknown"), disease_info.get("severity", 10.0), location, soil_data.get("crop", ""), weather_data=weather_data)
                out["analyses"]["disease_forecast"] = fc.dict()
            except Exception as e:
                out["analyses"]["disease_forecast"] = {"error": str(e)}

        return out
