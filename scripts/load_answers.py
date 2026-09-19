"""정답 CSV를 Neon의 answers 테이블에 적재한다. 기존 내용은 지우고 다시 넣는다.

사용법:
    DATABASE_URL=postgres://... python scripts/load_answers.py /path/to/answer.csv

answer.csv는 `id,price` 형식이며 test.csv와 행 순서가 같아야 한다.
정답 파일은 저장소 밖에 두고, 이 스크립트에 경로만 넘긴다.
"""

from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

import psycopg


def main(path: str) -> None:
    rows: list[tuple[int, int, float]] = []
    with Path(path).open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader)
        if [h.strip() for h in header] != ["id", "price"]:
            sys.exit(f"헤더가 'id,price'가 아닙니다: {header}")
        for i, row in enumerate(reader):
            if not row or all(c.strip() == "" for c in row):
                continue
            rows.append((i, int(float(row[0])), float(row[1])))

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM answers")
            cur.executemany("INSERT INTO answers (row_no, id, price) VALUES (%s, %s, %s)", rows)
        conn.commit()
    print(f"answers 테이블에 {len(rows)}행 적재 완료")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("사용법: python scripts/load_answers.py /path/to/answer.csv")
    main(sys.argv[1])
