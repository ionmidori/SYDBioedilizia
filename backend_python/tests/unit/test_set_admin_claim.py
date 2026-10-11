"""scripts/set_admin_claim.py: the admin role is merged into the existing
custom claims (never replacing them) and removed without touching the rest."""
import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "set_admin_claim", Path(__file__).resolve().parents[2] / "scripts" / "set_admin_claim.py"
)
assert _SPEC and _SPEC.loader
script = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(script)


def test_grant_keeps_other_claims():
    assert script.plan_claims({"tier": "pro"}, revoke=False) == {"tier": "pro", "role": "admin"}
    assert script.plan_claims(None, revoke=False) == {"role": "admin"}


def test_revoke_removes_only_the_admin_role():
    assert script.plan_claims({"tier": "pro", "role": "admin"}, revoke=True) == {"tier": "pro"}
    assert script.plan_claims({"role": "editor"}, revoke=True) == {"role": "editor"}  # not ours to remove


def test_unverified_email_is_never_granted():
    """The account is looked up by email: an unverified address could belong to
    someone who registered with the admin's email (security review)."""
    assert script.grant_refusal(email_verified=False, has_provider=True, revoke=False)
    assert script.grant_refusal(email_verified=True, has_provider=False, revoke=False)
    assert script.grant_refusal(email_verified=True, has_provider=True, revoke=False) is None
    assert script.grant_refusal(email_verified=False, has_provider=True, revoke=True) is None  # revoking is always ok
