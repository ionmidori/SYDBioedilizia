"""Phase 140 step 3: what the client may send from the confirmation card."""
import pytest
from pydantic import ValidationError
from src.schemas.confirmation import ConfirmationUpdate


@pytest.mark.parametrize("body", [
    pytest.param({}, id="nothing-to-confirm"),
    pytest.param({"measures": [{"name": "volume", "value": 3}]}, id="unknown-measure"),
    pytest.param({"measures": [{"name": "mq", "value": 10_001}]}, id="measure-too-large"),
    pytest.param({"measures": [{"name": "mq", "value": -1}]}, id="negative-measure"),
    pytest.param({"measures": [{"name": "mq", "value": 6}, {"name": "mq", "value": 7}]}, id="measure-twice"),
    pytest.param({"element_choices": [{"element": "sanitari", "action": "demolish"}]}, id="unknown-action"),
    pytest.param({"element_choices": [{"element": "sanitari", "action": "keep"},
                                      {"element": "sanitari", "action": "reuse"}]}, id="element-twice"),
    pytest.param({"measures": [], "extra": 1}, id="extra-field"),
])
def test_invalid_updates_are_rejected(body: dict) -> None:
    with pytest.raises(ValidationError):
        ConfirmationUpdate.model_validate(body)


def test_a_valid_update() -> None:
    update = ConfirmationUpdate.model_validate(
        {"measures": [{"name": "mq", "value": 6.5}], "element_choices": [{"element": "sanitari", "action": "keep"}]}
    )
    assert update.measures[0].value == 6.5 and update.element_choices[0].action == "keep"
