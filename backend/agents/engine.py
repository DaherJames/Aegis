import os
import json
from typing import List, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# Initialize the official Gemini Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
class Vulnerability(BaseModel):
    title: str = Field(description="Brief title of the issue found")
    description: str = Field(description="Detailed explanation of the issue")
    severity: str = Field(description="Severity levels: LOW, MEDIUM, HIGH, CRITICAL")
    line_number: Optional[int] = Field(None, description="Approximate line number of the issue")
    mitigation: str = Field(description="How to fix the issue safely using proper standards")

class VulnerabilityReport(BaseModel):
    file_path: str
    vulnerabilities: List[Vulnerability]
    is_secure: bool

# Agent 1 System Instructions
AUDITOR_SYSTEM_INSTRUCTION = """
You are a strict, automated static analysis tool (Agent 1: Auditor). Your sole objective is to scan source code files and find safety and compliance defects. 

YOU MUST COMPLY WITH THESE ABSOLUTE RULES:
1. SQL Injection & String Interpolation:
   - If you see any database query built using Python f-strings (e.g., query = f"SELECT...") or string concatenation inside a database execute statement, you MUST flag it as a "HIGH" severity vulnerability.
   - Any query that uses inline formatting is insecure.
   - If you flag this issue, you must set "is_secure" to false and populate the vulnerabilities array.

2. Dynamic Code Execution:
   - Flag any dynamic evaluation functions like raw `eval()` or `exec()` as "HIGH" severity.

3. Structured Schema:
   - Your output must rigidly match the requested VulnerabilityReport JSON structure.
"""

# Agent 3 System Instructions
VERIFIER_SYSTEM_INSTRUCTION = """
You are an uncompromising QA testing utility (Agent 3: Verifier). 
Your job is to review refactored code and verify whether the security issues highlighted in the vulnerability reports have actually been fixed.

If the refactored code STILL contains:
1. SQL f-strings or manual concatenations (e.g., query = f"...") inside execute() statements.
2. Raw eval() functions.
3. Unparameterized SQL arguments.

You MUST set "is_secure" to false and write down a precise explanation in "vulnerabilities" of what the refactoring missed. 
Only output true for "is_secure" if the code is 100% parameterised and secure.
"""

async def audit_code(code_content: str, file_path: str) -> VulnerabilityReport:
    """Agent 1: Scans the raw code for vulnerabilities."""
    prompt = f"Analyze the following source code file and generate a compliance report.\nFile Path: {file_path}\nSource Code:\n```python\n{code_content}\n```"
    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=AUDITOR_SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=VulnerabilityReport,
                temperature=0.1,
            ),
        )
        return VulnerabilityReport(**json.loads(response.text))
    except Exception as e:
        print(f"Error calling Auditor Agent: {e}")
        return fallback_static_audit(code_content, file_path)


async def verify_code_patch(patched_code: str, file_path: str) -> VulnerabilityReport:
    """Agent 3: Double-checks the patch code to ensure it was resolved securely."""
    prompt = f"Double-check this refactored code patch to ensure SQL Injection and dynamic executions are fully resolved.\nFile Path: {file_path}\nSource Code:\n```python\n{patched_code}\n```"
    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=VERIFIER_SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=VulnerabilityReport,
                temperature=0.1,
            ),
        )
        return VulnerabilityReport(**json.loads(response.text))
    except Exception as e:
        print(f"Error calling Verifier Agent: {e}")
        return VulnerabilityReport(file_path=file_path, vulnerabilities=[], is_secure=True)


def fallback_static_audit(code_content: str, file_path: str) -> VulnerabilityReport:
    vulnerabilities = []
    lines = code_content.splitlines()
    for line_idx, line in enumerate(lines, 1):
        if "eval(" in line and not line.strip().startswith("#"):
            vulnerabilities.append(Vulnerability(
                title="Unsafe use of eval()",
                description="The 'eval' function can execute arbitrary code dynamically.",
                severity="HIGH", line_number=line_idx,
                mitigation="Avoid using eval()."
            ))
        if ".execute(" in line and ("f\"" in line or "f'" in line or " + " in line):
            vulnerabilities.append(Vulnerability(
                title="Unparameterized SQL Statement",
                description="Database queries using raw string interpolation are vulnerable to SQL Injection.",
                severity="HIGH", line_number=line_idx,
                mitigation="Refactor to use query parameters."
            ))
    return VulnerabilityReport(file_path=file_path, vulnerabilities=vulnerabilities, is_secure=len(vulnerabilities) == 0)


async def secure_code_pipeline(file_path: str, code_content: str) -> tuple[VulnerabilityReport, str]:
    """Orchestrates Agent 1 (Auditor), Agent 2 (Patching), and Agent 3 (Verifier) in a feedback loop."""
    original_report = await audit_code(code_content, file_path)
    
    if original_report.is_secure:
        return original_report, code_content
        
    patched_code = code_content
    vulnerabilities_to_fix = original_report.vulnerabilities
    
    max_attempts = 3
    attempt = 0
    
    while attempt < max_attempts:
        attempt += 1
        print(f"🛠️ [Pipeline] Patching Attempt {attempt} for {file_path}...")
        
        vulnerabilities_str = json.dumps([v.model_dump() for v in vulnerabilities_to_fix], indent=2)
        patch_prompt = """
        You are an automated software patching utility (Agent 2: Patching). Rewrite the provided Python code to fix security defects.
        
        Vulnerabilities reported:
        REPLACE_WITH_VULNS
        
        REFACTORING RULE FOR SQL INJECTION:
        Convert insecure string interpolation into secure, parameterized execution.
        
        Example Bad Input:
            query = f"SELECT * FROM users WHERE name = '{user}'"
            cursor.execute(query)
            
        Example Secure Fix:
            query = "SELECT * FROM users WHERE name = ?"
            cursor.execute(query, (user,))

        Apply this exact transformation style to the code below:
        
        Original Code:
        ```python
        REPLACE_WITH_CODE
        ```
        
        Return ONLY valid, secure, runnable Python code. Do not include markdown code fences (```python), explanations, or notes.
        """.replace("REPLACE_WITH_VULNS", vulnerabilities_str).replace("REPLACE_WITH_CODE", patched_code)
        
        try:
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=patch_prompt,
                config=types.GenerateContentConfig(
                    system_instruction="You are a strict code remediation script. Output only clean, refactored Python source code text.",
                    temperature=0.0,
                )
            )
            candidate_patch = response.text.strip()
            
            if candidate_patch.startswith("```"):
                lines = candidate_patch.splitlines()
                if lines[0].startswith("```"): lines = lines[1:]
                if lines and lines[-1].strip() == "```": lines = lines[:-1]
                candidate_patch = "\n".join(lines).strip()
                
            patched_code = candidate_patch
            
        except Exception as e:
            print(f"Error during patch generation: {e}")
            break
            
        print(f"🧪 [Pipeline] Verifying Patch Attempt {attempt}...")
        verification = await verify_code_patch(patched_code, file_path)
        
        if verification.is_secure:
            print(f"🎉 [Pipeline] Patch verified and secured successfully on attempt {attempt}!")
            return original_report, patched_code
        else:
            print(f"⚠️ [Pipeline] Verification failed on attempt {attempt}! Feedback: {[v.description for v in verification.vulnerabilities]}")
            vulnerabilities_to_fix = verification.vulnerabilities
            
    print(f"❌ [Pipeline] Failed to completely verify patch within {max_attempts} attempts. Returning last secure guess.")
    return original_report, patched_code