---
name: pr
description: 현재 Git 브랜치의 커밋을 분석하고 GitHub Pull Request를 생성한다. 사용자가 PR 생성, 브랜치 게시, pull request 작성을 요청할 때 사용한다. 커밋만 요청하거나 GitHub가 아닌 플랫폼에는 사용하지 않는다.
---

# Pull Request

1. 현재 브랜치와 working tree 상태를 확인한다.
   - `main`이면 PR 소스 브랜치가 아니므로 중단한다.
   - 미커밋 변경이 있으면 알리고, 사용자 승인 없이 임의로 커밋하거나 포함하지 않는다.
2. 사용자가 지정한 base가 있으면 사용하고, 없으면 `main`을 base로 삼는다. base와 비교해 커밋과 diff를 분석한다.
   - base 대비 새 커밋이 없으면 중단한다.
   - 현재 브랜치에 열린 PR이 있으면 새로 만들지 않고 기존 PR URL을 반환한다.
3. PR 제목을 정한다.
   - 형식은 `type: 한글 설명`으로 작성한다.
   - 커밋 하나면 메시지를 활용하고, 여러 개면 전체 변경을 요약한다.
   - 여러 type이 섞여 있으면 `feat > fix > refactor > perf > 기타` 순으로 대표 type을 고른다.
4. 변경 목적, 주요 변경사항과 검증 결과를 담은 PR 본문을 작성한다. AI 서명은 추가하지 않는다.
5. 현재 브랜치를 `git push -u origin HEAD`로 게시한다.
6. 충돌하지 않는 임시 파일에 본문을 저장하고 `gh pr create --base <base> --title "<title>" --body-file <path>`로 PR을 생성한다.
7. 임시 파일을 정리하고 PR URL을 반환한다.
