"""계정과 세션.

- 비밀번호는 PBKDF2-SHA256으로 해시한다(표준 라이브러리만 사용).
- 세션은 서버에 저장하지 않는다. 쿠키에 `사용자id.만료시각.서명`을 담고 SESSION_SECRET으로 HMAC 서명한다.
  로그아웃은 쿠키를 지우는 것으로 끝난다(서명된 토큰 자체를 무효화하지는 않는다).
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time

PBKDF2_ITERATIONS = 600_000
SESSION_COOKIE = "iba_session"
SESSION_TTL = 30 * 24 * 3600  # 30일

USERNAME_RE = re.compile(r"^[a-z0-9_]{4,20}$")
MIN_PASSWORD_LEN = 8
MAX_PASSWORD_LEN = 72


class AccountError(ValueError):
    pass


def clean_username(raw: str) -> str:
    name = raw.strip().lower()
    if not USERNAME_RE.fullmatch(name):
        raise AccountError("아이디는 영문 소문자·숫자·밑줄(_)로 4~20자여야 합니다.")
    return name


def check_password_rules(password: str) -> None:
    if not MIN_PASSWORD_LEN <= len(password) <= MAX_PASSWORD_LEN:
        raise AccountError(f"비밀번호는 {MIN_PASSWORD_LEN}~{MAX_PASSWORD_LEN}자여야 합니다.")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    return hmac.compare_digest(digest.hex(), digest_hex)


def _secret() -> bytes:
    secret = os.environ.get("SESSION_SECRET", "")
    if not secret:
        raise RuntimeError("SESSION_SECRET 환경변수가 없습니다.")
    return secret.encode()


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


def make_session(user_id: int, now: float | None = None) -> str:
    expires = int((now if now is not None else time.time()) + SESSION_TTL)
    payload = f"{user_id}.{expires}"
    return f"{payload}.{_sign(payload)}"


def read_session(token: str | None, now: float | None = None) -> int | None:
    """서명과 만료를 확인하고 사용자 id를 돌려준다. 잘못된 토큰이면 None."""
    if not token:
        return None
    parts = token.split(".")
    if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit():
        return None
    payload = f"{parts[0]}.{parts[1]}"
    if not hmac.compare_digest(_sign(payload), parts[2]):
        return None
    if int(parts[1]) < (now if now is not None else time.time()):
        return None
    return int(parts[0])
