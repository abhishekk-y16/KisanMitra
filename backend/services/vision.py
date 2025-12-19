"""
Vision Diagnostic Service
Uses Google Gemini or Groq for AI-powered crop disease detection.
Supports multilingual output (Hindi, Kannada, Telugu, Tamil, Marathi, Punjabi, Bengali, Gujarati).
"""
import base64
import hashlib
import os
import json
import httpx
from typing import Dict, Any, Optional

# API Configuration - Supports both Gemini and Groq
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_DEFAULT_MODEL = "groq/compound"

def get_gemini_api_key() -> str:
    """Get Gemini API key from environment."""
    return os.getenv("GEMINI_API_KEY", "")

def get_groq_api_key() -> str:
    """Get Groq API key from environment."""
    return os.getenv("GROQ_API_KEY", "")

# Supported Indian languages for farmers
SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "Hindi (हिंदी)",
    "kn": "Kannada (ಕನ್ನಡ)",
    "te": "Telugu (తెలుగు)",
    "ta": "Tamil (தமிழ்)",
    "mr": "Marathi (मराठी)",
    "pa": "Punjabi (ਪੰਜਾਬੀ)",
    "bn": "Bengali (বাংলা)",
    "gu": "Gujarati (ગુજરાતી)",
    "or": "Odia (ଓଡ଼ିଆ)",
}

DIAGNOSIS_PROMPT = """
You are an expert plant pathologist and agricultural advisor. Analyze the provided leaf image carefully and RETURN ONLY A SINGLE VALID JSON OBJECT. The JSON MUST follow the required top-level keys below; additionally include an `extra` object with extended actionable details for advisors and advanced users. Do not output any explanatory text outside the JSON object.

Top-level required keys (farmer-facing, concise):
- `diagnosis`: short disease/pest name or `Unknown` (string)
- `diagnosisHindi`: short Hindi translation if available else empty string
- `crop`: crop name or `Unknown` (string)
- `confidence`: float between 0.0 and 1.0 (estimate likelihood)
- `severity`: one of `low`, `medium`, `high`
- `isHealthy`: boolean
- `symptoms`: array of short symptom phrases (strings)
- `treatment`: object with keys `immediateActions`, `organicRemedies`, `futurePrevention` (each an array of short actionable steps in farmer-friendly language)
- `warnings`: array of short warning strings (safety, regulatory notes)

Additional optional keys (helpful but not required):
- `diagnosisRegional`: regional/localized string
- `extra`: object with structured extended details for agronomists (see schema below)

`extra` schema (include where available):
{
    "likely_cause": "brief cause hypothesis",
    "disease_stage": "early|mid|late|unknown",
    "affected_parts": ["leaves","stems","fruits",...],
    "spread_risk": "low|medium|high",
    "confidence_breakdown": {"symptoms":0.0,"image_quality":0.0,"pattern_match":0.0},
    "chemical_recommendations": [{"active_ingredient":"string","example_tradenames":["name"],"dosage":"e.g. 2g/l","application_interval":"days","pre_harvest_interval_days":int,"safety_notes":"string"}],
    "monitoring_actions": ["string"],
    "soil_irrigation_advice": "string",
    "environmental_triggers": ["high_humidity","recent_rain","cool_temperatures"],
    "estimated_yield_loss_pct": {"min":0,"max":0},
    "recommended_followup": ["take underside photo","send sample to lab"],
    "images_notes": "notes about image quality or suggested additional photos",
    "references": ["https://..."],
}

Formatting and behavior rules:
- Output MUST be valid JSON parsable by `json.loads()` (no trailing commas, no markdown code fences).
- Keep farmer-facing strings short and practical (1-2 short sentences max per item).
- Provide Hindi translations in `diagnosisHindi` when possible and include translations in `extra.localized` if available.
- Provide numeric `confidence` and a short `confidence_breakdown` inside `extra` explaining major evidence contributors.
- If uncertain, set `confidence` low (<0.6), set `severity` conservatively, and add a `warnings` entry explaining uncertainty.
- For chemical recommendations, include safety notes and `pre_harvest_interval_days` when relevant.
- If image quality is poor, set `confidence` lower and include concrete `images_notes` suggesting retake instructions (angle, lighting, underside, include scale).
- Keep overall JSON size reasonable; avoid long prose. Use lists of short steps.

Be concise and precise. Return only the JSON object.
"""

# Groq-specific prompt (uses same schema but tailored language for Groq/LLM-vision)
GROQ_PROMPT = """
You are an expert plant pathologist and agricultural advisor. Analyze the given image and RETURN ONLY A SINGLE VALID JSON OBJECT. The top-level keys MUST include `diagnosis`, `crop`, `confidence`, `severity`, `isHealthy`, `symptoms`, `treatment` (with `immediateActions`, `organicRemedies`, `futurePrevention`), and `warnings`. You may include optional keys such as `diagnosis_localized` and an `extra` object for extended actionable details (see DIAGNOSIS_PROMPT for `extra` schema).

Rules:
- Output must be strict JSON (no surrounding commentary, no code fences).
- Provide concise farmer-facing instructions in the `treatment` arrays.
- Provide `confidence` as a float [0.0-1.0]. If uncertain, lower confidence and add a warning.
- If you include chemical recommendations inside `extra.chemical_recommendations`, include `active_ingredient`, `dosage`, `application_interval`, and `pre_harvest_interval_days` along with `safety_notes`.
- If image quality limits diagnosis, include `images_notes` and recommend follow-up photos.

Return only the JSON object.
"""


def _call_groq_api(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en") -> Dict[str, Any]:
    """Call Groq API for image analysis using Llama Vision."""
    
    api_key = get_groq_api_key()
    if not api_key:
        raise ValueError("GROQ_API_KEY not configured")
    
    # Prepare the prompt with language context
    language_name = SUPPORTED_LANGUAGES.get(language, "English")
    # Use Groq-specific prompt constant
    prompt = GROQ_PROMPT
    if language != "en":
        prompt += f"\n\nAlso provide key information in {language_name} for better understanding by local farmers."
    
    # Prepare request payload for Groq (OpenAI-compatible format)
    # Groq expects `messages[].content` to be a string. Provide the prompt followed by
    # either an inline data URL for the image or a short image URL.
    if image_url:
        content_str = prompt + "\n\n[IMAGE_URL]\n" + image_url
    else:
        content_str = prompt + "\n\n[IMAGE_DATA]\n" + f"data:image/jpeg;base64,{image_base64}"
    payload = {
        "model": GROQ_DEFAULT_MODEL,
        "messages": [
            {
                "role": "user",
                "content": content_str
            }
        ],
        "temperature": 0.4,
        "max_tokens": 4096,
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    
    print(f"[Groq] Calling API with key: {api_key[:10]}...")  # Debug log

    with httpx.Client(timeout=60.0) as client:
        response = client.post(GROQ_API_URL, json=payload, headers=headers)
        print(f"[Groq] Response status: {response.status_code}")  # Debug log
        # Dump response body for debugging when non-200 or empty
        try:
            text = response.text
            if response.status_code != 200:
                print(f"[Groq] Non-200 response body: {text[:200]}...")
            else:
                # also print a short preview of the successful body
                print(f"[Groq] Response body preview: {text[:300]}...")
        except Exception as e:
            print(f"[Groq] Could not read response text: {e}")

        response.raise_for_status()
        return response.json()


def _parse_groq_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Groq API response and extract diagnosis data."""
    try:
        # Extract text from response (OpenAI format)
        choices = response.get("choices", [])
        if not choices:
            raise ValueError("No response choices")

        raw_content = choices[0].get("message", {}).get("content", "")

        # `raw_content` may be a string containing JSON or already a dict
        if isinstance(raw_content, dict):
            data = raw_content
        else:
            text = str(raw_content).strip()
            # Remove common markdown wrappers
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            data = json.loads(text)
        
        # Validate and normalize the response
        # Normalize fields with fallback keys used in GROQ_PROMPT
        diagnosis = data.get("diagnosis") or data.get("diagnosis_local") or data.get("disease") or "Unknown Condition"
        diagnosis_hindi = data.get("diagnosisHindi") or data.get("diagnosis_local") or data.get("diagnosis_localized") or ""
        diagnosis_regional = data.get("diagnosisRegional") or data.get("diagnosis_regional") or ""
        crop_name = data.get("crop") or data.get("crop_name") or "Unknown"
        confidence = data.get("confidence", 0.5)
        try:
            confidence = float(confidence)
        except Exception:
            confidence = 0.5
        confidence = min(max(confidence, 0.0), 1.0)

        severity = data.get("severity", "medium")
        if severity not in ["low", "medium", "high"]:
            severity = "medium"

        is_healthy = data.get("isHealthy", data.get("is_healthy", False))

        # symptoms may be under `symptoms` or `observations`
        symptoms = data.get("symptoms") or data.get("observations") or []

        # treatment normalization: try to extract immediateActions/organicRemedies/futurePrevention
        treatment = data.get("treatment") or {}
        immediate = treatment.get("immediateActions") or treatment.get("urgent_actions") or []
        organic = treatment.get("organicRemedies") or treatment.get("organic_remedies") or []
        future = data.get("prevention") or treatment.get("futurePrevention") or treatment.get("prevention") or []

        result = {
            "diagnosis": diagnosis,
            "diagnosisHindi": diagnosis_hindi,
            "diagnosisRegional": diagnosis_regional,
            "crop": crop_name,
            "confidence": confidence,
            "severity": severity,
            "isHealthy": bool(is_healthy),
            "symptoms": symptoms,
            "treatment": {
                "immediateActions": immediate,
                "organicRemedies": organic,
                "futurePrevention": future,
            },
            "warnings": data.get("warnings", [])
        }
        
        # Ensure treatment has all required fields
        if "immediateActions" not in result["treatment"]:
            result["treatment"]["immediateActions"] = []
        if "organicRemedies" not in result["treatment"]:
            result["treatment"]["organicRemedies"] = []
        if "futurePrevention" not in result["treatment"]:
            result["treatment"]["futurePrevention"] = []
        
        return result
        
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse Groq response as JSON: {e}")
    except Exception as e:
        raise ValueError(f"Error processing Groq response: {e}")


def _call_gemini_api(image_base64: str, language: str = "en") -> Dict[str, Any]:
    """Call Google Gemini API for image analysis."""
    
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    
    # Prepare the prompt with language context
    language_name = SUPPORTED_LANGUAGES.get(language, "English")
    prompt = DIAGNOSIS_PROMPT
    if language != "en":
        prompt += f"\n\nAlso provide key information in {language_name} for better understanding by local farmers."
    
    # Prepare request payload
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image_base64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.4,
            "topK": 32,
            "topP": 1,
            "maxOutputTokens": 4096,
        }
    }
    
    headers = {
        "Content-Type": "application/json",
    }
    
    url = f"{GEMINI_API_URL}?key={api_key}"
    
    print(f"[Gemini] Calling API with key: {api_key[:10]}...")  # Debug log
    
    with httpx.Client(timeout=60.0) as client:
        response = client.post(url, json=payload, headers=headers)
        print(f"[Gemini] Response status: {response.status_code}")  # Debug log
        response.raise_for_status()
        return response.json()


def _parse_gemini_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Gemini API response and extract diagnosis data."""
    try:
        # Extract text from response
        candidates = response.get("candidates", [])
        if not candidates:
            raise ValueError("No response candidates")
        
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise ValueError("No response parts")
        
        text = parts[0].get("text", "")
        
        # Clean up the response - remove markdown code blocks if present
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        # Parse JSON
        data = json.loads(text)
        
        # Validate and normalize the response
        result = {
            "diagnosis": data.get("diagnosis", "Unknown Condition"),
            "diagnosisHindi": data.get("diagnosisHindi", ""),
            "diagnosisRegional": data.get("diagnosisRegional", ""),
            "crop": data.get("crop", "Unknown"),
            "confidence": min(max(float(data.get("confidence", 0.5)), 0.0), 1.0),
            "severity": data.get("severity", "medium") if data.get("severity") in ["low", "medium", "high"] else "medium",
            "isHealthy": data.get("isHealthy", False),
            "symptoms": data.get("symptoms", []),
            "treatment": data.get("treatment", {
                "immediateActions": [],
                "organicRemedies": [],
                "futurePrevention": []
            }),
            "warnings": data.get("warnings", [])
        }
        
        # Ensure treatment has all required fields
        if "immediateActions" not in result["treatment"]:
            result["treatment"]["immediateActions"] = []
        if "organicRemedies" not in result["treatment"]:
            result["treatment"]["organicRemedies"] = []
        if "futurePrevention" not in result["treatment"]:
            result["treatment"]["futurePrevention"] = []
        
        return result
        
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse Gemini response as JSON: {e}")
    except Exception as e:
        raise ValueError(f"Error processing Gemini response: {e}")


def diagnose_leaf(image_base64: Optional[str] = None, image_url: Optional[str] = None, crop: Optional[str] = None, language: str = "en", nonce: Optional[int] = None) -> Dict[str, Any]:
    """
    Diagnose leaf disease from base64-encoded image using Groq or Gemini AI.
    Tries Groq first (better free tier), falls back to Gemini.
    
    Args:
        image_base64: Base64 encoded image data
        crop: Optional crop type hint
        language: Language code for regional output (en, hi, kn, te, ta, mr, pa, bn, gu, or)
    
    Returns:
        Diagnosis result with disease info, symptoms, and treatment recommendations
    """
    try:
        # Validate image or image_url
        image_sha = None
        if image_url:
            # We received a URL to a previously uploaded image; log URL for tracing
            print(f"[Vision] Request nonce: {nonce}, image_url: {image_url}")
        else:
            try:
                base64.b64decode(image_base64 or '')
            except Exception:
                return {
                    "diagnosis": "Invalid Image",
                    "diagnosisHindi": "अमान्य छवि",
                    "confidence": 0.0,
                    "severity": "low",
                    "crop": "Unknown",
                    "symptoms": [],
                    "treatment": {
                        "immediateActions": [],
                        "organicRemedies": [],
                        "futurePrevention": []
                    },
                    "warnings": ["Could not decode image. Please upload a valid image file."]
                }
            # Compute image SHA256 for request tracing
            try:
                decoded = base64.b64decode(image_base64 or '')
                image_sha = hashlib.sha256(decoded).hexdigest()
            except Exception:
                image_sha = None
            print(f"[Vision] Request nonce: {nonce}, image_sha256: {image_sha}")

        # Try Groq first (better free tier limits)
        groq_key = get_groq_api_key()
        gemini_key = get_gemini_api_key()
        
        print(f"[Vision] Groq API Key configured: {bool(groq_key)}")
        print(f"[Vision] Gemini API Key configured: {bool(gemini_key)}")
        
        if groq_key:
            try:
                print("[Vision] Trying Groq API...")
                response = _call_groq_api(image_base64=image_base64, image_url=image_url, language=language)
                result = _parse_groq_response(response)
                print("[Vision] Groq API success!")
                if crop:
                    result["crop"] = crop
                return result
            except Exception as e:
                print(f"[Vision] Groq API failed: {e}")
                # Fall through to try Gemini
        
        if gemini_key:
            try:
                print("[Vision] Trying Gemini API...")
                response = _call_gemini_api(image_base64, language)
                result = _parse_gemini_response(response)
                print("[Vision] Gemini API success!")
                if crop:
                    result["crop"] = crop
                return result
            except Exception as e:
                print(f"[Vision] Gemini API failed: {e}")
                return _get_demo_response(crop, error=str(e))
        
        # No API keys configured
        return _get_demo_response(crop)
        
    except Exception as e:
        print(f"Diagnosis error: {e}")
        return _get_demo_response(crop, error=str(e))


def _get_demo_response(crop: Optional[str] = None, error: Optional[str] = None) -> Dict[str, Any]:
    """Return a demo response when API is not available."""
    warnings = []
    if error:
        warnings.append(f"AI service temporarily unavailable. Showing demo data. ({error})")
    else:
        warnings.append("Demo mode: Configure GROQ_API_KEY or GEMINI_API_KEY for real AI diagnosis.")
    
    return {
        "diagnosis": "Late Blight (Phytophthora infestans)",
        "diagnosisHindi": "आलू का झुलसा रोग (फाइटोफ्थोरा इन्फेस्टन्स)",
        "crop": crop or "Potato / Tomato",
        "confidence": 0.88,
        "severity": "high",
        "isHealthy": False,
        "symptoms": [
            "Water-soaked lesions on leaves that turn brown/black",
            "White fuzzy growth on underside of leaves in humid conditions",
            "Rapidly spreading brown patches on stems",
            "Dark brown to purple-black lesions on tubers",
            "Foul smell from infected plant parts"
        ],
        "treatment": {
            "immediateActions": [
                "Remove and destroy all infected plant parts immediately",
                "Apply copper-based fungicide (Bordeaux mixture)",
                "Increase spacing between plants for air circulation",
                "Avoid overhead irrigation to reduce leaf wetness"
            ],
            "organicRemedies": [
                "Spray neem oil solution (5ml per liter of water)",
                "Apply baking soda spray (1 tbsp per gallon of water)",
                "Use compost tea as foliar spray to boost immunity",
                "Mulch with straw to prevent soil splash"
            ],
            "futurePrevention": [
                "Plant certified disease-free seeds/tubers",
                "Choose resistant varieties (Kufri Jyoti, Kufri Badshah)",
                "Practice 3-year crop rotation",
                "Monitor weather forecasts - disease spreads in cool, wet conditions",
                "Maintain field sanitation and remove volunteer plants"
            ]
        },
        "warnings": warnings
    }
