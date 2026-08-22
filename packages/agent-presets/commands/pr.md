---
description: 현재 브랜치 커밋으로 PR 생성
argument-hint: [커맨드(선택)]
---

현재 브랜치의 커밋으로 PR 생성 스킬.
인자: `$ARGUMENTS` (선택)

## 실행 절차

### 1. 사전 확인

```bash
git branch --show-current
git status
```

- 현재 브랜치가 `main`이면 **중단**한다 (PR을 만들 소스 브랜치가 아님). `/commit`을 먼저 실행하라고 안내.
- 커밋되지 않은 변경사항(staged/unstaged)이 있으면 사용자에게 알리고, `/commit`을 먼저 실행할지 확인한다. 사용자가 "그대로 진행"을 선택하면 커밋된 내용만으로 PR을 만든다.

### 2. 커밋 분석

```bash
git log main..HEAD --oneline
git diff main...HEAD --stat
```

- base 대비 새 커밋이 없으면 **중단**하고 `/commit`을 안내한다.
- 이미 열린 PR이 있는지 확인: `gh pr list --head $(git branch --show-current)` → 있으면 URL만 출력하고 종료.
- **대표 커밋 type 결정** (타이틀에 사용):
  - 커밋이 1개면 → 그 커밋의 type
  - 여러 개면 → `feat > fix > refactor > perf > 그 외` 우선순위로 대표 type 선택

### 3. push

```bash
git push -u origin HEAD
```

### 4. 본문 작성

- 커밋·변경사항을 분석하여 PR 본문을 작성한다.
- 임시 파일로 저장한다 (예: `/tmp/pr-body.md`).

### 5. PR 생성

```bash
gh pr create --base main --title "<title>" --body-file /tmp/pr-body.md
```

- `<title>` 형식: `type: 한글 설명`
  - 커밋이 1개면 → 그 커밋 메시지를 그대로 사용
  - 여러 개면 → 커밋들을 종합해 대표 type으로 새로 작성
- 생성 후 임시 파일은 삭제한다.

### 6. 결과 출력

- PR URL 출력
