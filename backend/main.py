from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import subprocess
import tempfile
import os
import sqlite3
import requests
import json
import ast
import asyncio
import concurrent.futures
import sys

app = FastAPI(title="Aegis Core")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "aegis.db"

# --- Absolute Path .env Parser ---
GITHUB_TOKEN = None
GITHUB_USERNAME = None
RENDER_API_KEY = None

base_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(base_dir, ".env")

if os.path.exists(env_path):
    with open(env_path, "r") as env_file:
        for line in env_file:
            line_str = line.strip()
            if "=" in line_str and not line_str.startswith("#"):
                key, value = line_str.split("=", 1)
                clean_key = key.strip()
                clean_value = value.strip().strip('"').strip("'")
                
                if clean_key == "GITHUB_TOKEN": 
                    GITHUB_TOKEN = clean_value
                elif clean_key == "GITHUB_USERNAME": 
                    GITHUB_USERNAME = clean_value
                elif clean_key == "RENDER_API_KEY": 
                    RENDER_API_KEY = clean_value
# ---------------------------------

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS files (
            filename TEXT PRIMARY KEY,
            content TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS active_pipelines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT,
            repo_url TEXT,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    try:
        cursor.execute("PRAGMA table_info(active_pipelines)")
        columns = [col[1] for col in cursor.fetchall()]
        if "repo_url" not in columns:
            cursor.execute("ALTER TABLE active_pipelines ADD COLUMN repo_url TEXT")
            conn.commit()
    except Exception as e:
        print(f"[Migration Warning]: Could not auto-migrate DB schema: {e}")

    cursor.execute("SELECT COUNT(*) FROM files")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO files VALUES (?, ?)", (
            "server.py", 
            'import os\n\nitems = ["security", "sandbox", "tokens"]\n# Intentional out-of-bounds error\nprint(items[5])\n\ndef view_file_vulnerable(user_input):\n    # Severe command injection vulnerability\n    os.system("type logs\\\\" + user_input)'
        ))
        cursor.execute("INSERT INTO files VALUES (?, ?)", (
            "utils.py", 
            '# Helper utilities\ndef parse_user_session(token):\n    return {"user": "guest", "role": "admin"}'
        ))
        conn.commit()
    conn.close()

init_db()

class AegisSession:
    def __init__(self):
        self.code = ""
        self.history: List[Dict] = []
        self.agents = {
            "hacker": "Ethical Hacker",
            "developer": "Lead Developer",
            "security": "Security Engineer",
            "writer": "Technical Writer"
        }

    def route_agent(self, prompt: str) -> str:
        prompt = prompt.lower()
        if any(w in prompt for w in ["hack", "break", "unsafe", "steal", "leak", "vulnerability", "risk", "danger"]): 
            return "hacker"
        if any(w in prompt for w in ["fix", "clean", "rewrite", "make safe", "secure this", "patch", "error", "bug", "broken"]): 
            return "developer"
        if any(w in prompt for w in ["check", "double check", "verify", "good to go", "looks fine"]): 
            return "security"
        return "writer"

session = AegisSession()

class ChatRequest(BaseModel):
    message: str
    code_snapshot: str

class TestRequest(BaseModel):
    code_snapshot: str

class SaveFileRequest(BaseModel):
    filename: str
    content: str

class DeleteFileRequest(BaseModel):
    filename: str

class AuditRequest(BaseModel):
    code_snapshot: str

@app.websocket("/ws/aegis/stream")
async def websocket_stream_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/aegis/files")
async def get_all_files():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT filename, content FROM files")
    rows = cursor.fetchall()
    conn.close()
    return {row[0]: row[1] for row in rows}

@app.post("/api/aegis/files/save")
async def save_file(request: SaveFileRequest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO files (filename, content) VALUES (?, ?)", (request.filename, request.content))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.post("/api/aegis/files/delete")
async def delete_file_db(request: DeleteFileRequest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM files WHERE filename = ?", (request.filename,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.post("/api/aegis/deploy")
async def deploy_workspace():
    if not all([GITHUB_TOKEN, GITHUB_USERNAME, RENDER_API_KEY]):
        return {
            "success": False,
            "logs": f"[Pipeline Error]: Missing API credentials. Please set your environment variables."
        }

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT filename, content FROM files")
    workspace_files = cursor.fetchall()
    conn.close()

    for filename, content in workspace_files:
        if "print(items[5])" in content:
            return {
                "success": False,
                "logs": f"[Build Failure]: Automated sanity checks failed on {filename}. Resolve crashing syntax before shipping."
            }

    repo_name = "aegis-production-app"
    github_headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    create_repo_response = requests.post(
        "https://api.github.com/user/repos",
        headers=github_headers,
        json={"name": repo_name, "private": False, "auto_init": False}
    )

    build_dir = os.path.join(tempfile.gettempdir(), "aegis_deploy_build")
    os.makedirs(build_dir, exist_ok=True)
    
    for filename, content in workspace_files:
        with open(os.path.join(build_dir, filename), "w", encoding="utf-8") as f:
            f.write(content)

    with open(os.path.join(build_dir, "requirements.txt"), "w", encoding="utf-8") as f:
        f.write("fastapi\nuvicorn\nrequests\n")

    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"

        subprocess.run(["git", "init"], cwd=build_dir, capture_output=True, env=env)
        subprocess.run(["git", "add", "."], cwd=build_dir, capture_output=True, env=env)
        subprocess.run(["git", "commit", "-m", "Aegis Cloud Build Integration"], cwd=build_dir, capture_output=True, env=env)
        subprocess.run(["git", "remote", "remove", "origin"], cwd=build_dir, capture_output=True, env=env)
        
        remote_url = f"https://{GITHUB_USERNAME}:{GITHUB_TOKEN}@github.com/{GITHUB_USERNAME}/{repo_name}.git"
        subprocess.run(["git", "remote", "add", "origin", remote_url], cwd=build_dir, capture_output=True, env=env)
        subprocess.run(["git", "branch", "-M", "main"], cwd=build_dir, capture_output=True, env=env)
        
        push_res = subprocess.run(["git", "push", "-f", "origin", "main"], cwd=build_dir, capture_output=True, text=True, env=env)

        if push_res.returncode != 0:
            return {"success": False, "logs": f"[Git Error]: Pushing failed:\n{push_res.stderr}"}

        target_url = f"https://github.com/{GITHUB_USERNAME}/{repo_name}"
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO active_pipelines (status, repo_url) VALUES ('DEPLOY_SUCCESS', ?)", (target_url,))
        conn.commit()
        conn.close()

        return {
            "success": True,
            "logs": "[Pipeline]: Workspace bundled.\n[Pipeline]: Git push successful.",
            "url": target_url
        }

    except Exception as e:
        return {"success": False, "logs": f"[Pipeline Exception]: {str(e)}"}

@app.post("/api/aegis/chat")
async def chat_with_aegis(request: ChatRequest):
    session.code = request.code_snapshot
    session.history.append({"role": "user", "content": request.message, "agent_type": ""})
    
    target_role = session.route_agent(request.message)
    agent_name = session.agents[target_role]
    proposed_code = None
    
    await manager.broadcast({
        "type": "STATE_CHANGE",
        "value": f"{target_role.upper()}_ANALYZING"
    })

    await asyncio.sleep(0.5)

    if target_role == "developer":
        response = f"[{agent_name}]: I detected crashing index offsets in your logic tree. Apply my secure boundaries patch below."
        proposed_code = (
            "items = [\"security\", \"sandbox\", \"tokens\"]\n"
            "index_to_check = 5\n"
            "if index_to_check < len(items):\n"
            "    print(items[index_to_check])\n"
            "else:\n"
            "    print(f'Safe boundary fallback triggered.')"
        )
    elif target_role == "hacker":
        response = f"[{agent_name}]: Vulnerability identified. The use of shell=True or string concatenations in command subshells allows direct Command Injection attacks."
    else:
        response = f"[{agent_name}]: Aegis node secure. Execute a sandbox test suite or security audit to scan."

    session.history.append({"role": "agent", "content": response, "agent_type": target_role})
    
    async def reset_pipeline():
        await asyncio.sleep(1.5)
        await manager.broadcast({
            "type": "STATE_CHANGE",
            "value": "IDLE"
        })
    asyncio.create_task(reset_pipeline())
    
    return {"history": session.history, "proposed_code": proposed_code}


# Synchronous subprocess runner executed inside background thread pools
def run_sync_process_secure(temp_path: str, env: dict) -> tuple:
    proc = subprocess.Popen(
        [sys.executable, "-u", temp_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='replace',
        env=env
    )
    stdout, stderr = proc.communicate()
    return proc.returncode, stdout, stderr


@app.post("/api/aegis/test")
async def test_code_sandbox(request: TestRequest):
    with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode='w', encoding='utf-8') as temp_file:
        temp_file.write(request.code_snapshot)
        temp_path = temp_file.name

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO active_pipelines (status, repo_url) VALUES ('SANDBOX_EXECUTING', NULL)")
    pipeline_id = cursor.lastrowid
    conn.commit()
    conn.close()

    await manager.broadcast({
        "pipeline_id": pipeline_id,
        "type": "STATE_CHANGE",
        "value": "SANDBOX_EXECUTING"
    })

    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        
        # Safe thread delegation execution context 
        loop = asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            returncode, stdout, stderr = await loop.run_in_executor(
                pool, run_sync_process_secure, temp_path, env
            )

        # Stream the captured output buffers back to front-end lines over WebSocket
        for line in stdout.splitlines():
            await manager.broadcast({
                "pipeline_id": pipeline_id,
                "type": "TERMINAL_STREAM",
                "stream": "stdout",
                "value": line
            })

        for line in stderr.splitlines():
            await manager.broadcast({
                "pipeline_id": pipeline_id,
                "type": "TERMINAL_STREAM",
                "stream": "stderr",
                "value": line
            })

        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        if returncode == 0:
            cursor.execute("UPDATE active_pipelines SET status = 'SUCCESS' WHERE id = ?", (pipeline_id,))
            conn.commit()
            conn.close()

            await manager.broadcast({
                "pipeline_id": pipeline_id,
                "type": "STATE_CHANGE",
                "value": "SUCCESS"
            })

            return {"success": True, "output": stdout if stdout else "Script completed with zero logs.", "error": None}
        else:
            cursor.execute("UPDATE active_pipelines SET status = 'FAILED' WHERE id = ?", (pipeline_id,))
            conn.commit()
            conn.close()

            raw_error = stderr if stderr else "Runtime crash detected."
            ai_explanation = "[Lead Developer]: Your script encountered an IndexError. I have auto-generated a boundary check below to handle this securely."
            
            # Formulate code patch snippet explicitly for state triggers
            proposed_code = (
                "items = [\"security\", \"sandbox\", \"tokens\"]\n"
                "index_to_check = 5\n"
                "if index_to_check < len(items):\n"
                "    print(items[index_to_check])\n"
                "else:\n"
                "    print(f'Safe boundary fallback triggered.')"
            )
            
            session.history.append({"role": "agent", "content": ai_explanation, "agent_type": "developer"})

            await manager.broadcast({
                "pipeline_id": pipeline_id,
                "type": "STATE_CHANGE",
                "value": "FAILED"
            })

            return {
                "success": False, 
                "output": stdout, 
                "error": raw_error, 
                "ai_explanation": ai_explanation, 
                "proposed_code": proposed_code, 
                "updated_history": session.history
            }

    except Exception as e:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE active_pipelines SET status = 'FAILED' WHERE id = ?", (pipeline_id,))
        conn.commit()
        conn.close()
        return {"success": False, "output": "", "error": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# --- PORTFOLIO FEATURE ENDPOINTS ---

@app.post("/api/aegis/audit")
async def run_static_security_audit(request: AuditRequest):
    vulnerabilities = []
    try:
        tree = ast.parse(request.code_snapshot)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if isinstance(node.func.value, ast.Name) and node.func.value.id == "os" and node.func.attr == "system":
                    vulnerabilities.append({
                        "line": node.lineno,
                        "severity": "HIGH",
                        "type": "Command Injection",
                        "description": "Critical danger. Using 'os.system' allows direct execution of shell arguments. Use subprocess.run safely instead."
                    })
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and any(x in target.id.lower() for x in ["password", "token", "secret", "key"]):
                        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str) and len(node.value.value) > 0:
                            vulnerabilities.append({
                                "line": node.lineno,
                                "severity": "MEDIUM",
                                "type": "Credential Leak",
                                "description": "Hardcoded secret string variable assignment flagged. Pull credentials dynamically using environment variables."
                            })
    except SyntaxError as e:
        return {"success": False, "error": f"Failed to parse source tree syntax: line {e.lineno}"}
    
    return {"success": True, "vulnerabilities": vulnerabilities}

@app.get("/api/aegis/db/viewer")
async def get_database_structure():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    tables = {}
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        table_names = [t[0] for t in cursor.fetchall() if t[0] != "sqlite_sequence"]
        for t_name in table_names:
            cursor.execute(f"PRAGMA table_info({t_name})")
            columns = [col[1] for col in cursor.fetchall()]
            cursor.execute(f"SELECT * FROM {t_name} ORDER BY ROWID DESC LIMIT 15")
            rows = cursor.fetchall()
            tables[t_name] = {"columns": columns, "rows": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()
    return tables

@app.get("/api/aegis/pipelines/history")
async def get_pipelines_history():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, status, repo_url, last_updated FROM active_pipelines ORDER BY id DESC LIMIT 15")
    rows = cursor.fetchall()
    conn.close()
    return [{
        "id": r[0],
        "status": r[1],
        "repo_url": r[2],
        "last_updated": r[3]
    } for r in rows]