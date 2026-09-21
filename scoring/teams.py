"""팀명·닉네임 정규화.

팀은 가입할 때 적은 팀명 문자열로 식별한다(결정 007). 앞뒤 공백 제거, 연속 공백 하나로 축약,
대소문자 무시(casefold), 전각 문자를 반각으로 통일(NFKC)해 같은 팀으로 본다.
리더보드에는 처음 입력된 표기(team_display)를 그대로 보여준다.
"""

from __future__ import annotations

import re
import unicodedata

MAX_TEAM_LEN = 40
MAX_NICKNAME_LEN = 40

_WS = re.compile(r"\s+")


class NameError_(ValueError):
    pass


def clean_display(raw: str, max_len: int, label: str) -> str:
    text = _WS.sub(" ", unicodedata.normalize("NFKC", raw)).strip()
    if not text:
        raise NameError_(f"{label}을(를) 입력하세요.")
    if len(text) > max_len:
        raise NameError_(f"{label}은(는) {max_len}자 이하여야 합니다.")
    return text


def normalize_team(raw: str) -> str:
    return clean_display(raw, MAX_TEAM_LEN, "팀명").casefold()


def clean_team_display(raw: str) -> str:
    return clean_display(raw, MAX_TEAM_LEN, "팀명")


def clean_nickname(raw: str) -> str:
    return clean_display(raw, MAX_NICKNAME_LEN, "닉네임")
