import os
import requests
import json

API_URL = "http://127.0.0.1:8000/api/scan"
# Protect agent engine files and environment folders from being touched
IGNORE_DIRS = {".git", ".venv", "node_modules", "__pycache__", "backend"}
IGNORE_FILES = {"scan_workspace.py", "test_api.py", "test_key.py"}

def scan_workspace(root_dir="."):
    print(f"🔍 Starting workspace scan in: {os.path.abspath(root_dir)}\n")
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Exclude directories
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        
        for filename in filenames:
            if filename.endswith(".py") and filename not in IGNORE_FILES:
                file_path = os.path.join(dirpath, filename)
                print(f"📄 Auditing: {file_path}")
                
                with open(file_path, "r", encoding="utf-8") as f:
                    code_content = f.read()
                
                payload = {
                    "file_path": file_path,
                    "code_content": code_content
                }
                
                try:
                    response = requests.post(API_URL, json=payload)
                    if response.status_code == 200:
                        data = response.json()
                        report = data["vulnerability_report"]
                        
                        if not report["is_secure"]:
                            print(f"❌ Vulnerabilities found in {file_path}!")
                            for vuln in report["vulnerabilities"]:
                                print(f"  - [{vuln['severity']}] {vuln['title']} on Line {vuln['line_number']}")
                            
                            # Overwrite the file with the secure, verified patch
                            with open(file_path, "w", encoding="utf-8") as out_f:
                                out_f.write(data["patched_code"])
                            print(f"✅ Automatically applied secure patches to {file_path}.\n")
                        else:
                            print(f"💚 {file_path} is completely secure.\n")
                    else:
                        print(f"⚠️ Failed to scan {file_path}. Status: {response.status_code}\n")
                except Exception as e:
                    print(f"🚨 Connection error scanning {file_path}: {e}\n")

if __name__ == "__main__":
    scan_workspace()