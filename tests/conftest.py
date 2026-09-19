"""API 레벨 테스트용 픽스처. DB 대신 MemoryStore, 시계는 주입 가능한 함수로 바꿔 끼운다.

고정 입력 두 개(스펙 "Validation Decisions"):
- public/data/sample_submission.csv → RMSE ≈ 13,189.79, R² ≈ -0.79
- 정답 자체를 제출 → RMSE 0, R² 1
정답 파일은 저장소에 없으므로, 테스트는 작은 합성 정답(ANSWER_ROWS)으로 파싱·제한·리더보드를 검사하고,
실제 answer.csv가 있는 환경에서만 sample_submission 기준값 테스트를 돌린다.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import app
from store import Answers, MemoryStore

ANSWER_ROWS = [(69940, 20299.0), (44315, 13000.0), (10001, 8000.0), (10001, 25000.0), (55555, 15000.0)]


class FakeClock:
    def __init__(self, start: datetime):
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs) -> None:
        self.now += timedelta(**kwargs)


@pytest.fixture
def clock():
    # 2026-09-19 15:00 KST = 06:00 UTC
    return FakeClock(datetime(2026, 9, 19, 6, 0, tzinfo=timezone.utc))


@pytest.fixture
def store():
    return MemoryStore(Answers(ids=[r[0] for r in ANSWER_ROWS], prices=[r[1] for r in ANSWER_ROWS]))


@pytest.fixture
def client(store, clock, monkeypatch):
    monkeypatch.setenv("ADMIN_KEY", "test-admin-key")
    app.state.store = store
    app.state.now = clock
    app.state.answers = None
    with TestClient(app) as c:
        yield c
    app.state.answers = None


def csv_bytes(rows: list[tuple], header: str = "id,price") -> bytes:
    lines = [header] + [f"{a},{b}" for a, b in rows]
    return ("\n".join(lines) + "\n").encode("utf-8")


def submit(client: TestClient, data: bytes, team: str = "3조", nickname: str = "민석"):
    return client.post(
        "/api/submit",
        data={"team": team, "nickname": nickname},
        files={"file": ("submit.csv", data, "text/csv")},
    )


def perfect_rows():
    return [(i, p) for i, p in ANSWER_ROWS]


ADMIN = {"X-Admin-Key": "test-admin-key"}
