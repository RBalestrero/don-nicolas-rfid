"""Rate limiting y protección de fuerza bruta en memoria (proceso)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindowCounter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_seconds: float) -> tuple[bool, int]:
        """Registra un hit. Devuelve (permitido, reintentar_en_segundos)."""
        now = time.monotonic()
        with self._lock:
            bucket = self._events[key]
            cutoff = now - window_seconds
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry = int(max(1, window_seconds - (now - bucket[0])))
                return False, retry
            bucket.append(now)
            return True, 0

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


class LoginLockout:
    def __init__(self) -> None:
        self._failures: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def is_locked(self, key: str, max_failures: int, lockout_seconds: float) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            stamps = [t for t in self._failures[key] if now - t < lockout_seconds]
            self._failures[key] = stamps
            if len(stamps) >= max_failures:
                oldest = stamps[0]
                retry = int(max(1, lockout_seconds - (now - oldest)))
                return True, retry
            return False, 0

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(time.monotonic())

    def clear_key(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()


api_rate_limiter = SlidingWindowCounter()
login_rate_limiter = SlidingWindowCounter()
login_lockout = LoginLockout()
