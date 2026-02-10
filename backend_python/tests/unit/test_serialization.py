
import unittest
from datetime import datetime, timezone
from enum import Enum
from unittest.mock import MagicMock
from src.utils.serialization import parse_firestore_datetime, parse_enum

class MockDatetimeWithNanoseconds:
    def __init__(self, dt):
        self._dt = dt
    def to_datetime(self):
        return self._dt

class TestEnum(str, Enum):
    A = "a"
    B = "b"

class TestSerialization(unittest.TestCase):
    def test_parse_firestore_datetime_success(self):
        # Native datetime
        now = datetime.now()
        self.assertEqual(parse_firestore_datetime(now), now)

        # Firestore-like object
        mock_fs = MockDatetimeWithNanoseconds(now)
        self.assertEqual(parse_firestore_datetime(mock_fs), now)

        # ISO String
        iso_str = "2023-01-01T12:00:00Z"
        parsed = parse_firestore_datetime(iso_str)
        self.assertEqual(parsed.year, 2023)
        self.assertEqual(parsed.month, 1)
        
    def test_parse_firestore_datetime_failure_defaults_to_now(self):
        # Invalid string
        val = parse_firestore_datetime("not-a-date")
        self.assertIsInstance(val, datetime)
        
        # None
        val = parse_firestore_datetime(None)
        self.assertIsInstance(val, datetime)

    def test_parse_enum_success(self):
        self.assertEqual(parse_enum(TestEnum, "a", TestEnum.B), TestEnum.A)
        self.assertEqual(parse_enum(TestEnum, "b", TestEnum.B), TestEnum.B)

    def test_parse_enum_failure_defaults(self):
        # Invalid value
        self.assertEqual(parse_enum(TestEnum, "z", TestEnum.B), TestEnum.B)
        # None
        self.assertEqual(parse_enum(TestEnum, None, TestEnum.B), TestEnum.B)

if __name__ == '__main__':
    unittest.main()
