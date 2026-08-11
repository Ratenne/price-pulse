# Tech Stack Rules: Next.js

## WHEN
- Next.js App Router 프로젝트에서 라우트/페이지를 추가하거나 수정할 때
- 데이터 페칭 전략(SSR/SSG/RSC/Client fetch)을 결정할 때
- 배포/빌드 성능 최적화가 필요한 변경을 할 때

## DO
- Next.js 13+에서는 App Router를 기준으로 파일 기반 라우팅을 구성한다.
- 데이터는 Server Component 우선으로 가져오고, 상호작용이 필요한 경우만 Client Component로 전환한다.
- 이미지/폰트는 Next.js 기본 최적화(`next/image`, `next/font`)를 우선 사용한다.
- 캐싱 전략(revalidate, dynamic, fetch cache)을 기능 요구사항에 맞게 명시한다.
- 환경 변수는 실행 환경(서버/클라이언트) 노출 범위를 구분한다.

## DON'T
- 특별한 사유 없이 Client Component를 기본값으로 사용하지 않는다.
- 환경 변수를 클라이언트 번들에 무분별하게 노출하지 않는다.
- 페이지 단위 무거운 번들을 검증 없이 허용하지 않는다.

## CHECK
1. 라우트 변경 후 `npm run build` 성공 확인
2. 데이터 페칭 변경 후 SSR/SSG/RSC 동작이 의도와 일치하는지 확인
3. 배포 전 공개 환경 변수(`NEXT_PUBLIC_*`) 노출 범위 점검
