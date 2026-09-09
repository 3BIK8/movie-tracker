import requests

url = "http://localhost:11434/api/chat"

payload = {
    "model": "qwen3:8b",
    "messages": [
        {
            "role": "user",
            "content": "Explain in 3 sentences why recommendation algorithms need negative feedback."
        }
    ],
    "stream": False,
}

response = requests.post(url, json=payload, timeout=120)
response.raise_for_status()

data = response.json()

print(data["message"]["content"])