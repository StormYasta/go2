from __future__ import annotations

import math
import os
import time
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from ultralytics import YOLO

from .decision import decide_gesture_action, decide_object_action


def _distance(a: Any, b: Any) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


class VisionEngine:
    def __init__(self) -> None:
        model_path = os.getenv("YOLO_MODEL", "/app/yolo11n.pt")
        self.detector = YOLO(model_path)
        self.names = self.detector.names
        self.confidence = float(os.getenv("YOLO_CONFIDENCE", "0.35"))
        self.stop_area = float(os.getenv("OBJECT_STOP_AREA", "0.18"))
        self.image_size = int(os.getenv("YOLO_IMGSZ", "416"))

        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.55,
            min_tracking_confidence=0.50,
        )

    def classes(self) -> list[str]:
        if isinstance(self.names, dict):
            return [self.names[k] for k in sorted(self.names)]
        return list(self.names)

    def process(self, frame: np.ndarray, mode: str, target: str) -> dict[str, Any]:
        started = time.perf_counter()
        if mode == "gesture":
            result = self._gesture(frame)
        else:
            result = self._object_hunt(frame, target)

        result["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
        return result

    def _object_hunt(self, frame: np.ndarray, target: str) -> dict[str, Any]:
        height, width = frame.shape[:2]
        results = self.detector.predict(
            source=frame,
            conf=self.confidence,
            imgsz=self.image_size,
            verbose=False,
            device="cpu",
        )

        detections: list[dict[str, Any]] = []
        candidates: list[dict[str, Any]] = []

        boxes = results[0].boxes if results else None
        if boxes is not None:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                label = self.names[cls_id]
                confidence = float(box.conf[0].item())
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                normalized = {
                    "label": label,
                    "confidence": round(confidence, 3),
                    "x1": x1 / width,
                    "y1": y1 / height,
                    "x2": x2 / width,
                    "y2": y2 / height,
                    "is_target": label == target,
                }
                detections.append(normalized)
                if label == target:
                    candidates.append(normalized)

        best = max(candidates, key=lambda item: item["confidence"], default=None)
        if best is None:
            action = decide_object_action(found=False)
            tracked = None
            status = f"Procurando {target}"
        else:
            center_x = (best["x1"] + best["x2"]) / 2
            area_ratio = max(0.0, best["x2"] - best["x1"]) * max(
                0.0, best["y2"] - best["y1"]
            )
            action = decide_object_action(
                found=True,
                center_x=center_x,
                area_ratio=area_ratio,
                stop_area=self.stop_area,
            )
            tracked = {
                "center_x": round(center_x, 3),
                "area_ratio": round(area_ratio, 3),
                "confidence": best["confidence"],
            }
            status = f"Alvo {target} adquirido"

        return {
            "mode": "object_hunt",
            "proposed_action": action,
            "status": status,
            "target": target,
            "detections": detections[:30],
            "tracked": tracked,
            "hand": None,
        }

    def _gesture(self, frame: np.ndarray) -> dict[str, Any]:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.hands.process(rgb)

        gesture = None
        landmarks_payload = None
        if result.multi_hand_landmarks:
            hand = result.multi_hand_landmarks[0]
            gesture = self._classify_hand(hand.landmark)
            landmarks_payload = [
                {"x": round(p.x, 4), "y": round(p.y, 4), "z": round(p.z, 4)}
                for p in hand.landmark
            ]

        action = decide_gesture_action(gesture)
        return {
            "mode": "gesture",
            "proposed_action": action,
            "status": "Mão detectada" if landmarks_payload else "Mostre uma mão para a câmera",
            "gesture": gesture or "NONE",
            "detections": [],
            "tracked": None,
            "hand": landmarks_payload,
        }

    @staticmethod
    def _classify_hand(lm: list[Any]) -> str | None:
        wrist = lm[0]

        def extended(tip: int, pip: int, mcp: int) -> bool:
            return (
                _distance(lm[tip], wrist) > _distance(lm[pip], wrist) * 1.12
                and _distance(lm[tip], lm[mcp]) > _distance(lm[pip], lm[mcp]) * 1.08
            )

        thumb = extended(4, 3, 2)
        index = extended(8, 6, 5)
        middle = extended(12, 10, 9)
        ring = extended(16, 14, 13)
        pinky = extended(20, 18, 17)

        if index and middle and ring and pinky:
            return "OPEN_PALM"

        folded_others = not middle and not ring and not pinky
        if thumb and not index and folded_others and lm[4].y < lm[3].y:
            return "THUMB_UP"

        if index and folded_others:
            dx = lm[8].x - lm[5].x
            dy = lm[8].y - lm[5].y
            if abs(dx) > abs(dy) * 0.85:
                return "POINT_RIGHT" if dx > 0 else "POINT_LEFT"
            if dy < 0:
                return "POINT_UP"

        return None
