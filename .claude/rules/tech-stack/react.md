# Tech Stack Rules: React

## WHEN
- React 기반 UI 컴포넌트를 신규 작성/수정할 때
- 상태 관리 훅(useState/useReducer/useContext)을 추가할 때
- 렌더링 성능 이슈(불필요한 리렌더링)가 의심될 때

## DO
- 함수형 컴포넌트를 사용하고 Props 타입(TypeScript)을 명시한다.
- Hooks는 컴포넌트 최상위에서만 호출한다.
- 상태는 "로컬(useState) → 복잡 상태(useReducer) → 공유 상태(Context)" 순서로 선택한다.
- 컴포넌트는 단일 책임 기준으로 분리하고 재사용 가능 단위를 우선 만든다.
- 성능 최적화는 측정 후 적용한다(필요한 경우에만 React.memo/useMemo/useCallback).

## DON'T
- 클래스 컴포넌트를 신규로 도입하지 않는다.
- 조건문/반복문 내부에서 Hooks를 호출하지 않는다.
- 측정 없이 memoization을 남발하지 않는다.
- 데이터/뷰/비즈니스 로직을 하나의 컴포넌트에 과도하게 결합하지 않는다.

## CHECK
1. 컴포넌트/훅 변경 후 `npm run lint` 통과 확인
2. 타입 변경 후 `npx tsc --noEmit` 통과 확인
3. 렌더링 이슈가 있었다면 React DevTools로 리렌더 횟수 감소 확인
