import requests
import json

url = "http://127.0.0.1:8000/api/scan"

# Vulnerable code with an intentional SQL injection function
vulnerable_code = """import sqlite3

def get_user_profile(user_id):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    cursor.execute(query)
    return cursor.fetchall()
"""

payload = {
    "file_path": "vulnerable_code.py",
    "code_content": vulnerable_code
}

headers = {
    "Content-Type": "application/json"
}

try:
    print("Sending POST request to:", url)
    response = requests.post(url, json=payload, headers=headers)
    print("Status Code:", response.status_code)
    
    if response.status_code == 200:
        print("\n--- JSON Response ---")
        print(json.dumps(response.json(), indent=2))
    else:
        print("Error Response text:")
        print(response.text)
except Exception as e:
    print("An error occurred while connecting to the API:")
    print(e)
