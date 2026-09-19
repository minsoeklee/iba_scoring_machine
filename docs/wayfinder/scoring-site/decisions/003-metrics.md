# 003 — 공식 평가 지표 확정

- Type: `grilling`
- Status: `resolved`
- Depends on: none

## Question

사이트가 리더보드에 올리는 공식 점수는 RMSE / R² / MAE / RMSLE 중 무엇인가? 보조 지표를 함께 보여줄지, 음수·결측 예측은 어떻게 처리할지.

## Why this matters now

지표는 채점 코드와 리더보드 정렬 방향을 결정한다. 정답 price는 최대 149,948까지 긴 꼬리가 있어 RMSE와 MAE/RMSLE가 다른 순위를 만들 수 있다. 지금 정하지 않으면 채점 코드를 두 번 쓰게 된다.

## Evidence and artifacts

- 3조 회귀 노트북·베이스라인: RMSE + R² 병기. 음수 예측을 0으로 클리핑.
- train `price` 최대 159,999, 정답(answer.csv) 최대 149,948 → RMSE는 소수 고가 차량 오차에 크게 흔들림. RMSLE/MAE가 교육적으로 더 안정적일 수 있음. 참고: placeholder 제출의 RMSE가 13,190이므로 이 값이 사실상 '아무것도 안 한' 기준선.

## Conclusion

(2026-09-19, 사용자 결정) **RMSE를 주 지표, R²를 보조 지표로 둘 다 계산해 보여준다.** 리더보드 순위는 RMSE 오름차순으로 정하고, R²는 참고값으로 함께 표시한다.

- 계산 기준: `answer.csv`의 price와 제출 price를 행 순서로 짝지어 RMSE = sqrt(mean((y - ŷ)²)), R² = 1 - SS_res/SS_tot.
- 스펙 단계에서 확정할 세부: 음수·결측 예측을 거부할지 0으로 클리핑할지(기존 노트북 관행은 0 클리핑), 소수점 표시 자릿수, 동점 처리(RMSE 동일 시 R² 또는 제출 시각).
- 기준선: placeholder 제출 RMSE 13,190, 베이스라인(DecisionTreeRegressor) 점수는 아직 측정하지 않음 → 리더보드에 "베이스라인" 행을 둘지는 004/리더보드 설계에서.

## Next implications

- "채점 결과 상세 수준"(Not yet specified)은 이제 "RMSE·R² 외에 무엇을 더 보여줄지"로 좁혀졌으나, public/private 분할 여부(004 이후)와 함께 다루는 편이 낫다.
- RMSE가 고가 차량 오차에 민감하다는 점은 지표 선택을 바꾸지 않고, 후배 안내 자료에 힌트로 남긴다.
