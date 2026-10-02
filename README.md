# IBA Scoring Machine

데이터분석 동아리 회귀 프로젝트(중고차 가격 예측) 자동 채점 사이트.
팀이 예측 결과 CSV(`id,price`)를 올리면 RMSE·R²를 바로 계산해 리더보드에 올린다.

## 현재 상태 (2026-09-19)

첫 구현 완료(API·정적 페이지·테스트). Vercel/Neon 배포는 아직. 결정 사항은 아래 문서에 있다.

| 문서 | 내용 |
|---|---|
| [docs/specs/scoring-site.md](docs/specs/scoring-site.md) | **구현 스펙** — 수용 기준, 데이터 모델, API 계약, 검증 계획 |
| [docs/wayfinder/scoring-site/MAP.md](docs/wayfinder/scoring-site/MAP.md) | 결정 지도 — 7개 결정과 그 근거 |
| [docs/research/scoring-site-tech-stack.md](docs/research/scoring-site-tech-stack.md) | 기술 스택 조사 (Vercel / Cloudflare / Netlify 무료 티어 비교) |

핵심 결정 요약:

- 제출: `sample_submission.csv`와 같은 `id,price` CSV. 코드 실행 없음.
- 채점: **행 순서 기준**. test.csv의 id는 0부터 매긴 행 번호이고, 제출 파일의 id가 같은 순서인지 확인한 뒤 같은 위치끼리 비교한다. RMSE가 순위 기준, R²는 보조.
- 참가: 아이디·비밀번호로 가입하고, 가입 때 적은 팀 번호(숫자만, 앞자리 0 무시)로 팀이 묶인다. 제출만 로그인 필요. 팀당 하루 3회(KST 자정 초기화).
- 리더보드: 팀별 최고 기록 1건 — 닉네임·팀 번호·RMSE·R².
- 스택: Vercel Hobby + Python(FastAPI) + Neon Postgres Free + 정적 프론트. 비용 0원.
- 페이지: 홈 / 채점 / 리더보드 / 미니게임(사과게임·테트리스·블록깨기, 게임별 팀 순위).

## 저장소 구조

```
app.py               # FastAPI 앱 (Vercel Python 런타임 진입점). /api/* 엔드포인트
auth.py              # 비밀번호 해시(PBKDF2), 서명 쿠키 세션
store.py             # 저장소 계층: PostgresStore(Neon) / MemoryStore(테스트·로컬)
scoring/             # 채점 도메인 로직 (프레임워크·DB 무관)
  parse.py           #   제출 CSV 검증·파싱
  metrics.py         #   RMSE·R², 음수 클리핑
  teams.py           #   팀 번호·닉네임 정규화
  clock.py           #   KST 하루 경계, 일일 한도
public/              # 정적 사이트 (Vercel CDN이 그대로 서빙)
  index.html, submit.html, leaderboard.html, minigame.html(게임 목록), login.html(로그인·가입)
  games/             #   미니게임: apple(사과게임), tetris, blocks(블록깨기). 게임은 브라우저에서 돌고 점수만 API로 기록
  assets/            #   style.css, app.js(셸·공통), icons.js, contest.js(대회 일정·공지)
  data/              #   train/test/sample_submission/brand_model.csv (후배 배포용)
scripts/             # 운영 스크립트: schema.sql, load_answers.py, reset_season.py
tests/               # pytest (API 레벨)
scoring_machine/     # 참고 노트북 (베이스라인, 3조 코드)
docs/                # 스펙·결정 지도·조사
```

## 로컬 실행

```bash
uv venv --python 3.12 .venv && uv pip install -r requirements-dev.txt
```

DB 없이 돌리려면 정답 CSV 경로만 넘긴다(제출 기록은 메모리에만, 재시작하면 사라짐):

```bash
DEV_ANSWER_CSV=/path/to/answer.csv ADMIN_KEY=dev SESSION_SECRET=dev .venv/bin/uvicorn app:app --port 8765
```

이 모드에서는 아무 아이디·비밀번호로나 로그인된다(처음 보는 아이디면 그 이름으로 계정이 바로 만들어진다). 화면을 빠르게 확인하기 위한 것이라 DB를 쓰는 실제 배포에서는 꺼져 있다.

테스트:

```bash
.venv/bin/pytest
```

실제 정답 파일로 기준값 테스트(sample_submission → 전체 데이터 RMSE 13,189.79)까지 돌리려면:

```bash
ANSWER_CSV=/path/to/answer.csv .venv/bin/pytest tests/test_real_data.py
```

## 배포 (Vercel Hobby + Neon Free)

1. Neon에서 무료 프로젝트를 만들고 연결 문자열을 받는다.
2. 스키마 생성: `psql "$DATABASE_URL" -f scripts/schema.sql`. 이미 만든 DB에 다시 실행해도 되며, 빠진 컬럼만 추가한다.
3. 정답 적재: `DATABASE_URL=... .venv/bin/python scripts/load_answers.py /path/to/answer.csv`. 이때 public 채점 구간(전체의 30%)을 무작위로 정해 함께 저장한다. 대회 도중에 다시 적재하면 구간이 바뀌므로 기수 시작 때 한 번만 실행한다.
4. Vercel에서 이 저장소를 가져오고 환경변수 세 개를 넣는다: `DATABASE_URL`, `ADMIN_KEY`, `SESSION_SECRET`(둘 다 긴 무작위 문자열, 서로 다르게). `SESSION_SECRET`을 바꾸면 모든 사용자가 로그아웃된다.
5. 배포 후 확인: `/api/health`, 공개 저장소·정적 경로에 `answer.csv`가 없는지, 첫 요청 소요 시간.

## 운영

관리자 작업은 UI 없이 API로 한다.

```bash
# 팀 제출 목록 보기
curl -H "X-Admin-Key: $ADMIN_KEY" --get --data-urlencode "team=3" https://<도메인>/api/submissions
```

```bash
# 제출 하나 삭제 (소프트 삭제: 리더보드·오늘 횟수에서 빠짐)
curl -X DELETE -H "X-Admin-Key: $ADMIN_KEY" https://<도메인>/api/submissions/<id>
```

채점은 두 단계다. 대회 중에는 public 구간(test의 30%) 점수만 보여주고, 대회 마지막 날 다음 날 0시(KST)부터 제출을 막고 리더보드를 전체 데이터 기준 최종 순위로 바꾼다. 최종 순위에는 팀마다 public 점수가 가장 좋았던 제출 1건이 쓰인다. 마감일은 `scoring/clock.py`의 `CONTEST_END`가 정한다.

기수 교체: `scripts/reset_season.py --yes`로 제출 기록을 비우고, 새 정답을 `load_answers.py`로 적재하고, `public/data/`의 CSV와 `public/assets/contest.js`의 대회 기간·공지사항을 바꾼다. 리더보드의 데이터셋 내려받기 버튼이 받는 `public/data/dataset.zip`도 새 CSV 네 개로 다시 묶는다. `scoring/clock.py`의 `CONTEST_END`도 contest.js의 `end`와 같은 날짜로 맞춘 뒤 배포한다.

## 정답 파일 주의

`answer.csv`(test 정답)는 **이 저장소에 절대 커밋하지 않는다.** 공개 저장소이기 때문이다. `.gitignore`로 막혀 있으며, 정답은 운영자가 Neon 데이터베이스의 `answers` 테이블에만 적재한다(스펙의 "기수 교체 절차" 참고).
