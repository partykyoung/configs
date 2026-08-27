#!/usr/bin/env node
import {
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  copyFileSync,
  unlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";

const here = dirname(fileURLToPath(import.meta.url));
const packageRequire = createRequire(import.meta.url);

// ── 프로젝트 루트 결정 ─────────────────────────────────────────────────
//   pnpm 워크스페이스에서 실행하면 projectRoot가 패키지 디렉토리가 될 수 있다.
//   git rev-parse --show-toplevel 로 실제 프로젝트 루트를 찾고,
//   실패하면 현재 작업 디렉토리를 사용한다.
function findProjectRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.status === 0) return result.stdout.trim();
  return process.cwd();
}

const projectRoot = findProjectRoot();

// ── 실행 모드 ──────────────────────────────────────────────────────────
//   (기본)          TTY에서는 에이전트를 선택하고, 비대화형에서는 모두 동기화.
//   --agent <names> claude,codex 형식으로 동기화 대상을 지정.
//   --dry|--preview  쓰지 않고 바뀔 부분을 unified diff 로 미리보기만.
//   --interactive|-i 변경 파일마다 diff 를 보여주고 적용/건너뜀/전체/중단 선택.
//                    TTY 가 아니면 경고 후 기본 동작으로 fallback.
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry") || argv.includes("--preview");
let INTERACTIVE = argv.includes("--interactive") || argv.includes("-i");
if (INTERACTIVE && !process.stdin.isTTY) {
  console.warn(
    "⚠ --interactive 는 TTY 가 필요합니다 (비대화형 환경). 기본 덮어쓰기로 진행합니다.",
  );
  INTERACTIVE = false;
}

function getAgentArg() {
  const inlineArg = argv.find((arg) => arg.startsWith("--agent="));
  if (inlineArg) return inlineArg.slice("--agent=".length).toLowerCase();

  const argIndex = argv.indexOf("--agent");
  if (argIndex === -1) return null;
  return argv[argIndex + 1]?.toLowerCase() ?? "";
}

function parseAgentSelection(value) {
  const aliases = {
    1: "claude",
    2: "codex",
    claude: "claude",
    codex: "codex",
  };
  const values = value
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (values.includes("all")) return new Set(["claude", "codex"]);

  const invalidValues = values.filter((item) => aliases[item] == null);
  if (!values.length || invalidValues.length) return null;
  return new Set(values.map((item) => aliases[item]));
}

function invalidSelection(value, source) {
  console.error(
    `✗ 잘못된 ${source}입니다: ${value || "(없음)"}. claude와 codex를 쉼표로 구분해 선택하세요.`,
  );
  process.exit(1);
}

async function selectAgents() {
  const agentArg = getAgentArg();
  if (agentArg != null) {
    const selection = parseAgentSelection(agentArg);
    if (selection) return selection;
    invalidSelection(agentArg, "--agent 값");
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return new Set(["claude", "codex"]);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n동기화할 에이전트를 선택하세요 (복수 선택 가능):");
  console.log("  [x] 1) Claude");
  console.log("  [x] 2) Codex");
  const answer = (await rl.question("선택 [1,2]: ")).trim().toLowerCase();
  rl.close();

  const selection = parseAgentSelection(answer || "1,2");
  if (selection) return selection;
  invalidSelection(answer, "선택");
}

const selectedAgents = await selectAgents();
const syncClaude = selectedAgents.has("claude");
const syncCodex = selectedAgents.has("codex");
const selectedAgentLabel = [
  ...(syncClaude ? ["Claude"] : []),
  ...(syncCodex ? ["Codex"] : []),
].join(" + ");
console.log(`ℹ 동기화 대상: ${selectedAgentLabel}`);

// 소비처 package.json 의 모든 의존성을 하나로 합쳐 반환.
function getConsumerDeps() {
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    };
  } catch {
    return {};
  }
}

const consumerDeps = getConsumerDeps();
const depNames = Object.keys(consumerDeps);

const includeReact = depNames.includes("react");
if (includeReact) {
  console.log("ℹ react 의존성 감지 — react 규칙을 에이전트 지침에 포함합니다.");
}

const includeNextjs = depNames.includes("next");
if (includeNextjs) {
  console.log("ℹ next 의존성 감지 — next 규칙을 에이전트 지침에 포함합니다.");
}

// ── 조건부 컨벤션과 스킬 ────────────────────────────────────────────────
//   소비 프로젝트의 의존성에 맞는 문서와 스킬만 복사한다.
const conditionalConventionFiles = {
  "react.md": includeReact,
  "next.md": includeNextjs,
};
const isEnabledConventionFile = (rel) =>
  conditionalConventionFiles[rel] ?? true;

const enabledConventions = [
  "typescript",
  ...(includeReact ? ["react"] : []),
  ...(includeNextjs ? ["next"] : []),
];

const includeReactBestPractices = includeReact || includeNextjs;

// ── 파일 단위 동기화 엔진 ────────────────────────────────────────────────
const relLabel = (p) => relative(projectRoot, p) || ".";

function walk(root) {
  const out = [];
  const rec = (rel) => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const childRel = rel ? join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) rec(childRel);
      else if (entry.isFile()) out.push(childRel);
    }
  };
  rec("");
  return out;
}

function classify(srcFile, tgtFile) {
  if (!existsSync(tgtFile)) return "new";
  try {
    if (statSync(srcFile).size !== statSync(tgtFile).size) return "changed";
    return readFileSync(srcFile).equals(readFileSync(tgtFile))
      ? "same"
      : "changed";
  } catch {
    return "changed";
  }
}

function planArea(srcRoot, tgtRoot, fileFilter) {
  if (!existsSync(srcRoot)) return [];
  const files = fileFilter ? walk(srcRoot).filter(fileFilter) : walk(srcRoot);
  return files.map((rel) => {
    const s = join(srcRoot, rel);
    const t = join(tgtRoot, rel);
    return { rel, s, t, status: classify(s, t) };
  });
}

function printDiff(op) {
  const from = op.status === "new" ? "/dev/null" : op.t;
  const res = spawnSync(
    "git",
    ["--no-pager", "diff", "--no-index", "--", from, op.s],
    { stdio: "inherit" },
  );
  if (res.error) console.log("   (git 없음 — diff 생략)");
}

function writeOp(op) {
  mkdirSync(dirname(op.t), { recursive: true });
  copyFileSync(op.s, op.t);
}

async function runSync(plans) {
  const ops = plans.flatMap((p) => p.ops);
  const changed = ops.filter((o) => o.status !== "same");
  const summary = {
    new: 0,
    changed: 0,
    same: ops.length - changed.length,
    skipped: 0,
  };

  if (!changed.length) {
    console.log("✓ 모든 프리셋 파일이 이미 최신입니다 (변경 없음).");
    return summary;
  }

  if (DRY) {
    console.log(
      `\n=== 미리보기 (--dry): ${changed.length}개 파일이 바뀝니다. 쓰지 않음 ===`,
    );
    for (const op of changed) {
      console.log(
        `\n### [${op.status === "new" ? "신규" : "변경"}] ${relLabel(op.t)}`,
      );
      printDiff(op);
    }
    console.log(
      `\n요약: 신규 ${changed.filter((o) => o.status === "new").length} · 변경 ${
        changed.filter((o) => o.status === "changed").length
      } · 동일 ${summary.same}. 실제 반영하려면 --dry 없이 다시 실행하세요.`,
    );
    return summary;
  }

  let rl = null;
  let applyRest = false;
  let quit = false;
  if (INTERACTIVE) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n=== 대화형 동기화: 변경 ${changed.length}개 ===`);
  }

  for (const op of changed) {
    let apply = true;
    if (INTERACTIVE && !applyRest && !quit) {
      console.log(
        `\n### [${op.status === "new" ? "신규" : "변경"}] ${relLabel(op.t)}`,
      );
      printDiff(op);
      const ans = (
        await rl.question(
          "적용? [y]예 / [n]건너뜀 / [a]나머지 전체 / [q]중단: ",
        )
      )
        .trim()
        .toLowerCase();
      if (ans === "q") quit = true;
      else if (ans === "a") applyRest = true;
      else if (ans === "n" || ans === "no") apply = false;
    }
    if (quit) apply = false;

    if (apply) {
      writeOp(op);
      summary[op.status === "new" ? "new" : "changed"]++;
    } else {
      summary.skipped++;
    }
  }
  rl?.close();

  if (quit) console.log("\n중단됨 — 남은 변경은 반영하지 않았습니다.");
  return summary;
}

// ── 동기화 대상 정의 ───────────────────────────────────────────────────
const conventionsSource = join(here, "..", "docs", "conventions");
if (!existsSync(conventionsSource)) {
  console.error(
    `✗ Source conventions directory not found: ${conventionsSource}`,
  );
  process.exit(1);
}

const commandsSource = join(here, "..", "commands");
const skillsSource = join(here, "..", "skills");

// ── 외부 스킬 설치 ─────────────────────────────────────────────────────
//   Vercel 공식 불변 릴리스에서 필요한 스킬만 설치한다.
const vercelReactBestPracticesSource =
  "https://github.com/vercel-labs/agent-skills/tree/agent-skills-20e89cc4bb256eb7b1fcbdc68f7175284709a847/skills/react-best-practices";
const externalSkillMarker = ".agent-presets-source.json";

function hasCurrentExternalSkill(target) {
  const skillFile = join(target, "SKILL.md");
  const markerFile = join(target, externalSkillMarker);
  if (!existsSync(skillFile) || !existsSync(markerFile)) return false;

  try {
    const marker = JSON.parse(readFileSync(markerFile, "utf8"));
    return marker.source === vercelReactBestPracticesSource;
  } catch {
    return false;
  }
}

function syncVercelReactBestPractices() {
  if (!includeReactBestPractices) return;

  const agents = [
    ...(syncClaude ? ["claude-code"] : []),
    ...(syncCodex ? ["codex"] : []),
  ];
  if (!agents.length) return;

  const targets = [
    ...(syncClaude
      ? [join(projectRoot, ".claude", "skills", "vercel-react-best-practices")]
      : []),
    ...(syncCodex
      ? [join(projectRoot, ".agents", "skills", "vercel-react-best-practices")]
      : []),
  ];
  if (targets.every(hasCurrentExternalSkill)) {
    console.log("✓ Vercel React Best Practices 스킬이 이미 최신입니다.");
    return;
  }

  if (DRY) {
    console.log(
      `ℹ (--dry) Vercel React Best Practices 스킬을 ${agents.join(" + ")}에 설치합니다.`,
    );
    return;
  }

  let skillsPackagePath;
  try {
    skillsPackagePath = packageRequire.resolve("skills/package.json");
  } catch {
    console.error(
      "✗ skills CLI를 찾을 수 없습니다. @kyoungah/agent-presets 의존성을 다시 설치하세요.",
    );
    process.exit(1);
  }

  const skillsCli = join(dirname(skillsPackagePath), "bin", "cli.mjs");
  const result = spawnSync(
    process.execPath,
    [
      skillsCli,
      "add",
      vercelReactBestPracticesSource,
      "--skill",
      "vercel-react-best-practices",
      "--agent",
      ...agents,
      "--yes",
    ],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env, DISABLE_TELEMETRY: "1" },
    },
  );

  if (result.status !== 0) {
    console.error("✗ Vercel React Best Practices 스킬 설치에 실패했습니다.");
    process.exit(1);
  }

  const marker = `${JSON.stringify(
    {
      source: vercelReactBestPracticesSource,
      skill: "vercel-react-best-practices",
    },
    null,
    2,
  )}\n`;
  for (const target of targets) {
    if (!existsSync(join(target, "SKILL.md"))) {
      console.error(`✗ 설치된 스킬을 찾을 수 없습니다: ${relLabel(target)}`);
      process.exit(1);
    }
    writeFileSync(join(target, externalSkillMarker), marker);
  }
}

syncVercelReactBestPractices();

const plans = [
  {
    label: "docs/conventions → docs/conventions",
    ops: planArea(
      conventionsSource,
      join(projectRoot, "docs", "conventions"),
      isEnabledConventionFile,
    ),
  },
  ...(syncClaude
    ? [
        {
          label: "commands → .claude/commands",
          ops: planArea(
            commandsSource,
            join(projectRoot, ".claude", "commands"),
          ),
        },
      ]
    : []),
  ...(syncCodex
    ? [
        {
          label: "skills → .agents/skills",
          ops: planArea(skillsSource, join(projectRoot, ".agents", "skills")),
        },
      ]
    : []),
];

const summary = await runSync(plans);

function removeManagedCopy({ sourceFile, targetFile, removedLabel }) {
  if (!existsSync(sourceFile) || !existsSync(targetFile)) return 0;

  if (!readFileSync(targetFile).equals(readFileSync(sourceFile))) {
    console.warn(`⚠ 수정된 파일을 보존합니다: ${relLabel(targetFile)}`);
    return 0;
  }

  if (DRY) {
    console.log(`ℹ (--dry) ${removedLabel}: ${relLabel(targetFile)}`);
  } else {
    unlinkSync(targetFile);
    console.log(`✓ ${removedLabel}: ${relLabel(targetFile)}`);
  }
  return 1;
}

// ── 비활성 컨벤션 정리 ─────────────────────────────────────────────────
//   의존성이 제거된 뒤 남은 복사본도 프리셋 원문과 같을 때만 삭제한다.
function cleanupDisabledConventions() {
  let removed = 0;
  const disabledConventions = [
    ...(!includeReact ? ["react"] : []),
    ...(!includeNextjs ? ["next"] : []),
  ];

  for (const name of disabledConventions) {
    removed += removeManagedCopy({
      sourceFile: join(conventionsSource, `${name}.md`),
      targetFile: join(projectRoot, "docs", "conventions", `${name}.md`),
      removedLabel: "비활성 컨벤션 삭제",
    });
  }

  return removed;
}

const removedDisabledConventions = cleanupDisabledConventions();

// ── 1.0.0 마이그레이션: 기존 자동 로드 규칙 정리 ──────────────────────
//   프리셋 원문과 정확히 같은 파일만 삭제한다. 사용자가 수정한 파일은 보존한다.
function cleanupLegacyRules() {
  const agentDirs = [
    ...(syncClaude ? [join(projectRoot, ".claude", "rules")] : []),
    ...(syncCodex ? [join(projectRoot, ".codex", "rules")] : []),
  ];
  let removed = 0;

  for (const agentDir of agentDirs) {
    for (const name of ["typescript", "react", "next"]) {
      const legacyFile = join(agentDir, `${name}.md`);
      const conventionFile = join(conventionsSource, `${name}.md`);
      removed += removeManagedCopy({
        sourceFile: conventionFile,
        targetFile: legacyFile,
        removedLabel: "기존 규칙 삭제",
      });
    }
  }

  return removed;
}

const removedLegacyRules = cleanupLegacyRules();

// ── 에이전트 지침 관리 블록 주입 ──────────────────────────────────────────
// 컨벤션의 `paths:` 프론트매터(인라인 배열 형식)를 읽어 적용 범위를 문서화한다.
//   프론트매터가 없으면 항상 로드되는 규칙이다.
function readConventionPaths(name) {
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
}

function conventionScopeLabel(name) {
  const paths = readConventionPaths(name);
  if (!paths.length) return "항상";
  return paths.map((glob) => `\`${glob}\``).join(", ");
}

function createManagedBlock(agentName) {
  return [
    "<!-- agent-presets:start (자동 생성 — 이 블록은 직접 편집하지 마세요. `sync-agent-presets` 가 갱신합니다) -->",
    "",
    `## 공용 ${agentName} 지침 (@kyoungah/agent-presets)`,
    "",
    "코드 작업 전에 다음 공통 컨벤션을 순서대로 읽고 적용합니다.",
    "",
    ...enabledConventions.map(
      (name, index) =>
        `${index + 1}. \`docs/conventions/${name}.md\` (적용 범위: ${conventionScopeLabel(name)})`,
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
}

const claudeManagedBlock = createManagedBlock("Claude");
const codexManagedBlock = createManagedBlock("Codex");

const blockRegex =
  /<!-- (?:agent|claude|codex)-presets:start[\s\S]*?(?:agent|claude|codex)-presets:end -->/i;

function nextAgentDoc(current, title, managedBlock) {
  blockRegex.lastIndex = 0;
  if (current == null) return `# ${title}\n\n${managedBlock}\n`;
  blockRegex.lastIndex = 0;
  if (blockRegex.test(current))
    return current.replace(blockRegex, managedBlock);
  const sep = current.endsWith("\n") ? "\n" : "\n\n";
  return `${current}${sep}${managedBlock}\n`;
}

function syncAgentDoc({ path, title, managedBlock, legacyManualMarker }) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (
    current?.includes("agent-presets:manual") ||
    (legacyManualMarker && current?.includes(legacyManualMarker))
  ) {
    console.log(`ℹ ${path} 에 manual 마커가 있어 주입을 건너뜁니다.`);
    return;
  }

  const next = nextAgentDoc(current, title, managedBlock);
  if (next === current) return;
  if (DRY) {
    console.log(
      `\nℹ (--dry) ${title} 관리 블록이 ${current == null ? "생성" : "갱신"}됩니다. 쓰지 않음.`,
    );
  } else {
    writeFileSync(path, next);
    console.log(
      `✓ ${title} 관리 블록 ${current == null ? "생성" : "갱신"} (${path})`,
    );
  }
}

if (syncClaude) {
  syncAgentDoc({
    path: join(projectRoot, "CLAUDE.md"),
    title: "CLAUDE.md",
    managedBlock: claudeManagedBlock,
    legacyManualMarker: "claude-presets:manual",
  });
}

if (syncCodex) {
  syncAgentDoc({
    path: join(projectRoot, "AGENTS.md"),
    title: "AGENTS.md",
    managedBlock: codexManagedBlock,
    legacyManualMarker: "codex-presets:manual",
  });
}

// ── 최종 요약 ────────────────────────────────────────────────────────────
if (!DRY) {
  const parts = [
    `신규 ${summary.new}`,
    `변경 ${summary.changed}`,
    `동일 ${summary.same}`,
  ];
  if (removedDisabledConventions)
    parts.push(`비활성 컨벤션 삭제 ${removedDisabledConventions}`);
  if (removedLegacyRules) parts.push(`기존 규칙 삭제 ${removedLegacyRules}`);
  if (summary.skipped) parts.push(`건너뜀 ${summary.skipped}`);
  console.log(`\n✓ 동기화 완료 — ${parts.join(" · ")}`);
}
