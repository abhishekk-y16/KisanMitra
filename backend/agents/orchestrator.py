"""
Lightweight Agent Orchestrator (ReAct-style) for KisanBuddy

Provides a minimal `AgentOrchestrator` with executor registration
and an `orchestrate` method that runs planned tasks and returns
an execution trace suitable for the `/api/orchestrate` endpoint.
"""
from typing import Callable, Dict, Any, List, Optional
import time


class AgentOrchestrator:
    def __init__(self, session_id: Optional[str] = None):
        self.session_id = session_id or f"sess_{int(time.time()*1000)}"
        self.executors: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {}

    def register_executor(self, task_type: str, fn: Callable[[Dict[str, Any]], Dict[str, Any]]):
        self.executors[task_type] = fn

    def orchestrate(self, intent: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # Lazy import planner to avoid cycles
        from .planner import plan_tasks
        from .validator import validate_recommendations

        trace: Dict[str, Any] = {"session": self.session_id, "steps": []}
        tasks = plan_tasks(intent, inputs)
        results: List[Dict[str, Any]] = []
        task_summary = {"total": len(tasks)}

        overall_confidence = 0.0
        for t in tasks:
            tt = t.get("task_type")
            step = {"task_type": tt, "started_at": time.time(), "inputs": t.get("inputs", {})}
            exec_fn = self.executors.get(tt)
            if not exec_fn:
                step["error"] = "no_executor_registered"
                step["finished_at"] = time.time()
                trace["steps"].append(step)
                results.append({"task_type": tt, "error": "no executor"})
                continue

            try:
                out = exec_fn(t.get("inputs", {}))
                step["result"] = out
                conf = out.get("confidence", 0.5) if isinstance(out, dict) else 0.5
                overall_confidence += float(conf)
                results.append({"task_type": tt, "result": out})
            except Exception as e:
                step["error"] = str(e)
                results.append({"task_type": tt, "error": str(e)})
            step["finished_at"] = time.time()
            trace["steps"].append(step)

        # simple averaging
        overall_conf = overall_confidence / max(len(tasks), 1)

        # Fake recommendations aggregation: try to validate pesticide recommendations
        recommendations: List[Dict[str, Any]] = []
        # search results for chemical recs
        for r in results:
            res = r.get("result") or {}
            if isinstance(res, dict):
                recs = res.get("recommendations") or res.get("chemical_recommendations") or []
                if isinstance(recs, list) and recs:
                    recommendations.extend(recs)

        validation = None
        if recommendations:
            validation = validate_recommendations(inputs.get("crop", ""), recommendations, {"region": inputs.get("region")})

        return {
            "status": "ok",
            "results": results,
            "task_summary": task_summary,
            "confidence": {"overall": overall_conf},
            "validation": validation,
            "recommendations": recommendations,
            "trace": trace,
            "warnings": []
        }


def create_orchestrator(session_id: Optional[str] = None) -> AgentOrchestrator:
    return AgentOrchestrator(session_id)
