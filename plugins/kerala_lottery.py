import json
import requests

PLUGIN = {
    "name": "kerala_lottery_result",
    "description": (
        "Get the latest Kerala State Lottery results. Use this tool when the user "
        "asks for the Kerala lottery result, today's lottery, or winning numbers for any prize."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {},
        "required": [],
    },
}

def run(parameters: dict, player=None, session_memory=None) -> str:
    try:
        url = "https://raw.githubusercontent.com/Babuperumana/kerala-lottery-api/main/result.json"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        if not data:
            return "Sir, I could not find any recent lottery results at this moment."
        
        latest_result = data[0] if isinstance(data, list) else data
        date = latest_result.get("date", "Unknown Date")
        name = latest_result.get("name", "Unknown Lottery")
        
        if player:
            try:
                player.write_log(f"JARVIS: Fetched full results for {name} on {date}.")
            except Exception:
                pass
                
        # Return the complete dictionary as a JSON string so Gemini can extract any prize
        return json.dumps({
            "lottery_name": name,
            "date": date,
            "prizes": latest_result.get("prizes", {})
        }, ensure_ascii=False)
        
    except Exception as e:
        error_msg = f"Sir, I encountered an error while fetching the Kerala lottery results: {e}"
        if player:
            try:
                player.write_log(f"JARVIS: {error_msg}")
            except Exception:
                pass
        return error_msg
