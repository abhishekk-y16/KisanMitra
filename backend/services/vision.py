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
from io import BytesIO
try:
    from PIL import Image
    PIL_AVAILABLE = True
except Exception:
    PIL_AVAILABLE = False

try:
    import torch
    TORCH_AVAILABLE = True
except Exception:
    TORCH_AVAILABLE = False

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


# Focused prompt for crop detection queries (returns only crop and confidence)
CROP_PROMPT = """
You are an expert in identifying crop species from a single leaf or plant image. Return ONLY a JSON object with two keys: `crop` (a short crop name like Tomato, Potato, Rice, Wheat, Maize, Chillies, Okra, etc.) and `confidence` (a float between 0.0 and 1.0). Do not include any other keys or commentary.
Example valid output: {"crop": "Tomato", "confidence": 0.92}
If unsure, set `crop` to "Unknown" and `confidence` to a low value.
"""


# Pixel-level, exhaustive plant analysis prompt
PIXEL_PROMPT = """
You are an expert plant pathologist and agronomist. Perform a pixel-to-pixel visual analysis of the provided image and return ONE STRICT JSON OBJECT (no surrounding text) following the schema below. Be exhaustive, precise, and concise. Use measured estimates when possible. If uncertain about any field, provide conservative values and note uncertainty in `warnings`.

Required top-level keys:
- `diagnosis`: short disease/pest name or `Unknown` (string)
- `crop`: crop name (string)
- `confidence`: float 0.0-1.0
- `severity`: one of `low|medium|high`
- `isHealthy`: boolean
- `symptoms`: array of short symptom strings
- `affected_parts`: array (e.g., ["leaves","stems","fruits"])
- `confidence_breakdown`: object with numeric contributions (e.g. {"symptoms":0.6,"image_quality":0.2,"pattern_match":0.2})
- `treatment`: object with `immediateActions`,`organicRemedies`,`futurePrevention` arrays
- `spread_risk`: one of `low|medium|high`
- `estimated_yield_loss_pct`: object {"min":int,"max":int}
- `images_notes`: short advice about image quality and follow-ups
- `warnings`: array of short warning strings
- `extra`: object with optional structured recommendations (chemical_recommendations, monitoring_actions, soil_irrigation_advice, environmental_triggers, references)

Behavior rules:
- Analyze at pixel level: mention specific color/pattern cues (e.g., lesions, chlorosis, necrosis, powdery coating, spots), approximate percent area affected when possible.
- If multiple plausible diagnoses exist, give the most likely one as `diagnosis` and include alternatives in `extra.possible_alternatives` with confidence scores.
- When crop identification is uncertain, still return `crop` as best-guess and include `extra.crop_confidence_details`.
- Keep farmer-facing strings short and actionable. Numeric values should be simple floats or ints.
- Output MUST be strict JSON parsable by `json.loads()`.

Return only the JSON object.
"""


def _call_groq_with_prompt(image_base64: Optional[str] = None, image_url: Optional[str] = None, prompt: str = GROQ_PROMPT, language: str = "en", extra_message: Optional[str] = None, model: Optional[str] = None, max_tokens: int = 4096, temperature: float = 0.4) -> Dict[str, Any]:
    """Call Groq API with a custom prompt string."""
    api_key = get_groq_api_key()
    if not api_key:
        raise ValueError("GROQ_API_KEY not configured")

    language_name = SUPPORTED_LANGUAGES.get(language, "English")
    if language != "en":
        prompt = prompt + f"\n\nAlso provide key information in {language_name} for local farmers."

    if image_url:
        content_str = prompt + "\n\n[IMAGE_URL]\n" + image_url
    else:
        content_str = prompt + "\n\n[IMAGE_DATA]\n" + f"data:image/jpeg;base64,{image_base64}"

    if extra_message:
        content_str += "\n\n[USER_MESSAGE]\n" + extra_message

    payload = {
        "model": model or GROQ_DEFAULT_MODEL,
        "messages": [
            {
                "role": "user",
                "content": content_str
            }
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post(GROQ_API_URL, json=payload, headers=headers)
        print(f"[Groq] Custom prompt call status: {response.status_code}")
        text = response.text[:1000]
        print(f"[Groq] body preview: {text}...")
        response.raise_for_status()
        return response.json()


def groq_analyze_full(image_base64: Optional[str] = None, image_url: Optional[str] = None, message: str = "", language: str = "en") -> Dict[str, Any]:
    """Perform exhaustive pixel-level analysis using a focused prompt and return normalized result."""
    resp = _call_groq_with_prompt(image_base64=image_base64, image_url=image_url, prompt=PIXEL_PROMPT, language=language, extra_message=message, temperature=0.0, max_tokens=4096)
    # Reuse existing parser which normalizes core fields; for extra fields the raw response may include them under 'extra'
    try:
        parsed = _parse_groq_response(resp)
        return parsed
    except Exception as e:
        # If parsing fails, attempt to extract crop/confidence directly
        try:
            choices = resp.get('choices', [])
            raw = choices[0].get('message', {}).get('content', '') if choices else ''
            if isinstance(raw, str):
                txt = raw.strip()
                if txt.startswith('```json'):
                    txt = txt[7:]
                if txt.startswith('```'):
                    txt = txt[3:]
                if txt.endswith('```'):
                    txt = txt[:-3]
                data = json.loads(txt)
                # try to normalize minimal
                return _parse_groq_response({'choices':[{'message':{'content': json.dumps(data)}}]})
        except Exception:
            pass
        raise


def _call_groq_api(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en", extra_message: Optional[str] = None) -> Dict[str, Any]:
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

    # Append any user-provided message/context to the content so Groq receives it
    if extra_message:
        content_str += "\n\n[USER_MESSAGE]\n" + extra_message
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


def groq_chat(image_base64: Optional[str] = None, image_url: Optional[str] = None, message: str = "", language: str = "en") -> Dict[str, Any]:
    """Send image + user message to Groq and return parsed diagnosis-like JSON.

    This wraps the low-level Groq call and parses the response using the
    existing `_parse_groq_response` helper so the returned dict matches
    the same normalized schema as `diagnose_leaf`.
    """
    if not (image_base64 or image_url):
        raise ValueError("image_base64 or image_url required")
    # Use the same low-level call but include the user's message
    resp = _call_groq_api(image_base64=image_base64, image_url=image_url, language=language, extra_message=message)
    parsed = _parse_groq_response(resp)
    return parsed


def _call_groq_crop_api(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en") -> Dict[str, Any]:
    """Call Groq with a focused crop-detection prompt that returns only crop+confidence."""
    api_key = get_groq_api_key()
    if not api_key:
        raise ValueError("GROQ_API_KEY not configured")

    language_name = SUPPORTED_LANGUAGES.get(language, "English")
    prompt = CROP_PROMPT
    if language != "en":
        prompt += f"\nAlso provide crop name in {language_name} if possible."

    if image_url:
        content_str = prompt + "\n\n[IMAGE_URL]\n" + image_url
    else:
        content_str = prompt + "\n\n[IMAGE_DATA]\n" + f"data:image/jpeg;base64,{image_base64}"

    payload = {
        "model": GROQ_DEFAULT_MODEL,
        "messages": [{"role": "user", "content": content_str}],
        "temperature": 0.0,
        "max_tokens": 256,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(GROQ_API_URL, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


def groq_detect_crop(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en") -> Dict[str, Any]:
    """Return a minimal dict {crop, confidence} by asking Groq specifically for crop detection."""
    resp = _call_groq_crop_api(image_base64=image_base64, image_url=image_url, language=language)
    # parse minimal response
    try:
        choices = resp.get("choices", [])
        if not choices:
            raise ValueError("No choices in groq crop response")
        raw = choices[0].get("message", {}).get("content", "")
        if isinstance(raw, dict):
            data = raw
        else:
            text = str(raw).strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            data = json.loads(text)

        crop = data.get("crop") or data.get("label") or "Unknown"
        confidence = float(data.get("confidence", 0.0))
        confidence = min(max(confidence, 0.0), 1.0)
        return {"crop": crop, "confidence": confidence}
    except Exception as e:
        return {"crop": "Unknown", "confidence": 0.0}


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


def compute_poi_from_image_base64(image_base64: str) -> Dict[str, Any]:
    """Heuristic Percentage of Infection (POI) estimator.

    - If PIL is available, opens image and estimates leaf vs lesion area using simple color heuristics.
    - Returns: {"DLA": float, "TLA": float, "POI": float, "stage": "low|moderate|high"}
    Note: This is a rough demo; replace with U2-Net + ViT for production-grade segmentation.
    """
    if not PIL_AVAILABLE:
        return {"DLA": 0.0, "TLA": 0.0, "POI": 0.0, "stage": "low", "note": "Pillow not installed"}

    try:
        decoded = base64.b64decode(image_base64)
        img = Image.open(BytesIO(decoded)).convert("RGB")
        # Resize for speed
        img = img.resize((512, 512))
        arr = img.load()
        width, height = img.size
        total_pixels = width * height

        # Simple heuristics: greenish pixels -> leaf; brown/black -> diseased area
        leaf_pixels = 0
        diseased_pixels = 0
        for y in range(height):
            for x in range(width):
                r, g, b = arr[x, y]
                # normalized
                if g > r and g > b and g > 80:
                    leaf_pixels += 1
                    # if R and B relatively high and green low -> not diseased
                # detect brown/dark lesions
                if (r > 80 and g < 80 and b < 80) or (r < 80 and g < 80 and b < 80):
                    diseased_pixels += 1

        # Clip values
        leaf_pixels = max(leaf_pixels, 0)
        diseased_pixels = max(min(diseased_pixels, total_pixels), 0)

        # Total leaf area approximated as leaf_pixels + diseased_pixels (overlap likely)
        tla = float(leaf_pixels + diseased_pixels)
        if tla <= 0:
            return {"DLA": 0.0, "TLA": 0.0, "POI": 0.0, "stage": "low", "note": "no leaf-like pixels detected"}

        dla = float(diseased_pixels)
        poi = (dla / tla) * 100.0

        if poi <= 30.0:
            stage = "low"
        elif poi <= 60.0:
            stage = "moderate"
        else:
            stage = "high"

        return {"DLA": round(dla, 2), "TLA": round(tla, 2), "POI": round(poi, 2), "stage": stage}
    except Exception as e:
        return {"DLA": 0.0, "TLA": 0.0, "POI": 0.0, "stage": "low", "error": str(e)}


def load_u2net_model(model_path: str = "models/u2net.pth"):
    """Attempt to load a U2-Net model if Torch is available. Returns model or None."""
    if not TORCH_AVAILABLE:
        return None
    try:
        import torch.nn as nn
        # Define a tiny U2-like stub model in-code for quick inference
        class U2NetStub(nn.Module):
            def __init__(self):
                super().__init__()
                self.conv = nn.Conv2d(3, 1, kernel_size=3, padding=1)
            def forward(self, x):
                return torch.sigmoid(self.conv(x))

        # Ensure model file exists; if not, create and save a fresh stub
        model_file = model_path
        os.makedirs(os.path.dirname(model_file), exist_ok=True)
        model = U2NetStub()
        if os.path.exists(model_file):
            try:
                model.load_state_dict(torch.load(model_file, map_location="cpu"))
            except Exception:
                pass
        else:
            try:
                torch.save(model.state_dict(), model_file)
            except Exception:
                pass
        model.eval()
        return model
    except Exception:
        return None


def run_u2net_segmentation(model, image_base64: str) -> Dict[str, Any]:
    """Run model to obtain lesion mask and area metrics. Returns stub when model missing."""
    if model is None:
        # Fallback: call old heuristic
        return compute_poi_from_image_base64(image_base64)

    try:
        import torch
        import numpy as np
        # Decode image and prepare tensor
        decoded = base64.b64decode(image_base64)
        img = Image.open(BytesIO(decoded)).convert("RGB")
        img = img.resize((256, 256))
        arr = np.array(img).astype('float32') / 255.0
        # HWC to CHW
        tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
        with torch.no_grad():
            mask = model(tensor)
        mask_np = mask.squeeze().cpu().numpy()
        # Estimate areas from mask
        tla = float((arr.sum(axis=2) > 0).sum())
        dla = float((mask_np > 0.5).sum())
        poi = (dla / max(tla, 1.0)) * 100.0
        stage = "low" if poi <= 30.0 else ("moderate" if poi <= 60.0 else "high")
        return {"DLA": round(dla, 2), "TLA": round(tla, 2), "POI": round(poi, 2), "stage": stage, "note": "u2net"}
    except Exception as e:
        return {"DLA": 0.0, "TLA": 0.0, "POI": 0.0, "stage": "low", "error": str(e)}


def load_vit_model(model_path: str = "models/vit_stage.pth"):
    if not TORCH_AVAILABLE:
        return None
    try:
        import torch.nn as nn
        # Tiny ViT-like stub: linear classifier over global pooled features
        class ViTStub(nn.Module):
            def __init__(self, in_features=256):
                super().__init__()
                self.fc = nn.Linear(in_features, 3)
            def forward(self, x):
                return self.fc(x)

        model_file = model_path
        os.makedirs(os.path.dirname(model_file), exist_ok=True)
        model = ViTStub()
        if os.path.exists(model_file):
            try:
                model.load_state_dict(torch.load(model_file, map_location="cpu"))
            except Exception:
                pass
        else:
            try:
                torch.save(model.state_dict(), model_file)
            except Exception:
                pass
        model.eval()
        return model
    except Exception:
        return None


def run_vit_stage_classifier(model, image_patch_base64: str) -> Dict[str, Any]:
    """Run ViT classifier to map lesion/time to stage: low/moderate/high.
    Returns dict with `stage` and `confidence`. Stubbed when model is None.
    """
    if model is None:
        return {"stage": "moderate", "confidence": 0.6, "note": "vit-stub"}
    try:
        import torch
        import numpy as np
        decoded = base64.b64decode(image_patch_base64)
        img = Image.open(BytesIO(decoded)).convert("RGB")
        img = img.resize((64, 64))
        arr = np.array(img).astype('float32') / 255.0
        # simple global features
        feat = torch.from_numpy(arr).mean(dim=(0,1)).float().unsqueeze(0)
        with torch.no_grad():
            out = model(feat)
            probs = torch.softmax(out.squeeze(), dim=0).cpu().numpy()
        idx = int(probs.argmax())
        stage = ["low", "moderate", "high"][idx]
        confidence = float(probs[idx])
        return {"stage": stage, "confidence": confidence}
    except Exception as e:
        return {"stage": "moderate", "confidence": 0.6, "error": str(e)}


def poi_using_models(image_base64: str) -> Dict[str, Any]:
    """High-level wrapper: try to use U2-Net + ViT pipeline; fall back to heuristic.
    Returns same schema as compute_poi_from_image_base64 plus `pipeline` info.
    """
    u2_model = load_u2net_model()
    vit_model = load_vit_model()
    if not u2_model:
        out = compute_poi_from_image_base64(image_base64)
        out["pipeline"] = "heuristic"
        return out

    seg = run_u2net_segmentation(u2_model, image_base64)
    vit_out = run_vit_stage_classifier(vit_model, image_base64)
    seg.update({"pipeline": "u2net+vit", "stage_confidence": vit_out.get("confidence", 0.0)})
    seg["stage"] = vit_out.get("stage", seg.get("stage", "low"))
    return seg
