"""UserSession.is_guest: the single definition of "guest" (retention, prompts)."""
import pytest
from src.schemas.internal import UserSession


@pytest.mark.parametrize(
    ("is_authenticated", "is_anonymous", "expected"),
    [
        (True, False, False),   # registered account
        (True, True, True),     # Firebase anonymous sign-in
        (False, False, True),   # no verified identity
        (False, True, True),
    ],
)
def test_is_guest(is_authenticated, is_anonymous, expected):
    session = UserSession(uid="u1", is_authenticated=is_authenticated, is_anonymous=is_anonymous)
    assert session.is_guest is expected


def test_is_guest_is_not_serialized():
    # Derived, not a field: it must not leak into dumps or break extra="forbid".
    session = UserSession(uid="u1", is_authenticated=True)
    assert "is_guest" not in session.model_dump()
