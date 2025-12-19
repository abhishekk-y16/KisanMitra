"""
Planner Agent
Decomposes complex farmer queries into parallel sub-tasks for specialist agents.
Implements the PLAN step of the Planner-Executor-Validator workflow.
"""
from typing import Dict, Any, List

TASK_TYPES = [
    "vision_diagnostic",      # Leaf/crop disease detection
    "agmarknet_proactive",    # Market prices + 14-day forecast
    "anthrokrishi_parcel",    # Field boundary / parcel data
    "earth_engine_hazards",   # Flood/drought risk
    "weather_check",          # Current weather conditions
    "pesticide_lookup",       # CIB&RC pesticide recommendations
]


def plan_tasks(intent: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Break down user intent into executable sub-tasks.
    Returns a list of task definitions that can be executed in parallel.
    """
    intent_lower = intent.lower()
    tasks: List[Dict[str, Any]] = []

    # Intent: Disease diagnosis
    if any(kw in intent_lower for kw in ["disease", "leaf", "pest", "sick", "yellow", "spots", "blight"]):
        tasks.append({
            "task_type": "vision_diagnostic",
            "priority": 1,
            "inputs": {
                "image_base64": inputs.get("image_base64", ""),
                "crop": inputs.get("crop"),
                "location": inputs.get("location"),
            },
        })
        # Also check hazards if location provided
        if inputs.get("location"):
            tasks.append({
                "task_type": "earth_engine_hazards",
                "priority": 2,
                "inputs": {"location": inputs["location"]},
            })

    # Intent: Market prices
    if any(kw in intent_lower for kw in ["price", "market", "sell", "mandi", "rate", "cost"]):
        tasks.append({
            "task_type": "agmarknet_proactive",
            "priority": 1,
            "inputs": {
                "commodity": inputs.get("commodity", inputs.get("crop", "")),
                "market": inputs.get("market"),
                "state": inputs.get("state"),
            },
        })

    # Intent: Field/parcel info
    if any(kw in intent_lower for kw in ["field", "parcel", "boundary", "land", "area"]):
        tasks.append({
            "task_type": "anthrokrishi_parcel",
            "priority": 1,
            "inputs": {
                "plus_code": inputs.get("plus_code"),
                "location": inputs.get("location"),
            },
        })

    # Intent: Weather/hazards
    if any(kw in intent_lower for kw in ["weather", "rain", "flood", "drought", "water"]):
        if inputs.get("location"):
            tasks.append({
                "task_type": "earth_engine_hazards",
                "priority": 1,
                "inputs": {"location": inputs["location"]},
            })

    # Intent: Pesticide/treatment
    if any(kw in intent_lower for kw in ["pesticide", "spray", "treatment", "medicine", "chemical"]):
        tasks.append({
            "task_type": "pesticide_lookup",
            "priority": 1,
            "inputs": {
                "crop": inputs.get("crop", ""),
                "disease": inputs.get("disease", ""),
            },
        })

    # If no specific intent matched, create a general query task
    if not tasks:
        tasks.append({
            "task_type": "general_query",
            "priority": 1,
            "inputs": inputs,
            "note": "Intent not clearly mapped; may require clarification.",
        })

    return tasks
