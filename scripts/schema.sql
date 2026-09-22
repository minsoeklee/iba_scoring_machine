-- Neon Postgres 스키마. 최초 1회 실행: psql "$DATABASE_URL" -f scripts/schema.sql

CREATE TABLE IF NOT EXISTS answers (
    row_no  INTEGER PRIMARY KEY,          -- test.csv에서의 위치(0부터). 채점은 이 순서 기준.
    id      BIGINT NOT NULL,              -- test.csv의 id (고유하지 않음, 참고용)
    price   DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id               BIGSERIAL PRIMARY KEY,
    username         TEXT NOT NULL UNIQUE, -- 로그인 아이디 (소문자)
    password_hash    TEXT NOT NULL,        -- pbkdf2_sha256$반복$솔트$해시
    nickname         TEXT NOT NULL,
    team_key         TEXT NOT NULL,        -- 정규화된 팀명
    team_display     TEXT NOT NULL,        -- 그 팀으로 처음 가입한 사람의 표기
    created_at       TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
    id               BIGSERIAL PRIMARY KEY,
    team_key         TEXT NOT NULL,       -- 정규화된 팀명 (하루 3회 판정·리더보드 그룹 기준)
    team_display     TEXT NOT NULL,       -- 제출자 팀의 표기 (users.team_display)
    nickname         TEXT NOT NULL,
    rmse             DOUBLE PRECISION NOT NULL,
    r2               DOUBLE PRECISION NOT NULL,
    negative_clipped INTEGER NOT NULL DEFAULT 0,
    submitted_at     TIMESTAMPTZ NOT NULL,
    deleted_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_scores (
    id               BIGSERIAL PRIMARY KEY,
    game             TEXT NOT NULL,        -- apple, tetris, blocks
    team_key         TEXT NOT NULL,
    team_display     TEXT NOT NULL,
    nickname         TEXT NOT NULL,
    score            INTEGER NOT NULL,
    played_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS game_scores_game ON game_scores (game);

CREATE INDEX IF NOT EXISTS submissions_team_day ON submissions (team_key, submitted_at) WHERE deleted_at IS NULL;
