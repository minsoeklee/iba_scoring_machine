# IBA Scoring Machine

데이터분석 동아리 회귀 프로젝트(중고차 가격 예측) 자동 채점 사이트.
팀이 예측 결과 CSV(`id,price`)를 올리면 RMSE·R²를 바로 계산해 리더보드에 올린다.

## 현재 상태 (2026-09-19)

설계 단계 완료, 구현 전. 결정 사항은 아래 문서에 있다.

| 문서 | 내용 |
|---|---|
| [docs/specs/scoring-site.md](docs/specs/scoring-site.md) | **구현 스펙** — 수용 기준, 데이터 모델, API 계약, 검증 계획 |
| [docs/wayfinder/scoring-site/MAP.md](docs/wayfinder/scoring-site/MAP.md) | 결정 지도 — 7개 결정과 그 근거 |
| [docs/research/scoring-site-tech-stack.md](docs/research/scoring-site-tech-stack.md) | 기술 스택 조사 (Vercel / Cloudflare / Netlify 무료 티어 비교) |

핵심 결정 요약:

- 제출: `sample_submission.csv`와 같은 `id,price` CSV. 코드 실행 없음.
- 채점: **행 순서 기준**(test.csv의 id가 고유하지 않음). RMSE가 순위 기준, R²는 보조.
- 참가: 로그인 없이 팀명·닉네임 자유 기입. 팀당 하루 3회(KST 자정 초기화).
- 리더보드: 팀별 최고 기록 1건 — 닉네임·팀명·RMSE·R².
- 스택: Vercel Hobby + Python(FastAPI) + Neon Postgres Free + 정적 프론트. 비용 0원.
- 페이지: 홈 / 채점 / 리더보드 / 미니게임(순수 프론트).

## 저장소 구조

```
scoring_machine/
  regression/        # 이번 기수 과제 데이터와 참고 노트북
    train.csv, test.csv, sample_submission.csv, brand_model.csv
    IBA_reg_comp_BASELINE.ipynb, 3조_*.ipynb
docs/
  specs/             # 구현 스펙
  wayfinder/         # 결정 지도와 결정 파일
  research/          # 조사 문서
```

## 정답 파일 주의

`answer.csv`(test 정답)는 **이 저장소에 절대 커밋하지 않는다.** 공개 저장소이기 때문이다. `.gitignore`로 막혀 있으며, 정답은 운영자가 Neon 데이터베이스의 `answers` 테이블에만 적재한다(스펙의 "기수 교체 절차" 참고).
