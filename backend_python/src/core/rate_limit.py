"""
Shared slowapi Limiter instance.

Import this in main.py AND in every router that needs rate limiting,
so they all share the same limiter registered in app.state.limiter.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
