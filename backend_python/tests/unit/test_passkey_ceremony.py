"""Real WebAuthn ceremony round-trip test for the passkey endpoints (Phase 92c).

The pyright reportAttributeAccessIssue ratchet surfaced that the passkey code
called ``AttestedCredentialData.to_dict()`` / ``.from_dict()`` — methods that do
not exist in python-fido2 2.x (the class is a ``bytes`` subclass). Registration
and authentication were broken symmetrically.

This test drives the four real endpoints with an in-process **software
authenticator** that produces genuine cryptographic material: a real EC P-256
keypair, a real CBOR ``attestationObject`` and a real ECDSA assertion signature.
The ``Fido2Server`` inside the endpoints verifies all of it for real, so the
serialize (register) -> store -> deserialize (authenticate) round-trip is
exercised end to end — the fixture requested to validate the fix.
"""
import json
import os
from unittest.mock import patch

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fido2 import cbor
from fido2.cose import ES256
from fido2.utils import sha256, websafe_encode
from fido2.webauthn import AttestedCredentialData, AuthenticatorData

RP_ID = "localhost"
ORIGIN = "https://localhost"
UID = "user-abc"

# WebAuthn authenticatorData flag bytes
_FLAG_UP_UV_AT = 0x45  # User Present | User Verified | Attested credential data
_FLAG_UP_UV = 0x05  # User Present | User Verified


class SoftwareAuthenticator:
    """Minimal FIDO2 platform authenticator for tests (fmt='none' attestation)."""

    def __init__(self):
        self._priv = ec.generate_private_key(ec.SECP256R1())
        nums = self._priv.public_key().public_numbers()
        self._cose = ES256(
            {1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")}
        )
        self.cred_id = os.urandom(32)
        self.aaguid = b"\x00" * 16
        self.rp_hash = sha256(RP_ID.encode())

    def _client_data(self, typ: str, challenge_b64: str) -> bytes:
        return json.dumps(
            {"type": typ, "challenge": challenge_b64, "origin": ORIGIN, "crossOrigin": False}
        ).encode()

    def make_registration(self, challenge_b64: str, counter: int = 0) -> dict:
        acd = AttestedCredentialData.create(self.aaguid, self.cred_id, self._cose)
        auth_data = AuthenticatorData.create(self.rp_hash, _FLAG_UP_UV_AT, counter, acd)
        cdj = self._client_data("webauthn.create", challenge_b64)
        att = cbor.encode({"fmt": "none", "attStmt": {}, "authData": bytes(auth_data)})
        cid = websafe_encode(self.cred_id)
        return {
            "id": cid,
            "rawId": cid,
            "type": "public-key",
            "response": {
                "clientDataJSON": websafe_encode(cdj),
                "attestationObject": websafe_encode(att),
            },
        }

    def make_assertion(self, challenge_b64: str, counter: int = 1) -> dict:
        auth_data = AuthenticatorData.create(self.rp_hash, _FLAG_UP_UV, counter)
        cdj = self._client_data("webauthn.get", challenge_b64)
        sig = self._priv.sign(bytes(auth_data) + sha256(cdj), ec.ECDSA(hashes.SHA256()))
        cid = websafe_encode(self.cred_id)
        return {
            "id": cid,
            "rawId": cid,
            "type": "public-key",
            "response": {
                "clientDataJSON": websafe_encode(cdj),
                "authenticatorData": websafe_encode(bytes(auth_data)),
                "signature": websafe_encode(sig),
                "userHandle": websafe_encode(UID.encode()),
            },
        }


# ── Minimal in-memory Firestore for the users/{uid}/passkeys/{id} path ───────

class _FakeSnapshot:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return self._data


class _FakePasskeyDoc:
    def __init__(self, store, doc_id):
        self._store = store
        self._id = doc_id

    def set(self, data):
        self._store[self._id] = dict(data)

    def get(self):
        return _FakeSnapshot(self._id, self._store.get(self._id))

    def update(self, patch):
        self._store.setdefault(self._id, {}).update(patch)


class _FakePasskeyCollection:
    def __init__(self, store):
        self._store = store

    def document(self, doc_id):
        return _FakePasskeyDoc(self._store, doc_id)

    def stream(self):
        for k, v in list(self._store.items()):
            yield _FakeSnapshot(k, v)


class _FakeUserDoc:
    def __init__(self, store):
        self._store = store

    def collection(self, _name):
        return _FakePasskeyCollection(self._store)


class _FakeUsersCollection:
    def __init__(self, store):
        self._store = store

    def document(self, _uid):
        return _FakeUserDoc(self._store)


class _FakeFirestore:
    """Single-user fake — the test only registers one user's passkeys."""

    def __init__(self):
        self.store: dict = {}

    def collection(self, _name):
        return _FakeUsersCollection(self.store)


@pytest.fixture
def passkey_client():
    from src.api.routes import passkey as pk_mod
    from src.auth.jwt_handler import get_current_user_id

    app = FastAPI()
    app.include_router(pk_mod.router)

    async def _override_uid():
        return UID

    app.dependency_overrides[get_current_user_id] = _override_uid
    return app, pk_mod


def test_passkey_full_ceremony_round_trip(passkey_client):
    app, pk_mod = passkey_client
    fake_db = _FakeFirestore()
    client = TestClient(app)
    authenticator = SoftwareAuthenticator()

    with patch.object(pk_mod, "get_firestore_client", return_value=fake_db), patch.object(
        pk_mod.settings, "RP_ID", "localhost"
    ), patch.object(pk_mod.auth, "create_custom_token", return_value=b"custom-token"):
        # 1) Registration options
        r = client.post(
            "/api/passkey/register/options", json={"user_id": UID}, headers={"origin": ORIGIN}
        )
        assert r.status_code == 200, r.text
        reg_challenge = r.json()["publicKey"]["challenge"]

        # 2) Registration verify (real attestation) — serializes AttestedCredentialData
        reg = authenticator.make_registration(reg_challenge)
        r = client.post("/api/passkey/register/verify", json=reg, headers={"origin": ORIGIN})
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True
        # Credential persisted under its websafe credential id
        assert len(fake_db.store) == 1
        stored_doc = next(iter(fake_db.store.values()))
        assert isinstance(stored_doc["credential_data"], str)  # serialized, not a dict

        # 3) Authentication options
        r = client.post(
            "/api/passkey/authenticate/options", json={"user_id": UID}, headers={"origin": ORIGIN}
        )
        assert r.status_code == 200, r.text
        auth_challenge = r.json()["publicKey"]["challenge"]

        # 4) Authentication verify (real assertion) — deserializes + verifies signature
        assertion = authenticator.make_assertion(auth_challenge, counter=1)
        r = client.post(
            "/api/passkey/authenticate/verify", json=assertion, headers={"origin": ORIGIN}
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        assert body["user_id"] == UID
        assert body["token"] == "custom-token"

    # Signature counter advanced from 0 (registration) to 1 (assertion) and persisted.
    assert next(iter(fake_db.store.values()))["sign_count"] == 1


def test_passkey_authentication_rejects_forged_signature(passkey_client):
    """A tampered assertion signature must be rejected — proves the server does
    real cryptographic verification (guards against a no-op regression)."""
    app, pk_mod = passkey_client
    fake_db = _FakeFirestore()
    client = TestClient(app)
    authenticator = SoftwareAuthenticator()

    with patch.object(pk_mod, "get_firestore_client", return_value=fake_db), patch.object(
        pk_mod.settings, "RP_ID", "localhost"
    ), patch.object(pk_mod.auth, "create_custom_token", return_value=b"custom-token"):
        # Register a real credential first.
        r = client.post(
            "/api/passkey/register/options", json={"user_id": UID}, headers={"origin": ORIGIN}
        )
        reg = authenticator.make_registration(r.json()["publicKey"]["challenge"])
        r = client.post("/api/passkey/register/verify", json=reg, headers={"origin": ORIGIN})
        assert r.status_code == 200, r.text

        # Authentication with a corrupted signature.
        r = client.post(
            "/api/passkey/authenticate/options", json={"user_id": UID}, headers={"origin": ORIGIN}
        )
        assertion = authenticator.make_assertion(r.json()["publicKey"]["challenge"], counter=1)
        forged = websafe_encode(b"\x00" * 70)  # not a valid ECDSA signature
        assertion["response"]["signature"] = forged

        r = client.post(
            "/api/passkey/authenticate/verify", json=assertion, headers={"origin": ORIGIN}
        )
        assert r.status_code == 400, r.text
        # Counter must NOT advance on a rejected assertion.
        assert next(iter(fake_db.store.values()))["sign_count"] == 0


def test_passkey_counter_regression_with_zero_is_rejected(passkey_client):
    """Clone-detection must not be bypassable by a counter of 0.

    A device that increments its counter (stored=5) followed by an assertion
    reporting counter 0 is a regression and must be rejected. The previous
    truthiness check ``stored and new and new <= stored`` let 0 slip through
    because 0 is falsy (WebAuthn spec §6.1.1 treats 0<=stored as a clone signal
    when the stored counter is non-zero).
    """
    app, pk_mod = passkey_client
    fake_db = _FakeFirestore()
    client = TestClient(app)
    authenticator = SoftwareAuthenticator()

    with patch.object(pk_mod, "get_firestore_client", return_value=fake_db), patch.object(
        pk_mod.settings, "RP_ID", "localhost"
    ), patch.object(pk_mod.auth, "create_custom_token", return_value=b"custom-token"):
        # Register with a non-zero counter so stored_sign_count = 5.
        r = client.post(
            "/api/passkey/register/options", json={"user_id": UID}, headers={"origin": ORIGIN}
        )
        reg = authenticator.make_registration(r.json()["publicKey"]["challenge"], counter=5)
        r = client.post("/api/passkey/register/verify", json=reg, headers={"origin": ORIGIN})
        assert r.status_code == 200, r.text
        assert next(iter(fake_db.store.values()))["sign_count"] == 5

        # Assertion reporting counter 0 (a valid signature, but a counter regression).
        r = client.post(
            "/api/passkey/authenticate/options", json={"user_id": UID}, headers={"origin": ORIGIN}
        )
        assertion = authenticator.make_assertion(r.json()["publicKey"]["challenge"], counter=0)
        r = client.post(
            "/api/passkey/authenticate/verify", json=assertion, headers={"origin": ORIGIN}
        )
        assert r.status_code == 401, r.text
        # Stored counter must NOT be reset to 0.
        assert next(iter(fake_db.store.values()))["sign_count"] == 5
