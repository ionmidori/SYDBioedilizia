"""
Quick unit test for ProjectListItem datetime serializer.
Run: uv run python test_serializer.py
"""
from datetime import datetime, timezone, timedelta

def serialize_dt(dt: datetime) -> str:
    """Same logic as project.py field_serializer."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")

results = []

# T1: Naive datetime → must end with Z
out1 = serialize_dt(datetime(2026, 2, 26, 22, 0, 0))
assert out1 == "2026-02-26T22:00:00Z", f"FAIL T1: got {out1}"
results.append(f"✅ T1 naive → {out1}")

# T2: UTC aware → must end with Z (not +00:00)
out2 = serialize_dt(datetime(2026, 2, 26, 22, 0, 0, tzinfo=timezone.utc))
assert out2 == "2026-02-26T22:00:00Z", f"FAIL T2: got {out2}"
results.append(f"✅ T2 UTC aware → {out2}")

# T3: Aware with offset (e.g. Rome +01:00) → must preserve offset (still Zod-valid)
tz_rome = timezone(timedelta(hours=1))
out3 = serialize_dt(datetime(2026, 2, 26, 22, 0, 0, tzinfo=tz_rome))
assert "+01:00" in out3, f"FAIL T3: got {out3}"
results.append(f"✅ T3 +01:00 offset → {out3}")

# T4: Firestore-style microseconds
out4 = serialize_dt(datetime(2026, 2, 26, 10, 30, 45, 123456, tzinfo=timezone.utc))
assert out4.endswith("Z"), f"FAIL T4: got {out4}"
results.append(f"✅ T4 microseconds UTC → {out4}")

print("\n".join(results))
print("\n✅ ALL SERIALIZER TESTS PASSED")
