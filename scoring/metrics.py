"""RMSE·R² 계산. 음수 예측은 0으로 클리핑하고 건수를 돌려준다."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Score:
    rmse: float
    r2: float
    negative_clipped: int


def score(actual: list[float], predicted: list[float]) -> Score:
    if len(actual) != len(predicted):
        raise ValueError("actual과 predicted의 길이가 다릅니다.")
    n = len(actual)
    if n == 0:
        raise ValueError("빈 목록은 채점할 수 없습니다.")

    clipped = 0
    ss_res = 0.0
    total = 0.0
    for y, y_hat in zip(actual, predicted):
        if y_hat < 0:
            y_hat = 0.0
            clipped += 1
        d = y - y_hat
        ss_res += d * d
        total += y

    mean = total / n
    ss_tot = 0.0
    for y in actual:
        d = y - mean
        ss_tot += d * d

    rmse = math.sqrt(ss_res / n)
    # 정답이 전부 같은 값이면 R²가 정의되지 않는다. 실제 데이터에서는 일어나지 않지만 0으로 나누지 않게 막는다.
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return Score(rmse=rmse, r2=r2, negative_clipped=clipped)
