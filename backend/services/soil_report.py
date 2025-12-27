"""
Soil Report OCR and Analysis Service

Extracts structured data from soil analysis reports using Gemini Vision,
then provides conversational crop recommendations via LLM.
"""
import os
import base64
import json
from typing import Dict, Any, Optional, List
import google.generativeai as genai
from services.vision import get_gemini_api_key

def extract_soil_report_data(image_base64: str) -> Dict[str, Any]:
    """Extract structured soil parameters from a soil analysis report image using Gemini Vision.
    
    Returns a dict with soil parameters like pH, nitrogen, phosphorus, potassium, organic_carbon,
    electrical_conductivity, micronutrients, etc.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    
    genai.configure(api_key=api_key)
    
    # Prepare the prompt for extracting soil data
    prompt = """You are an expert agricultural scientist analyzing a soil analysis report.

Extract ALL numerical values and parameters from this soil test report image.

Return a JSON object with the following structure (use null for missing values):
{
  "lab_name": "Lab name if visible",
  "report_date": "Date if visible",
  "sample_id": "Sample ID if visible",
  "farmer_name": "Farmer name if visible",
  "village": "Village/location if visible",
  "parameters": {
    "ph": numeric value or null,
    "electrical_conductivity": numeric value in dS/m or null,
    "organic_carbon": numeric value in % or null,
    "nitrogen_n": numeric value in kg/ha or ppm or null,
    "phosphorus_p": numeric value in kg/ha or ppm or null,
    "potassium_k": numeric value in kg/ha or ppm or null,
    "sulphur_s": numeric value in kg/ha or ppm or null,
    "zinc_zn": numeric value in ppm or null,
    "iron_fe": numeric value in ppm or null,
    "copper_cu": numeric value in ppm or null,
    "manganese_mn": numeric value in ppm or null,
    "boron_b": numeric value in ppm or null
  },
  "soil_texture": "Sandy/Loamy/Clay/Silt if mentioned",
  "recommendations": "Any recommendations text from the report",
  "other_notes": "Any other relevant information"
}

Be thorough - extract every parameter you can find. If units are mentioned, include them in your extraction.
Return ONLY valid JSON, no other text."""

    try:
        # Use Gemini Flash for fast OCR (use newer available model)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Decode base64 image
        image_data = base64.b64decode(image_base64)
        
        # Create image part
        image_part = {
            'mime_type': 'image/jpeg',
            'data': image_data
        }
        
        # Generate response
        response = model.generate_content([prompt, image_part])
        
        # Parse JSON from response
        text = response.text.strip()
        
        # Clean up markdown code blocks if present
        if text.startswith('```json'):
            text = text[7:]
        if text.startswith('```'):
            text = text[3:]
        if text.endswith('```'):
            text = text[:-3]
        text = text.strip()
        
        # Parse JSON
        data = json.loads(text)
        
        # Add extraction metadata
        data['extraction_success'] = True
        data['raw_response'] = response.text[:500]  # Keep first 500 chars for debugging
        
        return data
        
    except json.JSONDecodeError as e:
        return {
            'extraction_success': False,
            'error': f'Failed to parse JSON from Gemini response: {str(e)}',
            'raw_response': response.text if 'response' in locals() else None
        }
    except Exception as e:
        return {
            'extraction_success': False,
            'error': str(e),
            'raw_response': None
        }


def chat_with_soil_context(
    soil_data: Dict[str, Any],
    user_message: str,
    chat_history: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """Chat with AI about crop suitability and farming advice based on soil report data.
    
    Args:
        soil_data: Extracted soil parameters from report
        user_message: User's question
        chat_history: List of previous messages [{"role": "user"|"assistant", "content": "..."}]
    
    Returns:
        Dict with 'response' and 'updated_history'
    """
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    
    genai.configure(api_key=api_key)
    
    # Detect language preference from user_message (simple heuristic)
    import re
    contains_devanagari = bool(re.search(r'[\u0900-\u097F]', user_message or ''))
    language_instruction = "Use both English and Hindi crop names when helpful." if contains_devanagari else "Respond in English only."

    # Build system context from soil data
    params = soil_data.get('parameters', {})

    system_context = f"""You are an expert agricultural advisor helping a farmer understand their soil and make crop decisions.

SOIL ANALYSIS DATA:
Laboratory: {soil_data.get('lab_name', 'Not specified')}
Report Date: {soil_data.get('report_date', 'Not specified')}
Location: {soil_data.get('village', 'Not specified')}

SOIL PARAMETERS:
- pH: {params.get('ph', 'Not measured')}
- Electrical Conductivity: {params.get('electrical_conductivity', 'Not measured')} dS/m
- Organic Carbon: {params.get('organic_carbon', 'Not measured')}%
- Nitrogen (N): {params.get('nitrogen_n', 'Not measured')} kg/ha
- Phosphorus (P): {params.get('phosphorus_p', 'Not measured')} kg/ha
- Potassium (K): {params.get('potassium_k', 'Not measured')} kg/ha
- Sulphur (S): {params.get('sulphur_s', 'Not measured')} kg/ha
- Zinc (Zn): {params.get('zinc_zn', 'Not measured')} ppm
- Iron (Fe): {params.get('iron_fe', 'Not measured')} ppm
- Copper (Cu): {params.get('copper_cu', 'Not measured')} ppm
- Manganese (Mn): {params.get('manganese_mn', 'Not measured')} ppm
- Boron (B): {params.get('boron_b', 'Not measured')} ppm
- Soil Texture: {soil_data.get('soil_texture', 'Not specified')}

Lab Recommendations: {soil_data.get('recommendations', 'None provided')}

Your role:
1. Answer questions about crop suitability based on this soil data
2. Explain which crops will grow well and why
3. Suggest fertilizer corrections if needed
4. Be specific about NPK ratios and micronutrients
5. Consider pH, EC, and texture in your recommendations
6. Provide practical, actionable advice for Indian farming conditions
7. {language_instruction}

Be conversational, friendly, and helpful. Keep responses concise but informative."""

    try:
        # Prefer a modern Gemini flash model for chat
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Build conversation history
        messages = [system_context]
        
        if chat_history:
            for msg in chat_history:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                if role == 'user':
                    messages.append(f"Farmer: {content}")
                else:
                    messages.append(f"Advisor: {content}")
        
        # Add current user message
        messages.append(f"Farmer: {user_message}")
        
        # Generate response
        full_prompt = "\n\n".join(messages) + "\n\nAdvisor:"
        response = model.generate_content(full_prompt)
        
        assistant_response = response.text.strip()
        
        # Update history
        new_history = chat_history or []
        new_history.append({"role": "user", "content": user_message})
        new_history.append({"role": "assistant", "content": assistant_response})
        
        return {
            'response': assistant_response,
            'updated_history': new_history,
            'success': True
        }
        
    except Exception as e:
        return {
            'response': f"Sorry, I encountered an error: {str(e)}",
            'updated_history': chat_history or [],
            'success': False,
            'error': str(e)
        }
