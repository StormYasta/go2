from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .robot import ActionGate, MockRobotController
from .vision import VisionEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Robot Vision", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

vision = VisionEngine()
robot = MockRobotController()


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "robot": "mock", "model_classes": len(vision.classes())}


@app.get("/api/classes")
async def classes() -> dict[str, list[str]]:
    return {"classes": vision.classes()}


@app.websocket("/ws/vision")
async def vision_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    config = {"mode": "object_hunt", "target": "bottle"}
    gate = ActionGate(stable_frames=2)

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if text := message.get("text"):
                try:
                    update = json.loads(text)
                    if update.get("mode") in {"object_hunt", "gesture"}:
                        config["mode"] = update["mode"]
                    if isinstance(update.get("target"), str) and update["target"]:
                        config["target"] = update["target"]
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "message": "Config JSON inválido"})
                continue

            payload = message.get("bytes")
            if not payload:
                continue

            array = np.frombuffer(payload, dtype=np.uint8)
            frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
            if frame is None:
                await websocket.send_json({"type": "error", "message": "Frame inválido"})
                continue

            result = await asyncio.to_thread(
                vision.process,
                frame,
                config["mode"],
                config["target"],
            )
            stable_action = gate.update(result["proposed_action"])
            robot.execute(stable_action)

            result["type"] = "vision"
            result["action"] = stable_action
            result["robot"] = "MOCK"
            await websocket.send_json(result)

    except WebSocketDisconnect:
        pass
    finally:
        robot.execute("STOP")
