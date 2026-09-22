from tests.conftest import login_as


def record(client, game, score, team="3조", nickname="민석"):
    login_as(client, team, nickname)
    return client.post(f"/api/games/{game}/score", json={"score": score})


def test_game_leaderboard_keeps_team_best(client, clock):
    assert record(client, "apple", 40, team="A", nickname="a1").status_code == 200
    clock.advance(minutes=1)
    r = record(client, "apple", 55, team="A", nickname="a2")
    assert r.json() == {"rank": 1, "team_best": 55}
    clock.advance(minutes=1)
    record(client, "apple", 30, team="A", nickname="a1")
    record(client, "apple", 50, team="B", nickname="b1")

    board = client.get("/api/games/apple/leaderboard").json()
    assert [(r["rank"], r["team"], r["nickname"], r["score"]) for r in board] == [(1, "A", "a2", 55), (2, "B", "b1", 50)]
    assert board[0]["played_at"].endswith("+09:00")


def test_tie_goes_to_earlier_record(client, clock):
    record(client, "tetris", 1000, team="first")
    clock.advance(minutes=1)
    record(client, "tetris", 1000, team="second")
    assert [r["team"] for r in client.get("/api/games/tetris/leaderboard").json()] == ["first", "second"]


def test_games_are_separate(client):
    record(client, "tetris", 500)
    assert client.get("/api/games/blocks/leaderboard").json() == []


def test_score_requires_login(client):
    assert client.post("/api/games/apple/score", json={"score": 10}).status_code == 401


def test_unknown_game_and_bad_score_rejected(client):
    assert record(client, "chess", 10).status_code == 404
    assert client.get("/api/games/chess/leaderboard").status_code == 404
    assert record(client, "apple", 171).json()["error_code"] == "bad_score"
    assert record(client, "apple", -1).json()["error_code"] == "bad_score"
    assert client.get("/api/games/apple/leaderboard").json() == []
