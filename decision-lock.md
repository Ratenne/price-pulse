# Decision Lock — PricePulse 공개 데모 배포

## Decision 완료 선언

- **날짜:** 2026-08-01
- **Decision Agent 판정:** GO

## 판정 근거

- 현재 구현과 빌드가 완료되어 추가 실행 비용이 작습니다.
- 정적 Preview 배포로 1일 안에 기술·사용자 검증이 가능합니다.
- Vercel의 Preview와 rollback으로 실패 회복 비용이 작습니다.
- 실시간 데이터·거래 기능을 제외해 법적·운영 위험을 제한합니다.

## Portfolio Check

- 비교 후보: 로컬 데모 유지, 일반 Node 호스팅, Vercel 정적 배포
- 선택 이유: 공개 검증이 가능하면서 운영 복잡도와 비용이 가장 낮습니다.
- 리소스 충돌: 없음. 현재 코드 범위 내 CI/CD 작업만 수행합니다.

## 고정 MVP 범위

- 현재 PricePulse 정적 웹 데모
- GitHub Actions 품질 Gate
- Vercel Preview 및 Production 배포
- 배포 후 핵심 경로 검증과 rollback

## 하지 않을 것

- 실시간 가격 API와 크롤링
- 사용자 계정, 결제, 실거래
- 데이터베이스와 관리자 도구
- 무승인 Production 자동 배포

## 성공 기준

- 타입 검사, 테스트, 빌드 통과
- Preview/Production 핵심 경로 정상
- 치명 콘솔 오류와 High/Critical 취약점 0건

## Kill 또는 HOLD 기준

- 정적 배포에서 주요 경로를 안정적으로 제공하지 못함
- 시연 데이터의 오인 위험을 충분히 고지하지 못함
- 사용자 검증에서 가격 판단 가치가 확인되지 않음

## Decision Lock

새 기능 제안은 즉시 구현하지 않고 `docs/FUTURE_IDEAS.md`에 기록합니다. 범위 변경 시 Decision을 다시 수행합니다.

- **Execution 시작일:** 2026-08-01
- **Execution Manager:** Codex
