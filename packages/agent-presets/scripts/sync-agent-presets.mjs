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
//   (기본)         덮어쓰기. 단 "바뀐 파일만" 쓰고 신규/변경 목록을 요약 출력.
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

function planArea(srcRoot, tgtRoot) {
  if (!existsSync(srcRoot)) return [];
  return walk(srcRoot).map((rel) => {
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
  {
    label: "rules → .claude/rules",
    ops: planArea(rulesSource, join(projectRoot, ".claude", "rules")),
  },
  {
    label: "commands → .claude/commands",
    ops: planArea(commandsSource, join(projectRoot, ".claude", "commands")),
  },
  {
    label: "rules → .codex/rules",
    ops: planArea(rulesSource, join(projectRoot, ".codex", "rules")),
  },
  {
    label: "skills → .agents/skills",
    ops: planArea(skillsSource, join(projectRoot, ".agents", "skills")),
  },
];

const summary = await runSync(plans);

// ── 에이전트 지침 관리 블록 주입 ──────────────────────────────────────────
const enabledRules = [
  ...(includeReact ? ["react"] : []),
  "typescript",
  ...(includeNextjs ? ["next"] : []),
];

const claudeManagedBlock = [
  "<!-- agent-presets:start (자동 생성 — 이 블록은 직접 편집하지 마세요. `sync-agent-presets` 가 갱신합니다) -->",
  "## 공용 Claude 규칙 (@kyoungah/agent-presets)",
  "",
  "`.claude/rules/` 규칙을 1차 기준으로 적용합니다. 갱신은 `sync-agent-presets` 재실행.",
  "",
  enabledRules.map((name) => `@.claude/rules/${name}.md`).join("\n"),
  "<!-- agent-presets:end -->",
].join("\n");

const codexManagedBlock = [
  "<!-- agent-presets:start (자동 생성 — 이 블록은 직접 편집하지 마세요. `sync-agent-presets` 가 갱신합니다) -->",
  "## 공용 Codex 규칙 (@kyoungah/agent-presets)",
  "",
  "코드 작업 전에 해당하는 `.codex/rules/` 문서를 읽고 1차 기준으로 적용합니다. 갱신은 `sync-agent-presets` 재실행.",
  "",
  ...enabledRules.map((name) => `- \`.codex/rules/${name}.md\``),
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

syncAgentDoc({
  path: join(projectRoot, "CLAUDE.md"),
  title: "CLAUDE.md",
  managedBlock: claudeManagedBlock,
  legacyManualMarker: "claude-presets:manual",
});

syncAgentDoc({
  path: join(projectRoot, "AGENTS.md"),
  title: "AGENTS.md",
  managedBlock: codexManagedBlock,
  legacyManualMarker: "codex-presets:manual",
});

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
