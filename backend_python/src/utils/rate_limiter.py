"""
Redis-based rate limiting for Magic Links.

Provides dual-layer protection:
- Per Email: 3 requests/hour
- Per IP: 10 requests/hour
"""

from datetime import timedelta
from typing import Optional
import redis.asyncio as redis
import os

# Redis connection (use environment variables in production)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Rate limits
EMAIL_LIMIT = 3
EMAIL_WINDOW = timedelta(hours=1)
IP_LIMIT = 10
IP_WINDOW = timedelta(hours=1)


class RateLimiter:
    """Redis-backed rate limiter with automatic expiry."""
    
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
    
    async def connect(self):
        """Initialize Redis connection."""
        if not self.redis_client:
            self.redis_client = await redis.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
    
    async def disconnect(self):
        """Close Redis connection."""
        if self.redis_client:
            await self.redis_client.close()
    
    async def check_and_increment(self, key: str, limit: int, window: timedelta) -> bool:
        """
        Check if request is within rate limit and increment counter.
        
        Args:
            key: Redis key (e.g., "ratelimit:email:user@example.com")
            limit: Max requests allowed
            window: Time window for the limit
            
        Returns:
            True if request is allowed, False if rate limit exceeded
        """
        if not self.redis_client:
            await self.connect()
        
        # Get current count
        current = await self.redis_client.get(key)
        
        if current is None:
            # First request - initialize counter
            await self.redis_client.setex(
                key,
                int(window.total_seconds()),
                1
            )
            return True
        
        current_count = int(current)
        
        if current_count >= limit:
            return False  # Rate limit exceeded
        
        # Increment counter
        await self.redis_client.incr(key)
        return True
    
    async def check_email_limit(self, email: str) -> bool:
        """Check if email is within rate limit."""
        key = f"ratelimit:email:{email.lower()}"
        return await self.check_and_increment(key, EMAIL_LIMIT, EMAIL_WINDOW)
    
    async def check_ip_limit(self, ip_address: str) -> bool:
        """Check if IP is within rate limit."""
        key = f"ratelimit:ip:{ip_address}"
        return await self.check_and_increment(key, IP_LIMIT, IP_WINDOW)


# Global instance
rate_limiter = RateLimiter()
