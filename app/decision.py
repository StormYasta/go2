from __future__ import annotations

ACTIONS = {
    "IDLE",
    "SEARCH",
    "FORWARD",
    "TURN_LEFT",
    "TURN_RIGHT",
    "STOP",
    "DANCE",
}


def decide_object_action(
    *,
    found: bool,
    center_x: float | None = None,
    area_ratio: float | None = None,
    left_limit: float = 0.42,
    right_limit: float = 0.58,
    stop_area: float = 0.18,
) -> str:
    """Translate a target bounding box into a future robot command.

    center_x and area_ratio are normalized to [0, 1].
    The area heuristic is intentionally only a proxy for distance in this MVP.
    """
    if not found or center_x is None or area_ratio is None:
        return "SEARCH"

    # Safety-first: if the target already occupies a large part of the frame,
    # don't command additional forward/turn movement.
    if area_ratio >= stop_area:
        return "STOP"
    if center_x < left_limit:
        return "TURN_LEFT"
    if center_x > right_limit:
        return "TURN_RIGHT"
    return "FORWARD"


def decide_gesture_action(gesture: str | None) -> str:
    mapping = {
        "OPEN_PALM": "STOP",
        "THUMB_UP": "DANCE",
        "POINT_UP": "FORWARD",
        "POINT_LEFT": "TURN_LEFT",
        "POINT_RIGHT": "TURN_RIGHT",
    }
    return mapping.get(gesture or "", "IDLE")
