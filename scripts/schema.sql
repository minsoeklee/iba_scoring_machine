-- Neon Postgres 스키마. 최초 1회 실행: psql "$DATABASE_URL" -f scripts/schema.sql

CREATE TABLE IF NOT EXISTS answers (
    row_no  INTEGER PRIMARY KEY,          -- test.csv에서의 위치(0부터). 채점은 이 순서 기준.
    id      BIGINT NOT NULL,              -- test.csv의 id (고유하지 않음, 참고용)
    price   DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
    id               BIGSERIAL PRIMARY KEY,
    team_key         TEXT NOT NULL,       -- 정규화된 팀명 (하루 3회 판정·리더보드 그룹 기준)
    team_display     TEXT NOT NULL,       -- 처음 입력된 표기
    nickname         TEXT NOT NULL,
    rmse             DOUBLE PRECISION NOT NULL,
    r2               DOUBLE PRECISION NOT NULL,
    negative_clipped INTEGER NOT NULL DEFAULT 0,
    submitted_at     TIMESTAMPTZ NOT NULL,
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS submissions_team_day ON submissions (team_key, submitted_at) WHERE deleted_at IS NULL;
