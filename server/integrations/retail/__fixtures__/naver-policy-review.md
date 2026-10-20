# 네이버 정책 확인 fixture

2026-10-20, `PricePulse/0.1 (robots policy review)`로 각 robots.txt를 1회 확인했다.

- `naver-stores.robots.txt`: `https://smartstore.naver.com/robots.txt` 및 `https://brand.naver.com/robots.txt`가 HTTP 200 text/plain으로 반환한 동일 본문. 두 응답의 일반 수집기는 `Disallow: /`다. 끝 공백/개행은 테스트 파일 저장 형식이다.
- `https://shopping.naver.com/robots.txt`: HTTP 200 text/plain. Yeti 및 일부 Googlebot 경로를 구분하고 일반 수집기는 `Disallow: /`로 차단했다. 본문 복사본은 추가하지 않았다.
- `naver-search-blocked.excerpt.html`: `https://search.shopping.naver.com/robots.txt`의 HTTP 418 text/html 응답에서 연속된 본문 일부를 발췌했다. 상품 HTML이 아니며, 파일 끝은 발췌 경계다. HTML 자동 보정 결과를 실제 페이지 구조로 취급하지 않는다.

상품 검색·카탈로그·스마트스토어·브랜드스토어 상품 페이지는 추가 요청하지 않았다.
정상 상품 HTML fixture 및 판매자/상품 ID 체계가 검증되지 않아 정상 상품 추출 테스트는 N/A다.
Mock transport의 `<html>...`는 합성 전송 테스트 데이터이며 네이버 상품 구조 샘플이 아니다.
합성 정규화 입력과 테스트 Parser 의존성도 Phase 2 저장 경계를 검증할 뿐 실제 네이버 파싱 성공을 뜻하지 않는다.

robots.txt는 데이터 저장·분석·재표시 허가서가 아니다. 운영 코드의 NAVER 정책은 pending을 유지한다.
