# Aegis — Multi-Agent Secure Development & Vulnerability Remediation SaaS

An asynchronous, containerized multi-agent development and static application security testing (SAST) workspace. This platform allows users to audit workspace modules for security vulnerabilities, safely execute code in isolated sandboxes with live terminal log streaming, and automatically generate crash repair patches.

Built with a modern, responsive split-screen dashboard resembling production SaaS workspaces.

---

## 🛠️ System Architecture

```text
+-----------------------------------+
|            Frontend UI            |
|   (React / Tailwind / Framer)     |
+-----------------------------------+
                  |
         (JSON / WebSockets)
                  v
+-----------------------------------+
|          FastAPI Backend          |
|      (Asynchronous Engine)        |
+-----------------------------------+
        /                  \
(Audit & Fix)        (Pipeline Logs)
      v                      v
+------------+        +-------------+
|  Gemini    |        |   SQLite    |
| AI Engine  |        |  Database   |
+------------+        +-------------+
```

### Key Engineering Decisions

- **Asynchronous Execution Pipeline:** Built entirely using FastAPI's async endpoints and WebSocket handlers to stream stdout/stderr terminal output in real time without blocking concurrent workspace operations.
- **Multi-Agent Orchestration:** Implemented dedicated system prompts for distinct agent personas (Auditor, Verifier, Lead Developer) to systematically isolate security scanning from code refactoring.
- **Automated Crash Boundary Repair:** When dynamic sandbox execution triggers runtime failures or policy violations, the system automatically constructs diff patches allowing one-click UI application.
- **Isolated Sandbox Execution:** Runs workspace code snapshots in isolated Python subprocesses with safety timeouts to analyze runtime logs and capture stack traces securely.

---

## 🚀 Tech Stack

- **Frontend:** React 18, Tailwind CSS, Framer Motion, Lucide Icons
- **Backend Framework:** FastAPI, Uvicorn
- **Database:** SQLite
- **Real-Time Streaming:** Native WebSockets
- **LLM Orchestration:** Google GenAI SDK (Gemini API), Pydantic
- **Package Management:** Pip / Virtual Environment (`.venv`)

---

## 📦 Local Installation & Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ & npm

### 1. Clone the Repository

```bash
git clone https://github.com/DaherJames/Aegis.git
cd Aegis
```

### 2. Set Up the Virtual Environment

Using standard Python virtual environments:

```bash
# Create the virtual environment
python -m venv .venv

# Activate the virtual environment
# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

# On Windows (CMD):
.\.venv\Scripts\activate.bat

# On macOS/Linux:
source .venv/bin/activate

# Install requirements
pip install fastapi uvicorn google-genai pydantic requests
```

### 3. Configure Environment Variables

Create a `.env` file inside the `backend/` directory:

```env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"
```

### 4. Run the Application

**Start the Backend Server**

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

**Start the Frontend Client**

Open a second terminal window:

```bash
cd frontend
npm install
npm run dev
```

Once running:

1. Open [`http://localhost:5173`](http://localhost:5173) in your browser to launch the Aegis dashboard.
2. Open [`http://127.0.0.1:8000/docs`](http://127.0.0.1:8000/docs) to inspect the FastAPI Swagger documentation.
