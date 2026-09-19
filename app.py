"""채점 사이트 API. Vercel Python 런타임이 이 파일의 `app`을 찾아 실행한다.

엔드포인트 (스펙 "API 계약"):
- POST   /api/submit                 팀명·닉네임·CSV → 채점·기록
- GET    /api/leaderboard            팀별 최고 기록
- GET    /api/quota?team=            오늘 남은 횟수
- GET    /api/submissions?team=      (관리자) 팀 제출 목록
- DELETE /api/submissions/{id}       (관리자) 소프트 삭제

정적 페이지는 Vercel에서는 public/이 CDN으로 서빙되고, 로컬에서는 이 앱이 public/을 마운트한다.
"""

from __future__ import annotations

import hmac
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from scoring import clock
from scoring.metrics import score
from scoring.parse import SubmissionError, parse_submission
from scoring.teams import NameError_, clean_nickname, clean_team_display, normalize_team
from store import Answers, PostgresStore, Store, Submission

app = FastAPI(title="IBA Scoring Machine", docs_url=None, redoc_url=None)

# --- 의존성 -------------------------------------------------------------------
# 테스트에서는 app.state.store / app.state.now 를 바꿔 끼운다.

def get_store(request: Request) -> Store:
    store = getattr(request.app.state, "store", None)
    if store is None:
        store = _memory_store_for_dev() if os.environ.get("DEV_ANSWER_CSV") else PostgresStore()
        request.app.state.store = store
    return store


def _memory_store_for_dev() -> Store:
    """로컬 개발용: DB 없이 DEV_ANSWER_CSV의 정답으로 메모리 저장소를 쓴다. 재시작하면 제출 기록은 사라진다."""
    import csv

    from store import MemoryStore

    with open(os.environ["DEV_ANSWER_CSV"], newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)
        rows = [(int(float(r[0])), float(r[1])) for r in reader if r and r[0].strip()]
    return MemoryStore(Answers(ids=[r[0] for r in rows], prices=[r[1] for r in rows]))


def get_now(request: Request) -> Callable[[], datetime]:
    return getattr(request.app.state, "now", lambda: datetime.now(timezone.utc))


def get_answers(request: Request, store: Store = Depends(get_store)) -> Answers:
    # 함수 인스턴스 안에서 첫 요청 때 한 번 읽고 메모리에 둔다(스펙 "채점 규칙").
    answers = getattr(request.app.state, "answers", None)
    if answers is None:
        answers = store.load_answers()
        request.app.state.answers = answers
    return answers


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    expected = os.environ.get("ADMIN_KEY", "")
    if not expected or x_admin_key is None or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="관리자 키가 올바르지 않습니다.")


# --- 응답 도우미 ---------------------------------------------------------------


def _quota_body(store: Store, team_key: str, now: datetime) -> dict:
    start, end = clock.day_window(now)
    used = store.count_submissions_between(team_key, start, end)
    return {
        "used_today": used,
        "remaining_today": max(clock.DAILY_LIMIT - used, 0),
        "resets_at": clock.resets_at(now).isoformat(),
    }


def _team_rank(store: Store, team_key: str) -> int | None:
    for row in store.leaderboard():
        if row.team_key == team_key:
            return row.rank
    return None


def _leaderboard_row(row) -> dict:
    return {
        "rank": row.rank,
        "team": row.team,
        "nickname": row.nickname,
        "rmse": row.rmse,
        "r2": row.r2,
        "submitted_at": row.submitted_at.astimezone(clock.KST).isoformat(),
    }


def _submission_row(s: Submission) -> dict:
    return {
        "id": s.id,
        "team": s.team_display,
        "nickname": s.nickname,
        "rmse": s.rmse,
        "r2": s.r2,
        "negative_clipped": s.negative_clipped,
        "submitted_at": s.submitted_at.astimezone(clock.KST).isoformat(),
        "deleted_at": s.deleted_at.astimezone(clock.KST).isoformat() if s.deleted_at else None,
    }


# --- 엔드포인트 ----------------------------------------------------------------


@app.post("/api/submit")
async def submit(
    team: str = Form(...),
    nickname: str = Form(...),
    file: UploadFile = File(...),
    store: Store = Depends(get_store),
    now_fn: Callable[[], datetime] = Depends(get_now),
    answers: Answers = Depends(get_answers),
):
    try:
        team_key = normalize_team(team)
        team_display = clean_team_display(team)
        nick = clean_nickname(nickname)
    except NameError_ as e:
        return JSONResponse(status_code=400, content={"error_code": "bad_name", "message": str(e)})

    now = now_fn()
    quota = _quota_body(store, team_key, now)
    if quota["remaining_today"] <= 0:
        return JSONResponse(
            status_code=429,
            content={
                "error_code": "quota_exceeded",
                "message": f"오늘 제출 횟수 {clock.DAILY_LIMIT}회를 모두 사용했습니다.",
                "resets_at": quota["resets_at"],
            },
        )

    data = await file.read()
    try:
        parsed = parse_submission(data, answers.ids)
    except SubmissionError as e:
        return JSONResponse(status_code=400, content=e.to_dict())

    result = score(answers.prices, parsed.prices)

    # 같은 팀의 첫 표기를 유지한다(리더보드 표기 일관성).
    display = store.first_team_display(team_key) or team_display
    record = Submission(
        id=0,
        team_key=team_key,
        team_display=display,
        nickname=nick,
        rmse=result.rmse,
        r2=result.r2,
        negative_clipped=result.negative_clipped,
        submitted_at=now,
    )
    store.insert_submission(record)

    return {
        "rmse": result.rmse,
        "r2": result.r2,
        "negative_clipped": result.negative_clipped,
        "remaining_today": quota["remaining_today"] - 1,
        "resets_at": quota["resets_at"],
        "rank": _team_rank(store, team_key),
        "team": display,
    }


@app.get("/api/leaderboard")
def leaderboard(store: Store = Depends(get_store)):
    return [_leaderboard_row(r) for r in store.leaderboard()]


@app.get("/api/quota")
def quota(team: str, store: Store = Depends(get_store), now_fn: Callable[[], datetime] = Depends(get_now)):
    try:
        team_key = normalize_team(team)
    except NameError_ as e:
        return JSONResponse(status_code=400, content={"error_code": "bad_name", "message": str(e)})
    body = _quota_body(store, team_key, now_fn())
    body["limit"] = clock.DAILY_LIMIT
    return body


@app.get("/api/submissions", dependencies=[Depends(require_admin)])
def list_submissions(team: str, store: Store = Depends(get_store)):
    try:
        team_key = normalize_team(team)
    except NameError_ as e:
        return JSONResponse(status_code=400, content={"error_code": "bad_name", "message": str(e)})
    return [_submission_row(s) for s in store.list_submissions(team_key)]


@app.delete("/api/submissions/{submission_id}", dependencies=[Depends(require_admin)])
def delete_submission(
    submission_id: int,
    store: Store = Depends(get_store),
    now_fn: Callable[[], datetime] = Depends(get_now),
):
    if not store.soft_delete(submission_id, now_fn()):
        raise HTTPException(status_code=404, detail="해당 제출이 없거나 이미 삭제되었습니다.")
    return {"deleted": submission_id}


@app.get("/api/health")
def health():
    return {"ok": True}


# --- 로컬 개발용 정적 파일 -----------------------------------------------------
# Vercel에서는 public/이 CDN에서 서빙되므로 마운트하지 않는다(Vercel FastAPI 가이드).
if not os.environ.get("VERCEL"):
    from fastapi.staticfiles import StaticFiles

    _public = Path(__file__).parent / "public"
    if _public.is_dir():
        app.mount("/", StaticFiles(directory=_public, html=True), name="public")
