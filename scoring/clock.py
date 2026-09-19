"""'하루'의 기준. 한국 시간(KST) 자정에 제출 횟수가 초기화된다(스펙 18번)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9), name="KST")
DAILY_LIMIT = 3


def day_window(now: datetime) -> tuple[datetime, datetime]:
    """now가 속한 KST 하루의 [시작, 끝) 을 UTC aware datetime으로 돌려준다."""
    if now.tzinfo is None:
        raise ValueError("now는 시간대가 있는 datetime이어야 합니다.")
    local = now.astimezone(KST)
    start_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def resets_at(now: datetime) -> datetime:
    """다음 KST 자정을 KST 표기로 돌려준다(응답에 그대로 쓴다)."""
    _, end_utc = day_window(now)
    return end_utc.astimezone(KST)
