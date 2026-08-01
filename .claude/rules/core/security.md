# Core Rules: Security Guard

## 🔒 보안 가드 규칙 (개발 진행 시 침투 방지)

### AI 명령어 실행 전 검증 (필수)

다음 명령어 실행 전 반드시 사용자 승인 요청:
- ❌ `sudo` 권한 필요한 명령어
- ❌ 시스템 파일 수정 (`/etc/`, `/System/`, `/Library/` 하위)
- ❌ LaunchAgent 등록/수정 (`~/Library/LaunchAgents/`, `/Library/LaunchAgents/`)
- ❌ 쉘 설정 파일 수정 (`~/.zshrc`, `~/.bash_profile`, `~/.profile`) - 사용자 명시 요청 시만
- ❌ SSH 키 생성/수정 (`~/.ssh/`)
- ❌ 환경 변수 전체 덮어쓰기 (`export` 대량 실행)
- ❌ 외부 URL에서 스크립트 다운로드 및 실행 (`curl | sh`, `wget | sh`)

### 시스템 파일 수정 금지

- ❌ macOS 시스템 파일 수정 금지 (`/System/`, `/Library/`, `/usr/local/` 시스템 영역)
- ❌ 키체인 접근 명령어 금지 (`security` 명령어)
- ❌ 루트 권한 자동 획득 시도 금지
- ✅ 프로젝트 디렉토리 내 파일만 수정 가능

### 환경 변수 노출 방지

- ❌ 환경 변수 전체 출력 금지 (`env`, `printenv` 전체 출력)
- ❌ `.env` 파일 내용 전체 출력 금지 (필요 시 마스킹 처리)
- ❌ API 키, SECRET, TOKEN 등 민감 정보 출력 금지
- ✅ 필요 시 마스킹 처리: `API_KEY=sk_***...***`

### 외부 연결 모니터링

- ⚠️ 의심스러운 외부 연결 감지 시 경고:
  - 알 수 없는 IP로의 연결
  - 비정상적인 포트 사용
  - 백그라운드 프로세스의 네트워크 활동
- ✅ 정상적인 연결: GitHub, npm registry, 공식 API 서비스

### Git 커밋 보안 검증

커밋 전 자동 검증:
- ❌ `.env` 파일 커밋 시도 감지 → 즉시 중단
- ❌ API 키, SECRET, TOKEN 하드코딩 감지 → 즉시 중단
- ❌ `node_modules/`, `.next/`, `dist/`, `build/` 커밋 시도 → 경고
- ❌ 대용량 파일(.db, .csv, dump) 커밋 시도 → 경고
- ✅ `.gitignore` 확인 후 커밋 진행

### 보안 위반 감지 시 출력 형식

```
[SECURITY_VIOLATION]: [위반 유형]

[REASON]:
- [구체적인 위반 내용]

[IMMEDIATE_ACTION]:
1. [조치 사항 1]
2. [조치 사항 2]

[PREVENTION]:
- [재발 방지 방법]
```

### 보안 점검 주기

- **개발 시작 전**: 환경 변수 파일 확인, `.gitignore` 확인
- **커밋 전**: 민감 정보 검증, `.env` 파일 확인
- **의심스러운 명령어 실행 전**: 사용자 승인 요청
- **정기 점검**: 주 1회 보안 체크리스트 실행 (선택)

---

**참고:** 이 규칙은 Cursor, Claude Code, Codex 모두에 적용됩니다.
