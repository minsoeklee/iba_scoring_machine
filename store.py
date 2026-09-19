"""저장소 계층. 운영은 PostgresStore(Neon), 테스트는 MemoryStore.

두 구현은 같은 규칙을 지킨다:
- 삭제된 제출(deleted_at IS NOT NULL)은 리더보드·오늘 횟수·순위 계산에서 제외한다.
- 리더보드는 팀별 최고 기록 1건: RMSE 오름차순, 같으면 R² 내림차순, 같으면 먼저 제출한 쪽.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol


@dataclass(frozen=True)
class Answers:
    ids: list[int]
    prices: list[float]


@dataclass
class Submission:
    id: int
    team_key: str
    team_display: str
    nickname: str
    rmse: float
    r2: float
    negative_clipped: int
    submitted_at: datetime
    deleted_at: datetime | None = None


@dataclass(frozen=True)
class LeaderboardRow:
    rank: int
    team: str
    nickname: str
    rmse: float
    r2: float
    submitted_at: datetime
    team_key: str = field(repr=False)


def _rank(rows: list[Submission]) -> list[LeaderboardRow]:
    best: dict[str, Submission] = {}
    for s in rows:
        if s.deleted_at is not None:
            continue
        cur = best.get(s.team_key)
        if cur is None or (s.rmse, -s.r2, s.submitted_at) < (cur.rmse, -cur.r2, cur.submitted_at):
            best[s.team_key] = s
    ordered = sorted(best.values(), key=lambda s: (s.rmse, -s.r2, s.submitted_at))
    return [
        LeaderboardRow(
            rank=i + 1,
            team=s.team_display,
            nickname=s.nickname,
            rmse=s.rmse,
            r2=s.r2,
            submitted_at=s.submitted_at,
            team_key=s.team_key,
        )
        for i, s in enumerate(ordered)
    ]


class Store(Protocol):
    def load_answers(self) -> Answers: ...
    def count_submissions_between(self, team_key: str, start: datetime, end: datetime) -> int: ...
    def first_team_display(self, team_key: str) -> str | None: ...
    def insert_submission(self, s: Submission) -> int: ...
    def leaderboard(self) -> list[LeaderboardRow]: ...
    def list_submissions(self, team_key: str) -> list[Submission]: ...
    def soft_delete(self, submission_id: int, now: datetime) -> bool: ...


class MemoryStore:
    def __init__(self, answers: Answers):
        self._answers = answers
        self._rows: list[Submission] = []

    def load_answers(self) -> Answers:
        return self._answers

    def count_submissions_between(self, team_key: str, start: datetime, end: datetime) -> int:
        return sum(
            1
            for s in self._rows
            if s.team_key == team_key and s.deleted_at is None and start <= s.submitted_at < end
        )

    def first_team_display(self, team_key: str) -> str | None:
        for s in self._rows:
            if s.team_key == team_key:
                return s.team_display
        return None

    def insert_submission(self, s: Submission) -> int:
        s.id = len(self._rows) + 1
        self._rows.append(s)
        return s.id

    def leaderboard(self) -> list[LeaderboardRow]:
        return _rank(self._rows)

    def list_submissions(self, team_key: str) -> list[Submission]:
        return [s for s in self._rows if s.team_key == team_key]

    def soft_delete(self, submission_id: int, now: datetime) -> bool:
        for s in self._rows:
            if s.id == submission_id and s.deleted_at is None:
                s.deleted_at = now
                return True
        return False


class PostgresStore:
    """Neon Postgres. 서버리스라 요청마다 짧은 연결을 연다(기수당 수백 요청 규모)."""

    def __init__(self, dsn: str | None = None):
        self._dsn = dsn or os.environ["DATABASE_URL"]

    def _connect(self):
        import psycopg

        return psycopg.connect(self._dsn, connect_timeout=10)

    def load_answers(self) -> Answers:
        with self._connect() as conn:
            rows = conn.execute("SELECT id, price FROM answers ORDER BY row_no").fetchall()
        return Answers(ids=[int(r[0]) for r in rows], prices=[float(r[1]) for r in rows])

    def count_submissions_between(self, team_key: str, start: datetime, end: datetime) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT count(*) FROM submissions "
                "WHERE team_key = %s AND deleted_at IS NULL AND submitted_at >= %s AND submitted_at < %s",
                (team_key, start, end),
            ).fetchone()
        return int(row[0])

    def first_team_display(self, team_key: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT team_display FROM submissions WHERE team_key = %s ORDER BY id LIMIT 1",
                (team_key,),
            ).fetchone()
        return row[0] if row else None

    def insert_submission(self, s: Submission) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "INSERT INTO submissions "
                "(team_key, team_display, nickname, rmse, r2, negative_clipped, submitted_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (s.team_key, s.team_display, s.nickname, s.rmse, s.r2, s.negative_clipped, s.submitted_at),
            ).fetchone()
            conn.commit()
        s.id = int(row[0])
        return s.id

    def _all_active(self) -> list[Submission]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, team_key, team_display, nickname, rmse, r2, negative_clipped, submitted_at, deleted_at "
                "FROM submissions WHERE deleted_at IS NULL"
            ).fetchall()
        return [_row_to_submission(r) for r in rows]

    def leaderboard(self) -> list[LeaderboardRow]:
        return _rank(self._all_active())

    def list_submissions(self, team_key: str) -> list[Submission]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, team_key, team_display, nickname, rmse, r2, negative_clipped, submitted_at, deleted_at "
                "FROM submissions WHERE team_key = %s ORDER BY id",
                (team_key,),
            ).fetchall()
        return [_row_to_submission(r) for r in rows]

    def soft_delete(self, submission_id: int, now: datetime) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE submissions SET deleted_at = %s WHERE id = %s AND deleted_at IS NULL",
                (now, submission_id),
            )
            conn.commit()
            return cur.rowcount == 1


def _row_to_submission(r) -> Submission:
    submitted = r[7] if r[7].tzinfo else r[7].replace(tzinfo=timezone.utc)
    deleted = r[8]
    if deleted is not None and deleted.tzinfo is None:
        deleted = deleted.replace(tzinfo=timezone.utc)
    return Submission(
        id=int(r[0]),
        team_key=r[1],
        team_display=r[2],
        nickname=r[3],
        rmse=float(r[4]),
        r2=float(r[5]),
        negative_clipped=int(r[6]),
        submitted_at=submitted,
        deleted_at=deleted,
    )
