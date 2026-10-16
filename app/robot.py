from __future__ import annotations

import logging
from abc import ABC, abstractmethod

log = logging.getLogger("go2.robot")


class RobotController(ABC):
    """Hardware boundary.

    The vision layer only emits semantic actions. A future Unitree adapter
    should translate these actions to SDK2 high-level movement calls.
    """

    @abstractmethod
    def execute(self, action: str) -> None:
        raise NotImplementedError


class MockRobotController(RobotController):
    def __init__(self) -> None:
        self.current_action = "IDLE"

    def execute(self, action: str) -> None:
        if action == self.current_action:
            return
        log.info("MOCK ROBOT: %s -> %s", self.current_action, action)
        self.current_action = action


class ActionGate:
    """Small debounce layer so one noisy frame does not flip robot state.

    STOP bypasses debounce because a stop command should never be delayed.
    """

    def __init__(self, stable_frames: int = 2) -> None:
        self.stable_frames = max(1, stable_frames)
        self.current = "IDLE"
        self.candidate = "IDLE"
        self.count = 0

    def update(self, proposed: str) -> str:
        if proposed == "STOP":
            self.current = "STOP"
            self.candidate = "STOP"
            self.count = self.stable_frames
            return self.current

        if proposed != self.candidate:
            self.candidate = proposed
            self.count = 1
        else:
            self.count += 1

        if self.count >= self.stable_frames:
            self.current = proposed

        return self.current
