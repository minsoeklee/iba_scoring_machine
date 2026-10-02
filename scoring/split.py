"""public 채점 구간 선택. 정답 행의 30%를 중복 없이 무작위로 골라 대회 중 점수 계산에 쓴다.

최종 순위는 전체 행으로 매긴다. 대회 중 보이는 점수로 모델을 고르다 보면 public 구간에
과적합되므로, 최종 점수에는 학생이 본 적 없는 행이 섞이게 한다.
"""

from __future__ import annotations

import random

PUBLIC_FRACTION = 0.3


def pick_public(n: int, rng: random.Random) -> list[bool]:
    """길이 n의 행 중 public 구간에 들어가는 행을 True로 표시한다."""
    chosen = set(rng.sample(range(n), round(n * PUBLIC_FRACTION)))
    return [i in chosen for i in range(n)]
