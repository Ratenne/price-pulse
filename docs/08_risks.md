# 08. Risks — 배포 리스크와 대응

| 리스크 | 확률 | 영향 | 대응 |
|---|---:|---:|---|
| 시연 가격을 실제 가격으로 오인 | 중간 | 높음 | 홈·상세·안심거래에 시연 데이터 고지 유지 |
| SPA 직접 URL 404 | 중간 | 높음 | Vercel rewrite와 경로 smoke test |
| 메인 번들 500KB 초과 | 높음 | 중간 | 현재는 측정 후 조건부 허용, 후속 코드 분할 |
| 자동 테스트 범위 부족 | 중간 | 높음 | 도메인·서비스 단위 테스트와 Preview smoke test |
| pnpm 버전 불일치 | 중간 | 중간 | Corepack과 `packageManager` 버전 고정 |
| Production 회귀 | 낮음 | 높음 | Preview 승인과 Vercel rollback 절차 |
| 의존성 취약점 | 중간 | 높음 | 취약 직접 의존성 제거·업데이트, CI 및 배포 전 audit |

## 출시 차단 기준

- 테스트 또는 빌드 실패
- High/Critical 취약점 미해결
- 주요 경로 직접 접근 실패
- 시연 데이터 고지 누락
- Production rollback 경로 미확인
