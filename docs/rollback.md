# PricePulse Rollback Runbook

## 즉시 Rollback 조건

- 홈 또는 상품 상세 접근 불가
- 주요 정적 자산 로드 실패
- 브라우저 치명 오류로 화면 사용 불가
- 시연 데이터 고지 누락
- 보안상 즉시 차단이 필요한 문제

## Vercel Rollback

1. Vercel Dashboard에서 PricePulse 프로젝트를 엽니다.
2. Deployments에서 직전 정상 Production 배포를 선택합니다.
3. `Promote to Production` 또는 Rollback 기능으로 이전 배포를 복원합니다.
4. 홈과 주요 경로 smoke test를 다시 수행합니다.

CLI를 사용하는 경우 배포 ID를 먼저 확인하고 다음 명령을 실행합니다.

```bash
vercel rollback <deployment-url-or-id>
```

## Git 처리

- 문제가 있는 커밋을 `main`에서 force push로 제거하지 않습니다.
- 수정 커밋 또는 `git revert <commit>`로 이력을 보존합니다.
- 수정 후 CI와 Preview를 다시 통과시킨 뒤 재배포합니다.

## 사후 기록

- 장애 시작·탐지·복구 시간
- 영향 경로와 사용자 영향
- 원인 커밋 또는 설정
- 재발 방지 테스트
- 재배포 결과
