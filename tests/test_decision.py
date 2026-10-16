import unittest

from app.decision import decide_gesture_action, decide_object_action


class DecisionTests(unittest.TestCase):
    def test_object_search_when_missing(self):
        self.assertEqual(decide_object_action(found=False), "SEARCH")

    def test_object_turns(self):
        self.assertEqual(
            decide_object_action(found=True, center_x=0.20, area_ratio=0.02),
            "TURN_LEFT",
        )
        self.assertEqual(
            decide_object_action(found=True, center_x=0.80, area_ratio=0.02),
            "TURN_RIGHT",
        )

    def test_object_forward_and_stop(self):
        self.assertEqual(
            decide_object_action(found=True, center_x=0.50, area_ratio=0.03),
            "FORWARD",
        )
        self.assertEqual(
            decide_object_action(found=True, center_x=0.50, area_ratio=0.30),
            "STOP",
        )

    def test_gesture_mapping(self):
        self.assertEqual(decide_gesture_action("OPEN_PALM"), "STOP")
        self.assertEqual(decide_gesture_action("THUMB_UP"), "DANCE")
        self.assertEqual(decide_gesture_action("POINT_UP"), "FORWARD")
        self.assertEqual(decide_gesture_action("POINT_LEFT"), "TURN_LEFT")
        self.assertEqual(decide_gesture_action("POINT_RIGHT"), "TURN_RIGHT")
        self.assertEqual(decide_gesture_action(None), "IDLE")


if __name__ == "__main__":
    unittest.main()
