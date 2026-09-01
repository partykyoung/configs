# Changelog

이 문서는 `@kyoungah/agent-presets`의 주요 변경사항을 기록합니다.

## 1.0.0 - 2026-09-01

### Added

- Claude Code와 Codex가 함께 사용하는 `docs/conventions/` 공통 지식 구조
- 소비 프로젝트의 의존성에 따른 React와 Next.js 컨벤션 선택 동기화
- Vercel `vercel-react-best-practices` 외부 스킬의 고정 revision 설치와 상태 추적
- Claude Code와 Codex에서 공유하는 `commit`, `pr` 스킬
- 변경 미리보기, 대화형 적용, `--check`, `--doctor` 실행 모드
- 생성 파일의 경로와 원본 SHA-256을 기록하는 `.agent-presets/manifest.json`
- manifest 마이그레이션과 사용자 수정 파일 보존을 검증하는 회귀 테스트
- pull request와 push에서 테스트와 동기화 상태를 검사하는 GitHub Actions 워크플로

### Changed

- `CLAUDE.md`와 `AGENTS.md`를 공통 문서의 읽는 순서와 우선순위만 제공하는 얇은 진입점으로 변경
- Git command 문서를 자동 로드 command 대신 명시적으로 호출하는 스킬로 전환
- 동기화 스크립트를 CLI, 프로젝트 감지, 파일 복사, 외부 스킬, 관리 문서, manifest, 진단 모듈로 분리

### Migration

- 이전 프리셋이 생성한 `.claude/rules/`, `.codex/rules/`, `.claude/commands/` 파일은 원본 해시가 같은 경우에만 삭제
- 사용자가 수정한 폐기 파일은 보존하고 이후 프리셋 관리 대상에서 제외
