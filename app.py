"""채점 사이트 API. Vercel Python 런타임이 이 파일의 `app`을 찾아 실행한다.

엔드포인트 (스펙 "API 계약"):
- POST   /api/signup                 가입(아이디·비밀번호·닉네임·팀명) → 세션 쿠키
- POST   /api/login                  로그인 → 세션 쿠키
- POST   /api/logout                 세션 쿠키 삭제
- GET    /api/me                     로그인한 사용자 (로그인하지 않았으면 null)
- POST   /api/submit                 (로그인) CSV → 채점·기록
- GET    /api/leaderboard            팀별 최고 기록
- GET    /api/quota                  (로그인) 우리 팀 오늘 남은 횟수
- POST   /api/games/{game}/score     (로그인) 미니게임 점수 기록
- GET    /api/games/{game}/leaderboard  미니게임 팀별 최고 점수
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

from fastapi import Cookie, Depends, FastAPI, File, Header, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import auth
from scoring import clock
from scoring.metrics import score
from scoring.parse import SubmissionError, parse_submission
from scoring.teams import NameError_, clean_nickname, clean_team_display, normalize_team
from store import Answers, DuplicateUsername, GameScore, PostgresStore, Store, Submission, User

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


def current_user(
    store: Store = Depends(get_store),
    iba_session: str | None = Cookie(default=None),
) -> User | None:
    user_id = auth.read_session(iba_session)
    return store.get_user(user_id) if user_id is not None else None


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return user


# --- 응답 도우미 ---------------------------------------------------------------


def _user_body(u: User) -> dict:
    return {"username": u.username, "nickname": u.nickname, "team": u.team_display}


def _set_session(response: Response, u: User) -> None:
    response.set_cookie(
        auth.SESSION_COOKIE,
        auth.make_session(u.id),
        max_age=auth.SESSION_TTL,
        httponly=True,
        samesite="lax",
        secure=bool(os.environ.get("VERCEL")),
    )


def _bad_request(code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error_code": code, "message": message})


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


class SignupBody(BaseModel):
    username: str
    password: str
    nickname: str
    team: str


class ScoreBody(BaseModel):
    score: int


# 미니게임별 점수 상한. 점수는 브라우저가 보내므로 불가능한 값만 거른다.
GAME_MAX_SCORE = {"apple": 170, "tetris": 9_999_999, "blocks": 999_999}


class LoginBody(BaseModel):
    username: str
    password: str


@app.post("/api/signup")
def signup(
    body: SignupBody,
    response: Response,
    store: Store = Depends(get_store),
    now_fn: Callable[[], datetime] = Depends(get_now),
):
    try:
        username = auth.clean_username(body.username)
        auth.check_password_rules(body.password)
        nickname = clean_nickname(body.nickname)
        team_key = normalize_team(body.team)
        team_display = clean_team_display(body.team)
    except auth.AccountError as e:
        return _bad_request("bad_account", str(e))
    except NameError_ as e:
        return _bad_request("bad_name", str(e))

    # 같은 팀의 첫 표기를 유지한다(리더보드 표기 일관성).
    user = User(
        id=0,
        username=username,
        password_hash=auth.hash_password(body.password),
        nickname=nickname,
        team_key=team_key,
        team_display=store.first_team_display(team_key) or team_display,
        created_at=now_fn(),
    )
    try:
        store.create_user(user)
    except DuplicateUsername:
        return JSONResponse(
            status_code=409, content={"error_code": "username_taken", "message": "이미 쓰이는 아이디입니다."}
        )
    _set_session(response, user)
    return _user_body(user)


@app.post("/api/login")
def login(body: LoginBody, response: Response, store: Store = Depends(get_store)):
    user = store.get_user_by_username(body.username.strip().lower())
    if user is None or not auth.verify_password(body.password, user.password_hash):
        return JSONResponse(
            status_code=401,
            content={"error_code": "bad_login", "message": "아이디 또는 비밀번호가 올바르지 않습니다."},
        )
    _set_session(response, user)
    return _user_body(user)


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(auth.SESSION_COOKIE)
    return {"ok": True}


@app.get("/api/me")
def me(user: User | None = Depends(current_user)):
    return _user_body(user) if user else None


@app.post("/api/submit")
async def submit(
    file: UploadFile = File(...),
    user: User = Depends(require_user),
    store: Store = Depends(get_store),
    now_fn: Callable[[], datetime] = Depends(get_now),
    answers: Answers = Depends(get_answers),
):
    team_key = user.team_key
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

    record = Submission(
        id=0,
        team_key=team_key,
        team_display=user.team_display,
        nickname=user.nickname,
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
        "team": user.team_display,
    }


@app.get("/api/leaderboard")
def leaderboard(store: Store = Depends(get_store)):
    return [_leaderboard_row(r) for r in store.leaderboard()]


@app.get("/api/quota")
def quota(
    user: User = Depends(require_user),
    store: Store = Depends(get_store),
    now_fn: Callable[[], datetime] = Depends(get_now),
):
    body = _quota_body(store, user.team_key, now_fn())
    body["limit"] = clock.DAILY_LIMIT
    return body


def _game_row(row) -> dict:
    return {
        "rank": row.rank,
        "team": row.team,
        "nickname": row.nickname,
        "score": row.score,
        "played_at": row.played_at.astimezone(clock.KST).isoformat(),
    }


@app.post("/api/games/{game}/score")
def record_game_score(
    game: str,
    body: ScoreBody,
    user: User = Depends(require_user),
    store: Store = Depends(get_store),
    now_fn: Callable[[], datetime] = Depends(get_now),
):
    if game not in GAME_MAX_SCORE:
        raise HTTPException(status_code=404, detail="없는 게임입니다.")
    if not 0 <= body.score <= GAME_MAX_SCORE[game]:
        return _bad_request("bad_score", "점수가 올바르지 않습니다.")
    store.insert_game_score(
        GameScore(0, game, user.team_key, user.team_display, user.nickname, body.score, now_fn())
    )
    rows = store.game_leaderboard(game)
    mine = next(r for r in rows if r.team_key == user.team_key)
    return {"rank": mine.rank, "team_best": mine.score}


@app.get("/api/games/{game}/leaderboard")
def game_leaderboard(game: str, store: Store = Depends(get_store)):
    if game not in GAME_MAX_SCORE:
        raise HTTPException(status_code=404, detail="없는 게임입니다.")
    return [_game_row(r) for r in store.game_leaderboard(game)]


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
