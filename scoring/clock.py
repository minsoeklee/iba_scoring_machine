"""'하루'의 기준과 대회 마감. 한국 시간(KST) 자정에 제출 횟수가 초기화된다(스펙 18번)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

KST = timezone(timedelta(hours=9), name="KST")
DAILY_LIMIT = 3

# 대회 마지막 날(KST). public/assets/contest.js의 end와 같은 날짜로 맞춘다.
# 다음 날 0시부터 제출을 막고 리더보드를 전체 데이터 기준 최종 순위로 바꾼다.
CONTEST_END = date(2026, 10, 5)


def final_at() -> datetime:
    return datetime.combine(CONTEST_END + timedelta(days=1), time(0, 0), tzinfo=KST)


def is_final(now: datetime) -> bool:
    return now >= final_at()


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
