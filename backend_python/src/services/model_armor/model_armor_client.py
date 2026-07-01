"""
Model Armor Client — Singleton wrapper around google.cloud.modelarmor_v1.

Provides sanitize_prompt() and sanitize_response() methods with graceful
degradation (fail-open) if the API is unavailable.

Architecture:
    - Uses regional endpoints: modelarmor.{location}.rep.googleapis.com
    - Template ID defines active filters (RAI, PI, SDP, malicious URIs, CSAM)
    - REST transport for compatibility with Cloud Run / containerized envs

References:
    - https://docs.cloud.google.com/model-armor/sanitize-prompts-responses
    - OWASP LLM01 (Prompt Injection), OWASP LLM02 (Insecure Output)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from google.api_core.client_options import ClientOptions
from google.api_core.exceptions import GoogleAPIError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SanitizationVerdict:
    """Simplified result from Model Armor API call."""

    is_blocked: bool
    filter_match_state: str  # "MATCH_FOUND" | "NO_MATCH_FOUND"
    matched_filters: dict[str, str]  # filter_name -> match_state
    raw_response: object  # Original API response for debugging


class ModelArmorService:
    """Singleton client for Google Cloud Model Armor API.

    Usage::

        service = get_model_armor_service()
        verdict = service.sanitize_prompt("user input text")
        if verdict.is_blocked:
            # reject prompt
    """

    def __init__(
        self,
        project_id: str,
        location: str,
        template_id: str,
    ) -> None:
        self._project_id = project_id
        self._location = location
        self._template_id = template_id
        self._template_name = (
            f"projects/{project_id}/locations/{location}/templates/{template_id}"
        )
        self._client = self._create_client()
        logger.info(
            "[ModelArmor] Initialized — project=%s location=%s template=%s",
            project_id,
            location,
            template_id,
        )

    def _create_client(self):
        """Create ModelArmorClient with regional endpoint (REST transport)."""
        from google.cloud import modelarmor_v1

        return modelarmor_v1.ModelArmorClient(
            transport="rest",
            client_options=ClientOptions(
                api_endpoint=f"modelarmor.{self._location}.rep.googleapis.com"
            ),
        )

    @staticmethod
    def _error_verdict(state: str) -> "SanitizationVerdict":
        """Verdict returned when a Model Armor call fails (F-02).

        Fail-open (is_blocked=False) by default to preserve availability; set
        MODEL_ARMOR_FAIL_CLOSED=True to block on error/timeout instead.
        """
        from src.core.config import settings

        return SanitizationVerdict(
            is_blocked=settings.MODEL_ARMOR_FAIL_CLOSED,
            filter_match_state=state,
            matched_filters={},
            raw_response=None,
        )

    def sanitize_prompt(self, text: str) -> SanitizationVerdict:
        """Sanitize a user prompt via Model Armor API.

        Args:
            text: The raw user prompt text to scan.

        Returns:
            SanitizationVerdict with is_blocked=True if any filter matched.

        Raises:
            Never — all API errors are caught and result in fail-open verdict.
        """
        try:
            from google.cloud import modelarmor_v1

            request = modelarmor_v1.SanitizeUserPromptRequest(
                name=self._template_name,
                user_prompt_data=modelarmor_v1.DataItem(text=text),
            )
            response = self._client.sanitize_user_prompt(request=request)
            return self._parse_result(response.sanitization_result)
        except GoogleAPIError as exc:
            logger.warning(
                "[ModelArmor] API error on sanitize_prompt: %s",
                exc,
                exc_info=True,
            )
            return self._error_verdict("API_ERROR")
        except Exception as exc:
            logger.error(
                "[ModelArmor] Unexpected error on sanitize_prompt: %s",
                exc,
                exc_info=True,
            )
            return self._error_verdict("UNEXPECTED_ERROR")

    def sanitize_response(self, text: str) -> SanitizationVerdict:
        """Sanitize a model response via Model Armor API.

        Args:
            text: The raw model response text to scan.

        Returns:
            SanitizationVerdict with is_blocked=True if any filter matched.

        Raises:
            Never — all API errors are caught and result in fail-open verdict.
        """
        try:
            from google.cloud import modelarmor_v1

            request = modelarmor_v1.SanitizeModelResponseRequest(
                name=self._template_name,
                model_response_data=modelarmor_v1.DataItem(text=text),
            )
            response = self._client.sanitize_model_response(request=request)
            return self._parse_result(response.sanitization_result)
        except GoogleAPIError as exc:
            logger.warning(
                "[ModelArmor] API error on sanitize_response: %s",
                exc,
                exc_info=True,
            )
            return self._error_verdict("API_ERROR")
        except Exception as exc:
            logger.error(
                "[ModelArmor] Unexpected error on sanitize_response: %s",
                exc,
                exc_info=True,
            )
            return self._error_verdict("UNEXPECTED_ERROR")

    @staticmethod
    def _parse_result(sanitization_result) -> SanitizationVerdict:
        """Parse the sanitization_result proto into a typed SanitizationVerdict.

        Filter key mapping (API response key → proto attribute):
            'rai'              → rai_filter_result
            'pi_and_jailbreak' → pi_and_jailbreak_filter_result
            'malicious_uris'   → malicious_uri_filter_result
            'csam'             → csam_filter_filter_result  (always active, not configurable)
            'sdp'              → sdp_filter_result

        Note: CSAM detection is always enforced by the Model Armor infrastructure
        regardless of filterConfig. It cannot be disabled via template settings.
        """
        filter_match_state = str(sanitization_result.filter_match_state)
        is_blocked = "MATCH_FOUND" in filter_match_state

        # The filter_results map key already identifies which oneof member is
        # set, so read that attribute directly. NOTE: hasattr() cannot detect
        # presence on a proto message (every schema field always "exists"), which
        # made the previous hasattr-chain always take the rai branch and mislabel
        # every other filter. proto-plus does not expose HasField() either, so we
        # key off the map key instead of probing presence (Gemini review).
        _KEY_TO_ATTR = {
            "rai": "rai_filter_result",
            "pi_and_jailbreak": "pi_and_jailbreak_filter_result",
            "malicious_uris": "malicious_uri_filter_result",
            # CSAM: always executed (EXECUTION_SUCCESS), not configurable in template.
            "csam": "csam_filter_filter_result",
            "sdp": "sdp_filter_result",
        }
        matched_filters: dict[str, str] = {}
        for filter_key, filter_value in sanitization_result.filter_results.items():
            attr_name = _KEY_TO_ATTR.get(filter_key)
            sub_result = getattr(filter_value, attr_name, None) if attr_name else None
            if sub_result is not None and hasattr(sub_result, "match_state"):
                matched_filters[filter_key] = str(sub_result.match_state)

        return SanitizationVerdict(
            is_blocked=is_blocked,
            filter_match_state=filter_match_state,
            matched_filters=matched_filters,
            raw_response=sanitization_result,
        )


@lru_cache(maxsize=1)
def get_model_armor_service() -> Optional[ModelArmorService]:
    """Factory/singleton for ModelArmorService.

    Returns None if Model Armor is disabled or misconfigured.
    """
    from src.core.config import settings

    if not settings.MODEL_ARMOR_ENABLED:
        logger.debug("[ModelArmor] Disabled via MODEL_ARMOR_ENABLED=False")
        return None

    if not settings.MODEL_ARMOR_TEMPLATE_ID:
        logger.warning(
            "[ModelArmor] Enabled but MODEL_ARMOR_TEMPLATE_ID is empty — disabling"
        )
        return None

    project_id = settings.GOOGLE_CLOUD_PROJECT
    if not project_id:
        logger.warning(
            "[ModelArmor] Enabled but GOOGLE_CLOUD_PROJECT is empty — disabling"
        )
        return None

    return ModelArmorService(
        project_id=project_id,
        location=settings.MODEL_ARMOR_LOCATION,
        template_id=settings.MODEL_ARMOR_TEMPLATE_ID,
    )
