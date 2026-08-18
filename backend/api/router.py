from fastapi import APIRouter
from backend.agents.sample_agent import run_sample_agent

api_router = APIRouter()

@api_router.get("/status")
def get_status():
    return {"status": "ok", "message": "API routers are fully functional"}

@api_router.post("/agent/run")
def run_agent_endpoint(prompt: str):
    response = run_sample_agent(prompt)
    return {"response": response}
from pydantic import BaseModel
from backend.agents.engine import secure_code_pipeline

class ScanRequest(BaseModel):
    file_path: str
    code_content: str

@api_router.post("/scan")
async def scan_endpoint(request: ScanRequest):
    vulnerability_report, patched_code = await secure_code_pipeline(request.file_path, request.code_content)
    return {
        "vulnerability_report": vulnerability_report,
        "patched_code": patched_code
    }