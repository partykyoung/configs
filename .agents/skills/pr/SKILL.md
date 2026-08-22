---
name: pr
description: 현재 Git 브랜치의 커밋을 분석하고 GitHub Pull Request를 생성한다. 사용자가 PR 생성, 브랜치 게시, pull request 작성을 요청할 때 사용한다. 커밋만 요청하거나 GitHub가 아닌 플랫폼에는 사용하지 않는다.
---

# Pull Request

## 절차

1. 현재 브랜치와 working tree 상태를 확인한다.
   - `main`이면 PR 소스 브랜치가 아니므로 중단한다.
   - 미커밋 변경이 있으면 알리고, 사용자 승인 없이 임의로 커밋하지 않는다.
2. `main..HEAD` 커밋과 `main...HEAD` diff를 분석한다.
   - 새 커밋이 없으면 중단한다.
   - 현재 브랜치에 열린 PR이 있으면 새로 만들지 않고 URL을 반환한다.
3. 대표 커밋 type을 정한다. 여러 type이면 `feat > fix > refactor > perf > 기타` 순으로 선택한다.
4. 원격 브랜치가 없으면 `git push -u origin HEAD`로 게시한다.
5. 변경의 목적과 검증 내용을 담은 PR 본문을 임시 파일로 작성한다.
6. `gh pr create --base main --title "<title>" --body-file <path>`로 PR을 생성한다.
   - title은 `type: 한글 설명` 형식으로 작성한다.
   - 커밋 하나면 메시지를 활용하고, 여러 개면 전체 변경을 요약한다.
7. 임시 파일을 정리하고 PR URL을 반환한다.
