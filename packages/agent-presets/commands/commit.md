---
description: 커밋 생성
argument-hint: [커밋 메시지(선택)]
---

커밋 생성 스킬.
인자: `$ARGUMENTS` (커밋 메시지, 선택)

## 실행 절차

### 1. 브랜치 확인

```bash
git branch --show-current
```

- **보호 브랜치 감지**: 현재 브랜치가 `main`이면 직접 커밋하지 않는다.
  1. 변경사항을 분석하여 적절한 브랜치명을 자동 생성한다 (예: `feat/기능-설명`, `fix/버그-수정` 등)
  2. `git checkout -b {브랜치명}` 으로 새 브랜치를 생성하고 전환한다.
  3. 이후 단계를 새 브랜치에서 진행한다.

### 2. 변경사항 분석

```bash
git status
git diff --staged
git diff
git log --oneline -5
```

- staged + unstaged 변경사항을 모두 확인
- 변경된 파일 목록과 내용을 분석

### 3. 커밋 메시지 결정

우선순위:

1. `$ARGUMENTS`가 있으면 → subject로 사용
   - `type:` prefix가 포함되어 있으면 그대로 사용
   - 없으면 변경사항을 분석해 type만 판별하여 붙인다
2. 위에 해당하지 않으면 → 변경사항을 분석하여 **한글로** 커밋 메시지 자동 작성

**커밋 메시지 형식:**

```
feat: 커밋메시지
```

**type 선택 기준** (feat, fix, refactor, docs, test, chore, perf, ci):

- 새 기능·동작 추가 → `feat` / 버그·잘못된 동작 수정 → `fix` / 동작 변화 없는 구조 개선 → `refactor`
- 여러 성격이 섞여 있으면 **주된 변경 기준**으로 선택하되, 성격이 크게 다른 변경(예: 기능 추가 + 무관한 리팩토링)이 섞여 있으면 커밋 분할을 먼저 제안한다

**작성 규칙:**

- subject는 50자 내외, **명사형 종결**(~추가, ~수정, ~개선), 마침표 금지
- 변경 파일이 3개 이상이거나 의도 설명이 필요한 변경이면 body에 "무엇을/왜"를 bullet 2~4개로 작성
- `Generated with ...`, `Co-Authored-By` 등 **AI 서명·footer 추가 금지**

### 4. 커밋 실행

- 변경된 파일을 개별적으로 staging (git add -A 사용 금지)
- `.env`, credentials 등 민감 파일은 제외
- 커밋 생성

### 5. 결과 출력

- 커밋 해시 출력
