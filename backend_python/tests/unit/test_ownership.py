"""Who owns a session or projection document — one definition for every caller."""
from src.db.ownership import GUEST_OWNER_PREFIX, is_owner, real_owners


def test_every_owner_spelling_counts_including_the_legacy_ones():
    assert real_owners({"userId": "u1", "user_id": "u2", "uid": "u3"}) == ["u1", "u2", "u3"]


def test_guest_placeholders_and_empty_values_are_not_owners():
    assert real_owners({"userId": f"{GUEST_OWNER_PREFIX}abc", "user_id": "", "uid": None}) == []


def test_a_document_without_owner_fields_has_no_owner():
    assert real_owners({}) == []


def test_the_same_owner_under_two_spellings_is_listed_once():
    assert real_owners({"userId": "u1", "uid": "u1"}) == ["u1"]


def test_is_owner_on_any_owner_field_spelling():
    assert is_owner({"userId": "u1"}, "u1")
    assert is_owner({"user_id": "u1"}, "u1")
    assert not is_owner({"userId": "u2"}, "u1")


def test_nobody_owns_a_guest_placeholder_or_an_ownerless_document():
    placeholder = f"{GUEST_OWNER_PREFIX}abc"
    assert not is_owner({"userId": placeholder}, placeholder)
    assert not is_owner({}, "u1")
    assert not is_owner({"userId": ""}, "")
