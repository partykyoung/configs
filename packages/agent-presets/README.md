# @kyoungah/agent-presets

Claude Code와 Codex가 같은 프로젝트 지식과 Git 워크플로를 공유하도록 구성하는 프리셋입니다. TypeScript 컨벤션은 항상 적용하고, 소비 프로젝트의 의존성에 따라 React와 Next.js 컨벤션을 추가합니다.

## 요구 사항

- Node.js 18 이상
- Claude Code 또는 Codex

## 설치

프로젝트의 개발 의존성으로 설치합니다.

```sh
pnpm add -D @kyoungah/agent-presets
```

처음 설치한 뒤 프리셋을 동기화합니다.

```sh
pnpm exec sync-agent-presets --agent all
```

반복해서 사용할 명령은 소비 프로젝트의 `package.json`에 등록하는 것을 권장합니다.

```json
{
  "scripts": {
    "agent:sync": "sync-agent-presets --agent all",
    "agent:check": "sync-agent-presets --check --agent all",
    "agent:doctor": "sync-agent-presets --doctor --agent all"
  }
}
```

## 생성되는 항목

| 대상                           | 내용                                          |
| ------------------------------ | --------------------------------------------- |
| `docs/conventions/`            | TypeScript와 감지된 React/Next.js 공통 컨벤션 |
| `CLAUDE.md`                    | Claude Code가 읽을 얇은 관리 블록             |
| `AGENTS.md`                    | Codex가 읽을 얇은 관리 블록                   |
| `.claude/skills/`              | Claude Code용 `commit`, `pr` 스킬             |
| `.agents/skills/`              | Codex용 `commit`, `pr` 스킬                   |
| `.agent-presets/manifest.json` | 생성 파일의 경로, 원본, 해시와 프리셋 버전    |

소비 프로젝트에서 `react` 또는 `next` 의존성을 감지하면 React/Next.js 컨벤션과 Vercel의 `vercel-react-best-practices` 스킬도 동기화합니다.

`CLAUDE.md`와 `AGENTS.md`의 기존 내용은 유지하고 `agent-presets:start`와 `agent-presets:end` 사이의 관리 블록만 갱신합니다. 파일에 `agent-presets:manual` 주석이 있으면 해당 진입점 주입을 건너뜁니다.

## 명령어

```sh
# Claude와 Codex 모두 동기화
pnpm exec sync-agent-presets --agent all

# 하나만 동기화
pnpm exec sync-agent-presets --agent claude
pnpm exec sync-agent-presets --agent codex

# 변경 내용을 쓰지 않고 diff 확인
pnpm exec sync-agent-presets --dry --agent all

# 동기화 여부 검사 — 변경이 필요하면 종료 코드 1
pnpm exec sync-agent-presets --check --agent all

# 프로젝트 감지 결과와 관리 상태 진단
pnpm exec sync-agent-presets --doctor --agent all

# 변경 파일마다 적용 여부 선택
pnpm exec sync-agent-presets --interactive --agent all
```

`--agent`를 생략하면 TTY에서는 대상을 묻고, 비대화형 환경에서는 Claude와 Codex를 모두 선택합니다. `--dry`, `--check`, `--doctor`는 파일을 변경하지 않습니다.

## 안전한 동기화

`.agent-presets/manifest.json`은 프리셋이 생성한 파일과 마지막 동기화 시점의 SHA-256 해시를 기록합니다.

- 현재 프리셋에서 제외된 파일이 기록된 해시와 같으면 자동 삭제합니다.
- 사용자가 수정한 파일은 삭제하지 않고 프리셋의 관리 대상에서 제외합니다.
- Claude만 동기화해도 Codex의 manifest 항목은 유지하며, 반대의 경우도 같습니다.
- 손상되거나 지원하지 않는 manifest는 자동으로 덮어쓰지 않습니다.

## 업데이트

패키지를 업데이트한 뒤 동기화 명령을 다시 실행합니다.

```sh
pnpm update @kyoungah/agent-presets
pnpm exec sync-agent-presets --agent all
pnpm exec sync-agent-presets --check --agent all
```

CI에서는 다음처럼 상태 이탈을 검사할 수 있습니다.

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm exec sync-agent-presets --check --agent all
```

## 1.0.0 이전 버전에서 마이그레이션

1.0.0은 공통 지식을 `docs/conventions/`로 옮기고 `CLAUDE.md`와 `AGENTS.md`를 얇은 진입점으로 사용합니다. 처음 동기화할 때 이전 프리셋이 만든 다음 파일은 원본 해시가 같은 경우에만 삭제합니다.

- `.claude/rules/*.md`
- `.codex/rules/*.md`
- `.claude/commands/commit.md`
- `.claude/commands/pr.md`

수정된 파일은 그대로 보존합니다. 마이그레이션 결과는 `--doctor`로 확인할 수 있습니다.

## 개발

```sh
pnpm test:agent-presets
pnpm sync:check -- --agent all
```

릴리스 변경사항은 [CHANGELOG.md](./CHANGELOG.md)에서 확인합니다.
