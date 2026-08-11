# Error Handling Standard (SSOT)

> 모든 에이전트/커맨드/자동화 스킬이 공통으로 따라야 하는 에러 처리 규칙

---

## 필수 에러 처리

### 1) 입력 파일 없음
```text
[ERROR]: Required file not found
- Missing: [파일 경로]
- Required by: [Agent/Command]
- Action: [어떤 Phase/Agent를 먼저 실행해야 하는지]
```

### 2) 입력 파일 비어있음
```text
[ERROR]: Required file is empty
- File: [파일 경로]
- Required content: [필수 내용]
- Action: [수정 방법]
```

### 3) 선행 Phase 미완료
```text
[ERROR]: Prerequisite phase not completed
- Required: Phase [N] - [Phase 이름]
- Missing: [미충족 항목]
- Action: Phase [N] 완료 후 재시도
```

### 4) 출력 생성 실패
```text
[ERROR]: Output generation failed
- Agent/Command: [이름]
- Reason: [실패 사유]
- Fallback: [대안 행동]
```

---

## 재시도 규칙

- 자동 재시도: 최대 2회
- 2회 실패 후: `[ERROR]` 출력 + 인간 개입 요청
- 재시도는 상태 변경(입력 보정/선행 완료) 이후에만 수행

---

## 에스컬레이션

해결 불가 시 반드시 아래를 함께 보고한다.

1. 실패 지점(파일/단계/커맨드)
2. 재현 조건
3. 다음 액션 1개

연쇄 실패 방지를 위해 불필요한 추가 에이전트 호출은 금지한다.
