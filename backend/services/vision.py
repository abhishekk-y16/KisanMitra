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
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except Exception:
    GENAI_AVAILABLE = False
from typing import Dict, Any, Optional
from io import BytesIO
import concurrent.futures
import time
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
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_DEFAULT_MODEL = "groq/compound"

# When Gemini returns rate-limit (429) errors, temporarily skip Gemini calls
# to avoid repeated quota failures. `GEMINI_COOLDOWN_UNTIL` stores epoch seconds.
GEMINI_COOLDOWN_UNTIL = 0.0

def get_gemini_api_keys() -> list:
    """Return a prioritized list of Gemini API keys.

    Supports either GEMINI_API_KEY (single) or GEMINI_API_KEYS (comma/whitespace-separated).
    Each token is trimmed and only the first whitespace-delimited token per line is used so
    accidental comments do not leak into requests.
    """
    raw = os.getenv("GEMINI_API_KEYS", "") or os.getenv("GEMINI_API_KEY", "") or ""
    keys: list[str] = []
    for chunk in raw.replace(",", "\n").splitlines():
        token = chunk.strip()
        if not token:
            continue
        keys.append(token.split()[0].strip())
    return keys


def get_gemini_api_key() -> str:
    """Backward compatible: return the first configured Gemini API key."""
    keys = get_gemini_api_keys()
    return keys[0] if keys else ""

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
You are a senior plant pathologist and agricultural advisor. Analyze the provided leaf/plant image and RETURN ONLY ONE STRICT JSON OBJECT (parsable by json.loads()). Do NOT output any explanation, commentary, or markdown — only one JSON object.

Hard requirements:
- Output exactly one JSON object; no surrounding text, no code fences.
- Top-level keys (required):
    - `diagnosis` (string): short disease/pest name or "Unknown".
    - `crop` (string): short crop name from the canonical list (see closed_set_crops) or "Unknown".
    - `confidence` (float): 0.0-1.0, calibrated to your certainty.
    - `severity` (string): one of "low", "medium", "high".
    - `isHealthy` (bool).
    - `symptoms` (array of short strings).
    - `treatment` (object) with arrays: `immediateActions`, `organicRemedies`, `futurePrevention`.
    - `warnings` (array of short strings).

Optional top-level `extra` object may include structured fields: `confidence_breakdown`, `likely_cause`, `affected_parts`, `spread_risk`, `image_angle_advice`, `possible_alternatives` (array of {"diagnosis":str,"confidence":float}), and `chemical_recommendations` (only when `confidence` >= 0.6).

Behavior and constraints:
- If multiple plausible diagnoses exist, pick the single most likely one for `diagnosis` and list alternatives in `extra.possible_alternatives` with confidences summing approximately to the remaining mass.
- Provide a conservative `confidence` when image quality or angle is poor (prefer lower values) and add `image_angle_advice` telling the farmer what to retake (distance, angle, lighting).
- Only include `extra.chemical_recommendations` when `confidence` >= 0.6. Each chemical recommendation must include `active_ingredient`, `dosage`, `application_interval_days`, `pre_harvest_interval_days`, and `safety_notes`.
- Keep all farmer-facing text short, actionable, and in plain language.

Closed-set crops (use these exact short names when possible; otherwise use "Unknown"): Tomato, Potato, Rice, Wheat, Maize, Chillies, Okra, Eggplant, Cotton, Soybean.

Return only the single JSON object.
"""

# Groq-specific prompt (uses same schema but tailored language for Groq/LLM-vision)
GROQ_PROMPT = """
You are an expert plant pathologist and agricultural advisor. Analyze the provided image and RETURN EXACTLY ONE STRICT JSON OBJECT (parsable by json.loads()). Do not output any extra text.

Required keys: `diagnosis`, `crop`, `confidence`, `severity`, `isHealthy`, `symptoms`, `treatment` (with `immediateActions`,`organicRemedies`,`futurePrevention`), and `warnings`.

Additional rules:
- Use the closed-set crop names when confident; otherwise `crop` should be "Unknown".
- `confidence` must be a float between 0.0 and 1.0. If uncertain, set `confidence` < 0.6 and add a short `image_angle_advice` in `extra`.
- If providing chemical recommendations, include structured fields (`active_ingredient`,`dosage`,`application_interval_days`,`pre_harvest_interval_days`,`safety_notes`). Only provide chemicals when `confidence` >= 0.6.
- Keep all `treatment` instructions short and actionable for farmers.

Example valid output:
{"diagnosis":"Early blight","crop":"Tomato","confidence":0.78,"severity":"medium","isHealthy":false,"symptoms":["brown concentric lesions","leaf yellowing"],"treatment":{"immediateActions":["remove affected leaves","improve air flow"],"organicRemedies":["apply neem oil"],"futurePrevention":["rotate crops"]},"warnings":[]}

Return only the JSON object.
"""


# Focused prompt for crop detection queries (returns only crop and confidence)
CROP_PROMPT = """
You are an image-based crop identifier. RETURN ONLY ONE STRICT JSON OBJECT with exactly two keys:
- `crop`: one of the canonical short names (exact spelling and capitalization): Tomato, Potato, Rice, Wheat, Maize, Chillies, Okra, Eggplant, Cotton, Soybean, or "Unknown".
- `confidence`: a numeric float between 0.0 and 1.0 representing the probability that the `crop` label is correct.

Hard rules (must obey exactly):
- Output only a single JSON object, no surrounding text, no markdown, no commentary, no code fences.
- Use only the canonical crop names above when your confidence is >= 0.60. If your confidence is < 0.60, set `crop` to "Unknown" and `confidence` to the appropriate low value.
- Round `confidence` to two decimal places when possible.
- Do not include any other keys.

If you cannot determine the crop from the image, return {"crop":"Unknown","confidence":0.00}.

Example: {"crop":"Rice","confidence":0.88}
"""


# Pixel-level, exhaustive plant analysis prompt
PIXEL_PROMPT = """
You are a pixel-level plant pathologist and agronomist. RETURN EXACTLY ONE STRICT JSON OBJECT (no surrounding text) that follows this precise schema. Be concise, objective, and use conservative numeric estimates when unsure.

Required fields:
- `diagnosis` (string) — disease/pest short name or "Unknown".
- `crop` (string) — canonical crop short name or "Unknown".
- `confidence` (float 0.0-1.0).
- `severity` ("low"|"medium"|"high").
- `isHealthy` (bool).
- `symptoms` (array of short strings).
- `affected_parts` (array, e.g., ["leaves","stems","fruits"]).
- `confidence_breakdown` (object of numeric contributions that sum to ~1.0).
- `treatment` (object with arrays `immediateActions`,`organicRemedies`,`futurePrevention`).
- `spread_risk` ("low"|"medium"|"high").
- `estimated_yield_loss_pct` (object {"min":int,"max":int}).
- `images_notes` (short string advising retake if needed).
- `warnings` (array of short strings).
- Optional `extra` object for structured recommendations.

Behavior:
- Provide pixel-level evidence in `extra` (e.g., "lesion_color":"brown","percent_area":12).
- If multiple diagnoses are plausible, set `diagnosis` to the most likely and list alternatives in `extra.possible_alternatives`.
- Use canonical crop names when possible. If unknown, use "Unknown" and explain briefly in `images_notes` or `extra.crop_confidence_details`.

Return only the JSON object.
"""

SOIL_PROMPT = """
You are a soil science expert analyzing soil images for farmers. RETURN EXACTLY ONE STRICT JSON OBJECT (no surrounding text) that follows this precise schema:

Required fields:
- `color_description` (string) — describe the soil color (e.g., "dark brown", "reddish brown", "grey")
- `dominant_texture` (string) — visual texture assessment ("sandy", "loamy", "clayey", "silty" or combination)
- `confidence` (float 0.0-1.0) — your confidence in this visual assessment
- `likely` (object) — visual indicators, e.g.:
  {
    "organic_matter": "low"|"moderate"|"high",
    "moisture_level": "dry"|"moist"|"wet",
    "pH_range": "acidic (5-6)"|"neutral (6-7)"|"alkaline (7-8)",
    "compaction": "loose"|"moderate"|"compacted"
  }
- `natural_improvements` (array of strings) — farmer-friendly organic recommendations (3-5 items)
- `suggested_followups` (array of strings) — next steps like "lab pH test", "add compost", etc.
- `warnings` (array of strings) — any concerns visible (e.g., "possible salinity", "poor drainage")
- `images_notes` (string) — brief note on image quality or advice to retake

Optional:
- `extra` (object) — any additional structured data

Behavior:
- Focus ONLY on soil properties - do NOT mention crops, diseases, or plant health
- Be conservative with confidence scores for visual-only assessment
- Provide practical, actionable recommendations for small farmers
- If image quality is poor, note in `images_notes` and lower confidence

Return only the JSON object.
"""

def _extract_first_json_object(content: str) -> Dict[str, Any]:
    """Extract and parse the first JSON object from a text blob.

    Handles cases where providers return a JSON object followed by extra text
    like reasoning or explanations. Also strips Markdown code fences.
    """
    try:
        txt = (content or "").strip()
        # Strip markdown fences if present
        if txt.startswith("```json"):
            txt = txt[7:]
        if txt.startswith("```"):
            txt = txt[3:]
        if txt.endswith("```"):
            txt = txt[:-3]

        # Fast path: try full parse
        try:
            return json.loads(txt)
        except Exception:
            pass

        # Fallback: extract the first balanced {...} block
        start = txt.find("{")
        if start == -1:
            raise ValueError("No JSON object start found")
        depth = 0
        end = None
        for i in range(start, len(txt)):
            ch = txt[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end is None:
            raise ValueError("No complete JSON object found")
        blob = txt[start:end+1]
        return json.loads(blob)
    except Exception as e:
        raise ValueError(f"Failed to parse JSON content: {e}")


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

    # Avoid inheriting proxy settings; moderate timeout
    with httpx.Client(timeout=30.0, trust_env=False) as client:
        response = client.post(GROQ_API_URL, json=payload, headers=headers)
        # Log minimally to avoid flooding console; never crash on log
        try:
            print(f"[Groq] Custom prompt call status: {response.status_code}")
            text = response.text[:300]
            print(f"[Groq] body preview: {text}...")
        except Exception:
            pass
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


def groq_analyze_soil(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en", extra_message: Optional[str] = None) -> Dict[str, Any]:
    """Perform soil-focused Groq analysis using SOIL_PROMPT.

    Returns normalized result with soil-specific fields.
    """
    try:
        resp = _call_groq_with_prompt(
            image_base64=image_base64,
            image_url=image_url,
            prompt=SOIL_PROMPT,
            language=language,
            extra_message=extra_message,
            temperature=0.0,
            max_tokens=4096
        )
        choices = resp.get('choices', [])
        if not choices:
            raise ValueError("No choices in Groq response")
        content = choices[0].get('message', {}).get('content', '')
        if not content:
            raise ValueError("Empty content in Groq response")

        data = _extract_first_json_object(content)
        data['pipeline'] = 'groq_soil_analysis'
        data['provider'] = 'groq'
        return data
    except Exception as e:
        print(f"[Vision][groq_analyze_soil] Groq soil analysis failed: {e}")
        raise


def groq_and_gemini_analyze_soil(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en", extra_message: Optional[str] = None) -> Dict[str, Any]:
    """Call Groq for soil image analysis (Gemini removed per user request).

    Returns a normalized result similar to `groq_analyze_soil` output.
    """
    groq_key = get_groq_api_key()

    if not groq_key:
        raise ValueError('GROQ_API_KEY not configured')

    # Call Groq only
    try:
        out = groq_analyze_soil(image_base64=image_base64, image_url=image_url, language=language, extra_message=extra_message)
        out['providers'] = [out]
        return out
    except Exception as e:
        print(f"[Vision][groq_and_gemini_analyze_soil] Groq attempt failed: {e}")
        raise ValueError(f'Groq analysis failed: {str(e)}')


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


def _call_gemini_api(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en", extra_message: Optional[str] = None) -> Dict[str, Any]:
    """Call Google Gemini API for image analysis.

    Accepts either `image_base64` or `image_url`. If `image_url` is provided,
    the image will be fetched and base64-encoded before sending to Gemini.
    """

    api_keys = get_gemini_api_keys()
    if not api_keys:
        raise ValueError("GEMINI_API_KEY not configured")

    # Normalize input: if image_url provided, fetch and base64-encode
    if image_url and not image_base64:
        # Some image URLs (local dev server or slow networks) may time out; retry a few times
        last_exc = None
        timeouts = [10.0, 20.0, 30.0]
        for t in timeouts:
            try:
                with httpx.Client(timeout=t) as client:
                    r = client.get(image_url)
                    r.raise_for_status()
                    image_bytes = r.content
                    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
                    last_exc = None
                    break
            except Exception as e:
                print(f"[Vision] fetch image_url attempt failed (timeout={t}s): {e}")
                last_exc = e
                time.sleep(0.25)
        if last_exc and not image_base64:
            raise ValueError(f"Failed to fetch image from URL after retries: {last_exc}")

    if not image_base64:
        raise ValueError("image_base64 or image_url required for Gemini API")

    # Prepare the prompt with language context
    language_name = SUPPORTED_LANGUAGES.get(language, "English")
    prompt = DIAGNOSIS_PROMPT
    if language != "en":
        prompt += f"\n\nAlso provide key information in {language_name} for better understanding by local farmers."
    # Append any extra user-provided context (soil metadata)
    if extra_message:
        prompt += "\n\n[USER_MESSAGE]\n" + extra_message

    # Preflight: attempt to reduce image size for inline/base64 payloads
    # Large inline images can cause provider REST/client 400 errors; resize/compress when needed.
    try:
        if PIL_AVAILABLE and image_base64:
            img_bytes = base64.b64decode(image_base64)
            need_reencode = False
            # Quick check on bytesize
            if len(img_bytes) > 700_000:  # > ~700KB
                need_reencode = True
            if not need_reencode:
                # also check dimensions
                try:
                    with Image.open(BytesIO(img_bytes)) as _img:
                        w, h = _img.size
                        if max(w, h) > 1400:
                            need_reencode = True
                except Exception:
                    # if Pillow can't open, leave as-is and hope for the best
                    need_reencode = False

            if need_reencode:
                try:
                    with Image.open(BytesIO(img_bytes)) as img_obj:
                        img_obj = img_obj.convert("RGB")
                        max_dim = 1200
                        w, h = img_obj.size
                        # Default to original dimensions
                        new_w, new_h = w, h
                        if max(w, h) > max_dim:
                            scale = max_dim / float(max(w, h))
                            new_w = int(w * scale)
                            new_h = int(h * scale)
                            img_obj = img_obj.resize((new_w, new_h), Image.LANCZOS)

                        out = BytesIO()
                        img_obj.save(out, format="JPEG", quality=75, optimize=True)
                        out_bytes = out.getvalue()
                        image_base64 = base64.b64encode(out_bytes).decode('utf-8')
                        print(f"[Vision] Re-encoded image for Gemini: {len(out_bytes)} bytes, {new_w}x{new_h}")
                except Exception as e:
                    print(f"[Vision] Failed to re-encode image for Gemini preflight: {e}")
    except Exception as e:
        print(f"[Vision] Error during Gemini image preflight: {e}")

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
    
    last_error: Optional[Exception] = None

    for idx, api_key in enumerate(api_keys):
        key_label = f"{api_key[:10]}..." if api_key else "<empty>"
        quota_error = False
        last_exc_client: Optional[Exception] = None

        # Prefer official client library when available to avoid REST permission mismatches
        if GENAI_AVAILABLE:
            try:
                genai.configure(api_key=api_key)
                print(f"[Gemini] Using google-generativeai client (key #{idx+1})")
                model = genai.GenerativeModel("gemini-2.5-flash")
                last_exc_client = None
                for attempt in range(3):
                    try:
                        try:
                            resp = model.generate_content(contents=[{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}}]}], temperature=0.4, max_output_tokens=4096)
                        except TypeError:
                            resp = model.generate_content(contents=[{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}}]}])

                        try:
                            if isinstance(resp, dict):
                                return resp
                            text = getattr(resp, 'text', None)
                            if text is None:
                                text = str(resp)
                            return {'candidates': [{'content': {'parts': [{'text': text}]}}]}
                        except Exception:
                            return {'candidates': []}
                    except Exception as e:
                        last_exc_client = e
                        msg = str(e).lower()
                        if '429' in msg or 'quota' in msg:
                            quota_error = True
                            break
                        print(f"[Gemini] client attempt {attempt+1} failed: {e}")
                        time.sleep((2 ** attempt) * 0.5)
                if last_exc_client:
                    print(f"[Gemini] Client all attempts failed: {last_exc_client}")
            except Exception as e:
                last_exc_client = e
                msg = str(e).lower()
                if '429' in msg or 'quota' in msg:
                    quota_error = True
                print(f"[Gemini] Client library configuration failed: {e}")
        # If client path yielded quota, try next key immediately
        if quota_error and idx + 1 < len(api_keys):
            print(f"[Gemini] Key #{idx+1} quota/429, trying next key...")
            last_error = last_exc_client
            continue

        try:
            url = f"{GEMINI_API_URL}?key={api_key}"
            print(f"[Gemini] Calling API (REST) with key: {key_label}")
            with httpx.Client(timeout=60.0) as client:
                response = client.post(url, json=payload, headers=headers)
                print(f"[Gemini] Response status: {response.status_code}")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            last_error = e
            status = None
            try:
                status = e.response.status_code
            except Exception:
                status = None
            if status == 429 and idx + 1 < len(api_keys):
                print(f"[Gemini] REST 429 for key #{idx+1}; trying next key...")
                continue
            raise
        except Exception as e:
            last_error = e
            print(f"[Gemini] REST call failed for key #{idx+1}: {e}")
            if idx + 1 < len(api_keys):
                continue
            raise

    # If we exhausted all keys, surface the last error
    if last_error:
        raise last_error
    raise ValueError("Gemini call failed with no available keys")


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


def _provider_snapshot(res: Dict[str, Any], name: str) -> Dict[str, Any]:
    """Return a deepcopy-like snapshot to avoid circular refs in `providers`."""
    try:
        snap = json.loads(json.dumps(res))
    except Exception:
        snap = dict(res)
    snap['provider'] = name
    snap.pop('providers', None)
    return snap


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
    extra_message = None
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

        # Try both providers when available. Previously we returned Groq result immediately
        # which meant Gemini was only used as a fallback. To enable merging/combination
        # of LLM outputs, call both concurrently when both keys are present.
        groq_key = get_groq_api_key()
        gemini_key = get_gemini_api_key()

        print(f"[Vision] Groq API Key configured: {bool(groq_key)}")
        print(f"[Vision] Gemini API Key configured: {bool(gemini_key)}")

        # If both keys configured, call both in parallel and merge results
        if groq_key and gemini_key:
            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
                    futs = {
                        'groq': ex.submit(lambda: _parse_groq_response(_call_groq_api(image_base64=image_base64, image_url=image_url, language=language, extra_message=extra_message))),
                        'gemini': ex.submit(lambda: _parse_gemini_response(_call_gemini_api(image_base64=image_base64, image_url=image_url, language=language, extra_message=extra_message)))
                    }
                    results = {}
                    for name, fut in futs.items():
                        try:
                            results[name] = fut.result(timeout=60)
                        except Exception as e:
                            print(f"[Vision] {name} call failed in parallel: {e}")
                            results[name] = None

                groq_res = results.get('groq')
                gemini_res = results.get('gemini')

                # If both failed, return demo
                if not groq_res and not gemini_res:
                    return _get_demo_response(crop, error='Both providers failed')

                # If only one succeeded, return it
                if groq_res and not gemini_res:
                    if crop:
                        groq_res['crop'] = _normalize_crop_name(crop)
                        groq_res.setdefault('extra', {})
                        groq_res['extra']['user_crop_hint_applied'] = True
                    groq_res['providers'] = [_provider_snapshot(groq_res, 'groq')]
                    return groq_res
                if gemini_res and not groq_res:
                    if crop:
                        gemini_res['crop'] = _normalize_crop_name(crop)
                        gemini_res.setdefault('extra', {})
                        gemini_res['extra']['user_crop_hint_applied'] = True
                    gemini_res['providers'] = [_provider_snapshot(gemini_res, 'gemini')]
                    return gemini_res

                # Both present: merge simple strategy
                # Prefer same diagnosis if both agree (combine confidences)
                diag_a = groq_res.get('diagnosis', 'Unknown')
                diag_b = gemini_res.get('diagnosis', 'Unknown')
                conf_a = float(groq_res.get('confidence', 0.0))
                conf_b = float(gemini_res.get('confidence', 0.0))

                merged = {}
                if diag_a.lower() == diag_b.lower() and diag_a != 'Unknown':
                    combined_conf = 1.0 - (1.0 - conf_a) * (1.0 - conf_b)
                    merged = groq_res.copy()
                    merged['confidence'] = min(max(round(combined_conf, 3), 0.0), 1.0)
                    merged['providers'] = [
                        _provider_snapshot(groq_res, 'groq'),
                        _provider_snapshot(gemini_res, 'gemini'),
                    ]
                else:
                    # pick higher confidence diagnosis
                    if conf_a >= conf_b:
                        merged = groq_res.copy()
                    else:
                        merged = gemini_res.copy()
                    merged['providers'] = [
                        _provider_snapshot(groq_res, 'groq'),
                        _provider_snapshot(gemini_res, 'gemini'),
                    ]

                # override crop hint if provided by user (normalize and mark)
                if crop:
                    merged['crop'] = _normalize_crop_name(crop)
                    merged.setdefault('extra', {})
                    merged['extra']['user_crop_hint_applied'] = True
                    # boost confidence conservatively to reflect user's prior
                    merged['confidence'] = max(merged.get('confidence', 0.0), 0.75)
                return merged
            except Exception as e:
                print(f"[Vision] Parallel provider merge failed: {e}")
                # Fall back to single-provider attempts below

        # If only one provider available, use it as before
        if groq_key:
            try:
                print("[Vision] Trying Groq API...")
                response = _call_groq_api(image_base64=image_base64, image_url=image_url, language=language, extra_message=extra_message)
                result = _parse_groq_response(response)
                print("[Vision] Groq API success!")
                if crop:
                    result["crop"] = crop
                return result
            except Exception as e:
                print(f"[Vision] Groq API failed: {e}")

        if gemini_key:
            try:
                print("[Vision] Trying Gemini API...")
                response = _call_gemini_api(image_base64=image_base64, image_url=image_url, language=language, extra_message=extra_message)
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


def _call_gemini_crop_api(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en") -> Dict[str, Any]:
    """Call Gemini with a focused crop-detection prompt that returns only crop+confidence."""
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")

    language_name = SUPPORTED_LANGUAGES.get(language, "English")
    prompt = CROP_PROMPT
    if language != "en":
        prompt += f"\nAlso provide crop name in {language_name} if possible."

    # Build payload similar to _call_gemini_api but with focused prompt
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
            "temperature": 0.0,
            "topK": 1,
            "topP": 1,
            "maxOutputTokens": 256,
        }
    }

    # Prefer client library to avoid REST permission/model-method mismatch
    if GENAI_AVAILABLE:
        try:
            genai.configure(api_key=api_key)
            print("[Gemini] Using google-generativeai client for crop detection")
            model = genai.GenerativeModel("gemini-2.5-flash")
            try:
                resp = model.generate_content(contents=[{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}}]}], temperature=0.0, max_output_tokens=256)
            except TypeError:
                resp = model.generate_content(contents=[{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}}]}])

            try:
                if isinstance(resp, dict):
                    return resp
                text = getattr(resp, 'text', None)
                if text is None:
                    text = str(resp)
                return {'candidates': [{'content': {'parts': [{'text': text}]}}]}
            except Exception:
                return {'candidates': []}
        except Exception as e:
            print(f"[Gemini] Client library crop call failed: {e}")
            # Fall back to REST below

    headers = {"Content-Type": "application/json"}
    url = f"{GEMINI_API_URL}?key={api_key}"
    with httpx.Client(timeout=60.0) as client:
        response = client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


def groq_detect_crop(image_base64: Optional[str] = None, image_url: Optional[str] = None, language: str = "en") -> Dict[str, Any]:
    """Call both Groq and Gemini (when configured) concurrently and combine their crop guesses."""
    results = []

    def call_groq():
        try:
            print("[Vision][groq_detect_crop] calling Groq crop API")
            resp = _call_groq_crop_api(image_base64=image_base64, image_url=image_url, language=language)
            choices = resp.get("choices", [])
            raw = choices[0].get("message", {}).get("content", "") if choices else ""
            parsed = None
            if isinstance(raw, dict):
                parsed = raw
            else:
                t = str(raw).strip()
                if t.startswith("```json"): t = t[7:]
                if t.startswith("```"): t = t[3:]
                if t.endswith("```"): t = t[:-3]
                t = t.strip()
                try:
                    parsed = json.loads(t)
                except Exception:
                    s = t.find('{')
                    e = t.rfind('}')
                    if s != -1 and e != -1 and e > s:
                        try:
                            parsed = json.loads(t[s:e+1])
                        except Exception:
                            parsed = None
                if parsed is None:
                    parsed = {}
                    single = t.splitlines()[0].strip() if t else ''
                    if single.startswith('"') and single.endswith('"'):
                        single = single[1:-1]
                    if ':' in single:
                        parts = single.split(':', 1)
                        key = parts[0].strip().lower()
                        val = parts[1].strip()
                        if key in ('crop', 'label'):
                            parsed['crop'] = val
                    else:
                        parsed['crop'] = single
            crop = (parsed.get('crop') or parsed.get('label') or parsed.get('label_text') or 'Unknown').strip() if parsed else 'Unknown'
            conf = 0.0
            try:
                conf = float(parsed.get('confidence', 0.0)) if parsed else 0.0
            except Exception:
                conf = 0.0
            return {'source': 'groq', 'crop': _normalize_crop_name(crop), 'confidence': min(max(conf, 0.0), 1.0)}
        except Exception as e:
            print(f"[Vision][groq_detect_crop] Groq call failed: {e}")
            return {'source': 'groq', 'crop': 'Unknown', 'confidence': 0.0, 'error': str(e)}

    def call_gemini():
        try:
            print("[Vision][groq_detect_crop] calling Gemini crop API")
            resp = _call_gemini_crop_api(image_base64=image_base64, image_url=image_url, language=language)
            candidates = resp.get('candidates', [])
            text = ''
            if candidates:
                content = candidates[0].get('content', {})
                parts = content.get('parts', [])
                if parts:
                    text = parts[0].get('text', '')
            t = (text or '').strip()
            if t.startswith('```json'): t = t[7:]
            if t.startswith('```'): t = t[3:]
            if t.endswith('```'): t = t[:-3]
            parsed = None
            try:
                parsed = json.loads(t)
            except Exception:
                s = t.find('{')
                e = t.rfind('}')
                if s != -1 and e != -1 and e > s:
                    try:
                        parsed = json.loads(t[s:e+1])
                    except Exception:
                        parsed = None
            if parsed is None:
                parsed = {}
                single = t.splitlines()[0].strip() if t else ''
                if single.startswith('"') and single.endswith('"'):
                    single = single[1:-1]
                if ':' in single:
                    parts = single.split(':', 1)
                    key = parts[0].strip().lower()
                    val = parts[1].strip()
                    if key in ('crop', 'label'):
                        parsed['crop'] = val
                else:
                    parsed['crop'] = single
            crop = (parsed.get('crop') or 'Unknown').strip()
            conf = 0.0
            try:
                conf = float(parsed.get('confidence', 0.0))
            except Exception:
                conf = 0.0
            return {'source': 'gemini', 'crop': _normalize_crop_name(crop), 'confidence': min(max(conf, 0.0), 1.0)}
        except Exception as e:
            print(f"[Vision][groq_detect_crop] Gemini call failed: {e}")
            return {'source': 'gemini', 'crop': 'Unknown', 'confidence': 0.0, 'error': str(e)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        groq_key = get_groq_api_key()
        gemini_key = get_gemini_api_key()
        futs = {}
        if groq_key:
            futs['groq'] = ex.submit(call_groq)
        if gemini_key:
            futs['gemini'] = ex.submit(call_gemini)
        for name, fut in futs.items():
            try:
                r = fut.result(timeout=30)
                if r:
                    # preserve raw provider result for debugging/merging
                    results.append(r)
            except Exception:
                continue

    if not results:
        return {'crop': 'Unknown', 'confidence': 0.0, 'providers': []}
    if len(results) == 1:
        return {'crop': results[0]['crop'], 'confidence': results[0]['confidence'], 'providers': [results[0]]}
    a = results[0]
    b = results[1]
    # If both providers agree on crop and not Unknown, combine confidences (probabilistic union)
    if a['crop'].lower() == b['crop'].lower() and a['crop'] != 'Unknown':
        c1 = a['confidence']
        c2 = b['confidence']
        combined = 1.0 - (1.0 - c1) * (1.0 - c2)
        combined = min(max(combined, 0.0), 1.0)
        return {'crop': a['crop'], 'confidence': round(combined, 3), 'providers': [a, b]}

    # If one provider is clearly more confident, prefer it (strong margin)
    if a['confidence'] >= b['confidence'] + 0.20:
        return {'crop': a['crop'], 'confidence': a['confidence'], 'providers': [a, b]}
    if b['confidence'] >= a['confidence'] + 0.20:
        return {'crop': b['crop'], 'confidence': b['confidence'], 'providers': [a, b]}

    # If both low confidence (<0.60), attempt local classifier fallback
    try:
        max_conf = max(a.get('confidence', 0.0), b.get('confidence', 0.0))
        if max_conf < 0.60:
            try:
                model, classes = load_crop_classifier()
                if model and classes:
                    clf = run_crop_classifier(model, classes, image_base64)
                    clf_crop = _normalize_crop_name(clf.get('crop', 'Unknown'))
                    clf_conf = float(clf.get('confidence', 0.0))
                    print(f"[Vision][groq_detect_crop] local classifier suggested {clf_crop} ({clf_conf})")
                    # Use classifier if it has higher confidence than LLMs
                    if clf_conf > max_conf and clf_conf >= 0.50:
                        return {'crop': clf_crop, 'confidence': round(clf_conf, 3), 'providers': [a, b, {'source': 'local_classifier', 'crop': clf_crop, 'confidence': clf_conf}]}
            except Exception as e:
                print(f"[Vision][groq_detect_crop] local classifier failed: {e}")
    except Exception:
        pass

    # If confidences close, pick the higher one (default tie-breaker prefers Groq as primary)
    if abs(a['confidence'] - b['confidence']) <= 0.15:
        primary = a if a['confidence'] >= b['confidence'] else b
        return {'crop': primary['crop'], 'confidence': primary['confidence'], 'providers': [a, b]}

    primary = a if a['confidence'] >= b['confidence'] else b
    return {'crop': primary['crop'], 'confidence': primary['confidence'], 'providers': [a, b]}


def _normalize_crop_name(raw: str) -> str:
    """Map various crop labels/synonyms to canonical short English names."""
    if not raw:
        return "Unknown"
    s = raw.strip().lower()
    # common mappings
    mapping = {
        'tomato': ['tomato', 'tomatoes', 'solanum lycopersicum', 'टमाटर'],
        'potato': ['potato', 'potatoes', 'solanum tuberosum', 'आलू'],
        'rice': ['rice', 'paddy', 'paddy rice', 'धान', 'चावल'],
        'wheat': ['wheat', 'गेहूँ', 'गेहू'],
        'maize': ['maize', 'corn', 'भुट्टा', 'मक्का'],
        'chillies': ['chilli', 'chillies', 'chili', 'capsicum', 'मिर्च', 'mirchi'],
        'okra': ['okra', 'bhindi', 'भिन्डी', 'ladyfinger'],
        'eggplant': ['eggplant', 'brinjal', 'बैंगन', 'brinjol'],
        'soybean': ['soybean', 'soy', 'soybeans'],
        'sugarcane': ['sugarcane', 'cane'],
        'cotton': ['cotton'],
        'unknown': ['unknown', 'unsure', 'not sure']
    }
    # direct match
    for canon, variants in mapping.items():
        for v in variants:
            if s == v:
                return canon.capitalize() if canon != 'unknown' else 'Unknown'
    # substring match
    for canon, variants in mapping.items():
        for v in variants:
            if v in s:
                return canon.capitalize() if canon != 'unknown' else 'Unknown'
    # fallback: capitalize raw but remove quotes
    s_clean = raw.strip().strip('"').strip("'")
    if not s_clean:
        return 'Unknown'
    return s_clean.capitalize()


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


def load_crop_classifier(model_path: str = "models/crop_vit.pth", classes_path: str = "models/crop_classes.json"):
    """Load a simple local crop classifier and class list. Returns (model, classes) or (None, [])."""
    if not TORCH_AVAILABLE:
        return None, []
    try:
        import torch.nn as nn
        import torch
        import json
        # Define same architecture as training stub
        class SimpleCNN(nn.Module):
            def __init__(self, num_classes):
                super().__init__()
                self.features = nn.Sequential(
                    nn.Conv2d(3, 32, 3, padding=1),
                    nn.ReLU(),
                    nn.MaxPool2d(2),
                    nn.Conv2d(32, 64, 3, padding=1),
                    nn.ReLU(),
                    nn.MaxPool2d(2),
                    nn.Conv2d(64, 128, 3, padding=1),
                    nn.ReLU(),
                    nn.AdaptiveAvgPool2d((4,4)),
                )
                self.classifier = nn.Sequential(
                    nn.Flatten(),
                    nn.Linear(128*4*4, 256),
                    nn.ReLU(),
                    nn.Dropout(0.3),
                    nn.Linear(256, num_classes),
                )
            def forward(self, x):
                x = self.features(x)
                x = self.classifier(x)
                return x

        # Load classes
        classes = []
        if os.path.exists(classes_path):
            with open(classes_path, 'r', encoding='utf-8') as f:
                try:
                    classes = json.load(f)
                except Exception:
                    classes = []

        num_classes = max(1, len(classes))
        model = SimpleCNN(num_classes=num_classes)
        if os.path.exists(model_path):
            try:
                state = torch.load(model_path, map_location='cpu')
                model.load_state_dict(state)
            except Exception:
                pass
        model.eval()
        return model, classes
    except Exception:
        return None, []


def run_crop_classifier(model, classes, image_base64: str) -> Dict[str, Any]:
    """Run the crop classifier on a base64 image and return {crop, confidence}.
    If model is None, returns Unknown with 0.0 confidence.
    """
    if model is None or not classes:
        return {"crop": "Unknown", "confidence": 0.0}
    try:
        import base64
        import io
        from PIL import Image
        import torch
        import torchvision.transforms as T
        decoded = base64.b64decode(image_base64)
        img = Image.open(io.BytesIO(decoded)).convert('RGB')
        transform = T.Compose([
            T.Resize((128,128)),
            T.ToTensor(),
        ])
        t = transform(img).unsqueeze(0)
        with torch.no_grad():
            out = model(t)
            probs = torch.softmax(out.squeeze(), dim=0).cpu().numpy()
        import numpy as np
        idx = int(np.argmax(probs))
        crop = classes[idx] if idx < len(classes) else 'Unknown'
        confidence = float(probs[idx])
        return {"crop": crop, "confidence": confidence}
    except Exception:
        return {"crop": "Unknown", "confidence": 0.0}


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
