import os
# Force Qt to use offscreen platform to prevent X11 crashes on headless servers
os.environ["QT_QPA_PLATFORM"] = "offscreen"

import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn

import main as jarvis_main

app = FastAPI()

# Make sure static directory exists
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get():
    with open("static/index.html", "r") as f:
        return HTMLResponse(f.read())

class DummyUI:
    def __init__(self):
        self.muted = False
        self._win = self
        self._ready = True
        self.state = "SLEEPING"
    
    def write_log(self, text, prefix=""):
        print(f"[WebUI] {prefix} {text}")
        
    def set_state(self, state):
        self.state = state
        print(f"[WebUI] State changed to: {state}")
        
    def prompt_reconfig(self):
        print("[WebUI] Needs API key reconfiguration!")

class WebJarvisLive(jarvis_main.JarvisLive):
    def __init__(self, websocket: WebSocket):
        super().__init__(DummyUI())
        self.websocket = websocket

    async def _listen_audio(self):
        print("[WebJarvis] 🎤 Websocket audio listener ready")
        # We don't poll the microphone. Audio comes from the websocket loop.
        while True:
            await asyncio.sleep(1)

    async def _receive_audio(self):
        print("[WebJarvis] 👂 Recv started")
        try:
            async for response in self.session.receive():
                if response.data:
                    # Send raw PCM bytes to frontend
                    await self.websocket.send_bytes(response.data)
                
                # We need to handle tool calls exactly like original JarvisLive
                # So it's best to call the original _receive_audio, BUT we can't because it plays to sounddevice!
                # Wait, original _receive_audio buffers data and plays it to `sounddevice`. We don't want that!
                if response.tool_call:
                    await self._handle_tool_call(response.tool_call)
                    
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[WebJarvis] Receive error: {e}")

@app.websocket("/ws/audio")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected")
    
    jarvis = WebJarvisLive(websocket)
    jarvis_task = asyncio.create_task(jarvis.run())
    
    try:
        while True:
            data = await websocket.receive_bytes()
            if jarvis.session and not jarvis._is_speaking and not jarvis.ui.muted:
                await jarvis.out_queue.put({"data": data, "mime_type": "audio/pcm"})
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
        jarvis_task.cancel()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
