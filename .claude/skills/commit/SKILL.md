---
name: commit
description: Git 변경사항을 검토하고 안전하게 커밋한다. 사용자가 커밋 생성, 변경사항 저장, 커밋 메시지 작성을 요청할 때 사용한다. 단순 상태 확인이나 코드 리뷰에는 사용하지 않는다.
---

# Commit

1. 현재 브랜치와 변경사항을 확인한다.
   - `git branch --show-current`, `git status`, staged/unstaged diff와 최근 커밋을 확인한다.
   - 변경사항이 없으면 커밋하지 않고 종료한다.
   - `main`이면 변경사항에 맞는 `feat/`, `fix/`, `refactor/` 등의 브랜치를 생성하고 전환한다.
2. 커밋 범위를 정한다.
   - 사용자 소유의 기존 변경을 보존하고, 이번 요청과 관련된 파일만 포함한다.
   - `.env`, credentials 등 민감 파일을 제외한다.
   - 성격이 크게 다른 변경이 섞여 있으면 커밋 분리를 먼저 제안한다.
3. 커밋 메시지를 정한다.
   - 사용자가 메시지를 주면 subject로 사용하되 prefix가 없으면 적절한 type을 붙인다.
   - 메시지가 없으면 변경사항을 바탕으로 한글 subject를 작성한다.
   - 형식은 `type: 명사형 설명`이며 type은 `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci` 중에서 고른다.
   - subject는 50자 내외, 명사형 종결, 마침표 없이 작성한다.
   - 변경 파일이 3개 이상이거나 의도 설명이 필요하면 body에 무엇을/왜 변경했는지 bullet 2~4개로 적는다.
   - AI 서명과 `Co-Authored-By` footer를 추가하지 않는다.
4. 포함할 파일을 경로별로 staging한다. `git add -A`는 사용하지 않는다.
5. staged diff를 다시 검토한 뒤 커밋한다. 커밋 요청만으로 push하지 않는다.
6. 커밋 해시와 메시지, 커밋에서 제외한 변경사항을 알린다.
