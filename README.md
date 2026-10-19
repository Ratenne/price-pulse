# PricePulse

<img width="866" height="288" alt="ChatGPT_Image_Jul_25__2026__07_03_27_AM_복사본-removebg-preview" src="https://github.com/user-attachments/assets/c66ec0ce-80e0-4309-86b8-489af7f18bf6" />

PricePulse는 GPU, CPU, 노트북의 가격 흐름을 비교해 현재 가격 수준과 구매·판매 시점을 살펴볼 수 있는 서비스입니다.

## 주요 기능

- 카테고리별 상품 탐색과 가격 비교
- 최근 가격 변동과 가격 이력 확인
- 최저가에 가까운 상품 탐색
- 가격순 정렬과 카테고리 필터
- 구매자와 판매자를 위한 거래 가격 참고 정보
- 라이트·다크 테마
- 데스크톱, 태블릿, 모바일 화면 지원

## 이용 안내

표시되는 가격과 거래 가격 안내는 참고용이며, 실제 판매 가격이나 향후 가격을 보장하지 않습니다. 거래 전 판매처의 최신 가격과 조건을 확인해 주세요.

## 현재 데이터와 구현 범위

2026-10-19 기준, 화면은 `/api/products`를 통해 Supabase PostgreSQL의 다나와 가격 데이터를 조회합니다. 상품 수는 DB에 따라 달라지며 기존 28개 로컬 mock 데이터는 현재 화면 조회에 사용하지 않습니다. GPU·CPU·노트북 화면을 제공하지만 현재 다나와 대량 상품 탐색·현재가 수집 대상은 GPU입니다.

- 과거 가격: 한국시간 기준 이번 달을 제외한 최근 6개월의 월별 최저가. 매주 월요일 06:17(KST)에 이력을 갱신하도록 설정되어 있습니다.
- 현재 가격: 3시간마다 수집해 DB에 저장하는 스냅샷. 화면 요청 시 크롤링하지 않으며 12시간 이상 지난 스냅샷은 확인 불가로 처리합니다.
- 가격 검토: 원본은 보존하고 검토 제외된 월/가격을 통계·순위에서 제외합니다. 차트의 제외 월은 빈 값으로 표시하며 추정하지 않습니다.
- 검색·정렬·페이지네이션·카테고리 집계는 DB에서 처리합니다. 일반 목록은 페이지당 10개입니다.
- API 응답은 CDN에서 300초 캐시하고 최대 3,600초 동안 이전 응답을 제공하며 재검증할 수 있습니다. 따라서 수집 시각과 화면 반영 시각은 다를 수 있습니다.
- 사용자 계정·결제·실거래는 미구현이며 안심거래 화면은 가격 참고 안내입니다.

## 로컬 실행

CI 기준 Node.js 24와 `package.json`에 지정된 pnpm 10.34.4를 사용합니다.

```sh
corepack enable
corepack prepare pnpm@10.34.4 --activate
pnpm install --frozen-lockfile
```

`.env.example`을 `.env.local`로 복사한 뒤 DB 접속 정보를 로컬에서 입력합니다. 실제 접속 정보는 커밋하지 않습니다. 기존 DB를 사용할 때는 아래 SQL의 적용 상태를 먼저 확인합니다. 새 DB는 스키마 생성 외에 상품·출처 매핑·가격 이력 수집도 필요합니다.

| SQL                                            | 현재 역할                                            |
| ---------------------------------------------- | ---------------------------------------------------- |
| `database/001_initial_price_history.sql`       | 상품·출처 매핑·가격 이력 기본 테이블                 |
| `database/002_product_discovery_fields.sql`    | 현재가·등록 월·출처 URL 컬럼                         |
| `database/003_reviewed_price_exclusions.sql`   | 가격 검토 제외 기록과 분석용 뷰                      |
| `database/004_live_price_snapshot.sql`         | 현재가 확인 시각과 조회 인덱스                       |
| `database/005_price_collection.sql`            | 별도 `pc_*` 확장 스키마. 현재 API·배치에는 미연결    |
| `database/006_review_g210_september_price.sql` | G210의 검토된 2026년 9월 특정 가격 제외 (`003` 필요) |

SQL 파일의 존재가 운영 DB 적용 완료를 의미하지 않습니다. 가격 검토 절차는 [가격 이력 검토](database/PRICE_QUALITY.md)를 확인합니다.

서로 다른 터미널에서 API와 프런트엔드를 실행합니다.

```sh
pnpm run dev:api
```

```sh
pnpm run dev
```

프런트엔드는 기본 3000번 포트(사용 중이면 다음 포트), API는 기본 3001번 포트입니다. Vite가 `/api` 요청을 API 서버로 전달합니다. DB/API가 준비되지 않으면 상품 조회 오류가 표시되며 mock 데이터로 대체하지 않습니다.

## 검증과 가격 갱신

```sh
pnpm run check
pnpm run test
pnpm run build
```

빌드 결과는 `dist/public`과 Express·백필 스크립트 번들입니다. Express로 실행할 때는 `NODE_ENV=production`을 설정하고 `node dist/index.js`를 실행합니다. `pnpm start`는 POSIX 환경변수 구문이므로 PowerShell에서는 다음과 같이 실행합니다.

```powershell
$env:NODE_ENV = "production"
node --env-file=.env.local dist/index.js
```

아래 갱신 명령은 외부 요청과 DB 쓰기를 수행합니다. GitHub Actions에서는 secrets를 주입하며, 로컬에서는 `.env.local`을 명시적으로 읽힙니다.

```sh
node --env-file=.env.local --import tsx server/scripts/refreshDanawa.ts
node --env-file=.env.local --import tsx server/scripts/refreshLivePrices.ts
```

같은 스크립트의 pnpm 별칭은 `refresh:danawa`, `refresh:live`입니다. 이 별칭 자체는 `.env.local`을 자동 로드하지 않으므로 환경변수를 먼저 주입해야 합니다. 과거 이력 초기 수집에는 `backfill:danawa`, `backfill:danawa:bulk` 명령도 제공합니다.

## 배포와 확인할 사항

- Vercel은 `dist/public`과 `api/products.ts`를 함께 배포합니다. 정적 파일만 호스팅하면 상품 API를 사용할 수 없습니다.
- PR·`main` 푸시에 CI가 타입 검사·테스트·빌드를 실행합니다.
- `vercel.json`은 `main`의 Git 자동 배포를 비활성화합니다. Production은 `Deploy Production` workflow를 수동 실행하는 구성입니다.
- Production에는 Vercel 배포 secrets 외에 DB 환경변수가 필요합니다. 수집 workflow에는 DB secrets가 필요합니다. Environment 승인자 설정·실제 workflow 실행 결과·운영 DB 적용 상태는 별도로 확인해야 합니다.
- `docs/`와 `tasks/`의 초기 정적 데모 계획에는 과거 설명이 남아 있습니다. 현재 구현은 이 README, `PRODUCT.md`와 실제 코드를 기준으로 확인합니다.
- 일부 화면 안내에는 아직 “조회 시 현재가 확인·DB 미저장”이라는 이전 방식의 문구가 남아 있습니다. 실제 구현은 위의 DB 스냅샷 방식이며 해당 UI 문구 수정은 후속 작업입니다.
