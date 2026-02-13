from datetime import datetime
from src.utils.datetime_utils import utc_now
from typing import Any, Type, Optional, TypeVar
from enum import Enum
import logging
from dateutil import parser

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=Enum)

def parse_firestore_datetime(value: Any) -> datetime:
    """
    Robustly parses a value into a datetime object.
    Handles:
    - Firestore Timestamp/DatetimeWithNanoseconds (has .to_datetime())
    - ISO strings (via dateutil)
    - Existing datetime objects
    - None/Invalid (returns utc_now())
    """
    if value is None:
        return utc_now()
        
    if hasattr(value, "to_datetime"):
        return value.to_datetime()
        
    if isinstance(value, datetime):
        return value
        
    if isinstance(value, str):
        try:
            return parser.parse(value)
        except Exception as e:
            logger.warning(f"Failed to parse datetime string '{value}': {e}")
            return utc_now()
            
    return utc_now()


def parse_enum(enum_cls: Type[T], value: Any, default: T) -> T:
    """
    Robustly parses a value into an Enum member.
    Handles:
    - Valid Enum values
    - Invalid strings (returns default)
    - None (returns default)
    """
    if value is None:
        return default
        
    try:
        return enum_cls(value)
    except ValueError:
        logger.warning(f"Invalid value '{value}' for enum {enum_cls.__name__}, defaulting to {default.value}")
        return default
