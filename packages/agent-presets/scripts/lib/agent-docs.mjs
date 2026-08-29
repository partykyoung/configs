import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashContent, relativeProjectPath } from "../manifest.mjs";

const blockRegex =
  /<!-- (?:agent|claude|codex)-presets:start[\s\S]*?(?:agent|claude|codex)-presets:end -->/i;

const readConventionPaths = (conventionsSource, name) => {
  const file = join(conventionsSource, `${name}.md`);
  if (!existsSync(file)) return [];
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(
    readFileSync(file, "utf8"),
  );
  if (!frontmatter) return [];
  const pathsLine = /^paths:\s*\[(.*)\]\s*$/m.exec(frontmatter[1]);
  if (!pathsLine) return [];
  return [...pathsLine[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map(
    (match) => match[1] ?? match[2],
  );
};

const conventionScopeLabel = (conventionsSource, name) => {
  const paths = readConventionPaths(conventionsSource, name);
  if (!paths.length) return "항상";
  return paths.map((glob) => `\`${glob}\``).join(", ");
};

const createManagedBlock = ({
  agentName,
  enabledConventions,
  conventionsSource,
  includeReactBestPractices,
}) =>
  [
    "<!-- agent-presets:start (자동 생성 — 이 블록은 직접 편집하지 마세요. `sync-agent-presets` 가 갱신합니다) -->",
    "",
    `## 공용 ${agentName} 지침 (@kyoungah/agent-presets)`,
    "",
    "코드 작업 전에 다음 공통 컨벤션을 순서대로 읽고 적용합니다.",
    "",
    ...enabledConventions.map(
      (name, index) =>
        `${index + 1}. \`docs/conventions/${name}.md\` (적용 범위: ${conventionScopeLabel(conventionsSource, name)})`,
    ),
    "",
    "컨벤션이 충돌하면 더 구체적인 규칙을 우선합니다: Next.js > React > TypeScript.",
    "프로젝트 고유 지침은 공통 컨벤션보다 우선합니다.",
    ...(includeReactBestPractices
      ? [
          "",
          "React/Next.js 구현·리뷰·리팩터링·성능 최적화에는 `vercel-react-best-practices` 스킬을 사용합니다.",
          "스킬과 공통 컨벤션이 충돌하면 `docs/conventions/`를 우선합니다.",
        ]
      : []),
    "",
    "갱신은 `sync-agent-presets`를 재실행합니다.",
    "",
    "<!-- agent-presets:end -->",
  ].join("\n");

const nextAgentDoc = (current, title, managedBlock) => {
  blockRegex.lastIndex = 0;
  if (current == null) return `# ${title}\n\n${managedBlock}\n`;
  blockRegex.lastIndex = 0;
  if (blockRegex.test(current))
    return current.replace(blockRegex, managedBlock);
  const separator = current.endsWith("\n") ? "\n" : "\n\n";
  return `${current}${separator}${managedBlock}\n`;
};

const syncAgentDoc = ({
  path,
  title,
  group,
  managedBlock,
  legacyManualMarker,
  modes,
}) => {
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (
    current?.includes("agent-presets:manual") ||
    (legacyManualMarker && current?.includes(legacyManualMarker))
  ) {
    console.log(`ℹ ${path} 에 manual 마커가 있어 주입을 건너뜁니다.`);
    return { path, title, group, managedBlock, status: "manual" };
  }

  const next = nextAgentDoc(current, title, managedBlock);
  if (next === current) {
    return { path, title, group, managedBlock, status: "same" };
  }

  const status = current == null ? "new" : "changed";
  if (modes.readOnly) {
    if (modes.dry) {
      console.log(
        `\nℹ (--dry) ${title} 관리 블록이 ${current == null ? "생성" : "갱신"}됩니다. 쓰지 않음.`,
      );
    }
  } else {
    writeFileSync(path, next);
    console.log(
      `✓ ${title} 관리 블록 ${current == null ? "생성" : "갱신"} (${path})`,
    );
  }
  return { path, title, group, managedBlock, status };
};

export const syncAgentDocs = ({
  projectRoot,
  conventionsSource,
  enabledConventions,
  includeReactBestPractices,
  syncClaude,
  syncCodex,
  modes,
}) => {
  const definitions = [
    ...(syncClaude
      ? [
          {
            path: join(projectRoot, "CLAUDE.md"),
            title: "CLAUDE.md",
            group: "claude",
            agentName: "Claude",
            legacyManualMarker: "claude-presets:manual",
          },
        ]
      : []),
    ...(syncCodex
      ? [
          {
            path: join(projectRoot, "AGENTS.md"),
            title: "AGENTS.md",
            group: "codex",
            agentName: "Codex",
            legacyManualMarker: "codex-presets:manual",
          },
        ]
      : []),
  ];
  const results = definitions.map((definition) => {
    const managedBlock = createManagedBlock({
      agentName: definition.agentName,
      enabledConventions,
      conventionsSource,
      includeReactBestPractices,
    });
    return syncAgentDoc({ ...definition, managedBlock, modes });
  });
  const desiredBlocks = results
    .filter((result) => result.status !== "manual")
    .map((result) => ({
      path: relativeProjectPath(projectRoot, result.path),
      id: "agent-presets",
      sha256: hashContent(result.managedBlock),
      group: result.group,
    }));

  return { results, desiredBlocks };
};
