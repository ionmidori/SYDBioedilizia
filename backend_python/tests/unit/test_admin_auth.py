"""Single admin authorisation check (Phase 128)."""
import pytest
from src.auth.admin import ensure_admin, has_admin_role, has_second_factor, require_admin
from src.core.exceptions import AdminRequiredError, AuthError
from src.schemas.internal import UserSession


def _session(**overrides) -> UserSession:
    base = {"uid": "u1", "email": "a@b.it", "is_authenticated": True, "claims": {"role": "admin"}}
    base.update(overrides)
    return UserSession(**base)


def test_role_claim_decides():
    assert has_admin_role(_session())
    assert not has_admin_role(_session(claims={}))
    assert not has_admin_role(_session(claims={"role": "Admin"}))  # exact match only


def test_second_factor_claim():
    assert has_second_factor({"firebase": {"sign_in_second_factor": "totp"}})
    assert not has_second_factor({"firebase": {}})
    assert not has_second_factor({"firebase": "totp"})
    assert not has_second_factor({})


def test_admin_passes():
    session = _session()
    assert ensure_admin(session) is session


def test_non_admin_gets_403_admin_required():
    with pytest.raises(AdminRequiredError) as exc:
        ensure_admin(_session(claims={"role": "user"}))
    assert exc.value.status_code == 403
    assert exc.value.error_code == "ADMIN_REQUIRED"


@pytest.mark.parametrize("overrides", [{"is_authenticated": False}, {"is_anonymous": True}])
def test_unauthenticated_or_anonymous_admin_claim_is_refused(overrides):
    with pytest.raises(AuthError):
        ensure_admin(_session(**overrides))


def test_mfa_enforced_only_when_enabled(monkeypatch):
    from src.auth import admin as admin_module

    monkeypatch.setattr(admin_module.settings, "ADMIN_REQUIRE_MFA", True)
    with pytest.raises(AdminRequiredError):
        ensure_admin(_session())
    with_mfa = _session(claims={"role": "admin", "firebase": {"sign_in_second_factor": "totp"}})
    assert ensure_admin(with_mfa) is with_mfa


async def test_dependency_returns_the_session():
    session = _session()
    assert await require_admin(session) is session
