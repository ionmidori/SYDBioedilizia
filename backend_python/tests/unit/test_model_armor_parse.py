"""
ModelArmorService._parse_result against REAL Model Armor protos.

Regression: the verdict was read with `str(enum)`, which on Python >= 3.11
returns "2" for MATCH_FOUND, so no prompt or response was ever blocked.
"""
from google.cloud import modelarmor_v1
from src.services.model_armor.model_armor_client import ModelArmorService

MATCH = modelarmor_v1.FilterMatchState.MATCH_FOUND
NO_MATCH = modelarmor_v1.FilterMatchState.NO_MATCH_FOUND


def _result(state, pi_state):
    return modelarmor_v1.SanitizationResult(
        filter_match_state=state,
        filter_results={
            "pi_and_jailbreak": modelarmor_v1.FilterResult(
                pi_and_jailbreak_filter_result=modelarmor_v1.PiAndJailbreakFilterResult(match_state=pi_state)
            ),
        },
    )


def test_match_found_blocks():
    verdict = ModelArmorService._parse_result(_result(MATCH, MATCH))
    assert verdict.is_blocked is True
    assert verdict.filter_match_state == "MATCH_FOUND"
    assert verdict.matched_filters == {"pi_and_jailbreak": "MATCH_FOUND"}


def test_no_match_found_passes():
    verdict = ModelArmorService._parse_result(_result(NO_MATCH, NO_MATCH))
    assert verdict.is_blocked is False
    assert verdict.filter_match_state == "NO_MATCH_FOUND"
