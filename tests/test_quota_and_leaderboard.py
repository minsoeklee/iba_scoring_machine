from tests.conftest import ADMIN, ANSWER_ROWS, csv_bytes, perfect_rows, quota, submit


def offset_rows(delta: float):
    return [(i, p + delta) for i, p in ANSWER_ROWS]


# --- 하루 3회 제한 ------------------------------------------------------------


def test_fourth_submission_same_day_is_rejected(client):
    for _ in range(3):
        assert submit(client, csv_bytes(perfect_rows())).status_code == 200
    r = submit(client, csv_bytes(perfect_rows()))
    assert r.status_code == 429
    body = r.json()
    assert body["error_code"] == "quota_exceeded"
    # 2026-09-19 15:00 KST 기준 다음 자정
    assert body["resets_at"].startswith("2026-09-20T00:00:00+09:00")


def test_team_name_variants_share_quota(client):
    assert submit(client, csv_bytes(perfect_rows()), team="Team A").status_code == 200
    assert submit(client, csv_bytes(perfect_rows()), team="  team   a ").status_code == 200
    assert submit(client, csv_bytes(perfect_rows()), team="TEAM A").status_code == 200
    assert submit(client, csv_bytes(perfect_rows()), team="team a").status_code == 429
    # 리더보드에는 처음 표기만 한 행
    board = client.get("/api/leaderboard").json()
    assert [row["team"] for row in board] == ["Team A"]


def test_quota_resets_at_kst_midnight(client, clock):
    for _ in range(3):
        submit(client, csv_bytes(perfect_rows()))
    # 23:59 KST → 아직 같은 날
    clock.advance(hours=8, minutes=59)
    assert submit(client, csv_bytes(perfect_rows())).status_code == 429
    # 00:00 KST → 초기화
    clock.advance(minutes=1)
    r = submit(client, csv_bytes(perfect_rows()))
    assert r.status_code == 200
    assert r.json()["remaining_today"] == 2


def test_quota_endpoint_reports_usage(client):
    submit(client, csv_bytes(perfect_rows()))
    q = quota(client).json()
    assert q == {
        "used_today": 1,
        "remaining_today": 2,
        "resets_at": "2026-09-20T00:00:00+09:00",
        "limit": 3,
    }


# --- 리더보드 -----------------------------------------------------------------


def test_leaderboard_shows_best_record_per_team(client, clock):
    submit(client, csv_bytes(offset_rows(300)), team="A", nickname="a1")
    clock.advance(minutes=1)
    submit(client, csv_bytes(offset_rows(100)), team="A", nickname="a2")
    clock.advance(minutes=1)
    submit(client, csv_bytes(offset_rows(200)), team="B", nickname="b1")
    board = client.get("/api/leaderboard").json()
    assert [(r["rank"], r["team"], r["nickname"]) for r in board] == [(1, "A", "a2"), (2, "B", "b1")]
    assert board[0]["submitted_at"].endswith("+09:00")


def test_leaderboard_tie_breaks_by_r2_then_time(client, clock):
    # 같은 RMSE, 같은 R²(동일 오프셋) → 먼저 제출한 팀이 위
    submit(client, csv_bytes(offset_rows(100)), team="late-first", nickname="x")
    clock.advance(minutes=5)
    submit(client, csv_bytes(offset_rows(100)), team="second", nickname="y")
    board = client.get("/api/leaderboard").json()
    assert [r["team"] for r in board] == ["late-first", "second"]


def test_rank_in_submit_response_reflects_team_best(client):
    submit(client, csv_bytes(offset_rows(100)), team="A")
    r = submit(client, csv_bytes(offset_rows(200)), team="B")
    assert r.json()["rank"] == 2
    r = submit(client, csv_bytes(offset_rows(50)), team="B")
    assert r.json()["rank"] == 1


# --- 관리자 삭제 --------------------------------------------------------------


def test_admin_delete_restores_quota_and_removes_from_leaderboard(client):
    for _ in range(3):
        submit(client, csv_bytes(perfect_rows()), team="A")
    assert submit(client, csv_bytes(perfect_rows()), team="A").status_code == 429

    subs = client.get("/api/submissions", params={"team": "a"}, headers=ADMIN).json()
    assert len(subs) == 3
    r = client.delete(f"/api/submissions/{subs[0]['id']}", headers=ADMIN)
    assert r.status_code == 200

    assert quota(client, "A").json()["remaining_today"] == 1
    subs = client.get("/api/submissions", params={"team": "A"}, headers=ADMIN).json()
    assert subs[0]["deleted_at"] is not None

    # 전부 지우면 리더보드에서 사라진다
    for s in subs[1:]:
        client.delete(f"/api/submissions/{s['id']}", headers=ADMIN)
    assert client.get("/api/leaderboard").json() == []


def test_admin_endpoints_require_key(client):
    assert client.get("/api/submissions", params={"team": "A"}).status_code == 401
    assert client.get("/api/submissions", params={"team": "A"}, headers={"X-Admin-Key": "nope"}).status_code == 401
    assert client.delete("/api/submissions/1").status_code == 401


def test_delete_unknown_or_already_deleted_is_404(client):
    submit(client, csv_bytes(perfect_rows()), team="A")
    assert client.delete("/api/submissions/999", headers=ADMIN).status_code == 404
    assert client.delete("/api/submissions/1", headers=ADMIN).status_code == 200
    assert client.delete("/api/submissions/1", headers=ADMIN).status_code == 404
