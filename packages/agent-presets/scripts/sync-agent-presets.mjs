#!/usr/bin/env node
import {
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  copyFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const here = dirname(fileURLToPath(import.meta.url));

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

// ── 조건부 규칙 ────────────────────────────────────────────────────────
//   Claude Code 는 `.claude/rules/*.md` 를 CLAUDE.md 와 함께 자동 로드한다.
//   무관한 규칙 파일이 남아 있으면 그대로 컨텍스트에 실리므로,
//   해당 의존성이 없으면 파일 자체를 복사하지 않는다.
const conditionalRuleFiles = {
  "react.md": includeReact,
  "next.md": includeNextjs,
};
const isEnabledRuleFile = (rel) => conditionalRuleFiles[rel] ?? true;

const enabledRules = [
  ...(includeReact ? ["react"] : []),
  "typescript",
  ...(includeNextjs ? ["next"] : []),
];

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
const rulesSource = join(here, "..", "rules");
if (!existsSync(rulesSource)) {
  console.error(`✗ Source rules directory not found: ${rulesSource}`);
  process.exit(1);
}

const commandsSource = join(here, "..", "commands");
const skillsSource = join(here, "..", "skills");

const plans = [
  ...(syncClaude
    ? [
        {
          label: "rules → .claude/rules",
          ops: planArea(
            rulesSource,
            join(projectRoot, ".claude", "rules"),
            isEnabledRuleFile,
          ),
        },
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
          label: "rules → .codex/rules",
          ops: planArea(
            rulesSource,
            join(projectRoot, ".codex", "rules"),
            isEnabledRuleFile,
          ),
        },
        {
          label: "skills → .agents/skills",
          ops: planArea(skillsSource, join(projectRoot, ".agents", "skills")),
        },
      ]
    : []),
];

const summary = await runSync(plans);

// ── 에이전트 지침 관리 블록 주입 ──────────────────────────────────────────
// 규칙 파일의 `paths:` 프론트매터(인라인 배열 형식)를 읽어 적용 범위를 문서화한다.
//   프론트매터가 없으면 항상 로드되는 규칙이다.
function readRulePaths(name) {
  const file = join(rulesSource, `${name}.md`);
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

function ruleScopeLabel(name) {
  const paths = readRulePaths(name);
  if (!paths.length) return "항상";
  return paths.map((glob) => `\`${glob}\``).join(", ");
}

const claudeManagedBlock = [
  "<!-- agent-presets:start (자동 생성 — 이 블록은 직접 편집하지 마세요. `sync-agent-presets` 가 갱신합니다) -->",
  "## 공용 Claude 규칙 (@kyoungah/agent-presets)",
  "",
  "`.claude/rules/*.md` 는 Claude Code 가 자동 로드합니다. 해당 규칙을 1차 기준으로 적용하세요. 갱신은 `sync-agent-presets` 재실행.",
  "",
  ...enabledRules.map(
    (name) =>
      `- \`.claude/rules/${name}.md\` (적용 범위: ${ruleScopeLabel(name)})`,
  ),
  "<!-- agent-presets:end -->",
].join("\n");

const codexManagedBlock = [
  "<!-- agent-presets:start (자동 생성 — 이 블록은 직접 편집하지 마세요. `sync-agent-presets` 가 갱신합니다) -->",
  "## 공용 Codex 규칙 (@kyoungah/agent-presets)",
  "",
  "코드 작업 전에 해당하는 `.codex/rules/` 문서를 읽고 1차 기준으로 적용합니다. 갱신은 `sync-agent-presets` 재실행.",
  "",
  ...enabledRules.map(
    (name) =>
      `- \`.codex/rules/${name}.md\` (적용 범위: ${ruleScopeLabel(name)})`,
  ),
  "<!-- agent-presets:end -->",
].join("\n");

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
  if (summary.skipped) parts.push(`건너뜀 ${summary.skipped}`);
  console.log(`\n✓ 동기화 완료 — ${parts.join(" · ")}`);
}
