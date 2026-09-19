"""기수 교체: 제출 기록을 모두 지운다. answers는 load_answers.py로 따로 갈아끼운다.

사용법:
    DATABASE_URL=postgres://... python scripts/reset_season.py --yes
"""

from __future__ import annotations

import os
import sys

import psycopg


def main() -> None:
    if "--yes" not in sys.argv:
        sys.exit("submissions 테이블을 전부 삭제합니다. 확인했으면 --yes 를 붙여 다시 실행하세요.")
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        cur = conn.execute("DELETE FROM submissions")
        conn.commit()
        print(f"submissions {cur.rowcount}행 삭제 완료")


if __name__ == "__main__":
    main()
