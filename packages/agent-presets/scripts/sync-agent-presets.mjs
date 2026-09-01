#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncAgentDocs } from "./lib/agent-docs.mjs";
import { parseCliOptions, selectAgents } from "./lib/cli.mjs";
import { printCheckResult, printDoctorReport } from "./lib/diagnostics.mjs";
import {
  createExternalDesiredFiles,
  syncVercelReactBestPractices,
} from "./lib/external-skills.mjs";
import { planArea, runFileSync } from "./lib/file-sync.mjs";
import {
  cleanupRetiredFiles,
  createCopiedDesiredFiles,
  loadManifestContext,
  syncManagedManifest,
} from "./lib/managed-files.mjs";
import { findProjectRoot, inspectConsumerProject } from "./lib/project.mjs";

const fail = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✗ ${message}`);
  process.exit(1);
};

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const presetPackage = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);

let modes;
try {
  modes = parseCliOptions(process.argv.slice(2));
} catch (error) {
  fail(error);
}

const projectRoot = findProjectRoot();
const manifestPath = join(projectRoot, ".agent-presets", "manifest.json");
let manifestContext;
try {
  manifestContext = loadManifestContext({
    projectRoot,
    manifestPath,
    migrationPath: join(packageRoot, "migrations", "legacy-managed-files.json"),
    readOnly: modes.readOnly,
  });
} catch (error) {
  fail(error);
}

let selectedAgents;
try {
  selectedAgents = await selectAgents(modes);
} catch (error) {
  fail(error);
}

const syncClaude = selectedAgents.has("claude");
const syncCodex = selectedAgents.has("codex");
const selectedAgentLabel = [
  ...(syncClaude ? ["Claude"] : []),
  ...(syncCodex ? ["Codex"] : []),
].join(" + ");
console.log(`ℹ 동기화 대상: ${selectedAgentLabel}`);

const managedGroups = new Set([
  "common",
  ...(syncClaude ? ["claude"] : []),
  ...(syncCodex ? ["codex"] : []),
]);
const consumer = inspectConsumerProject(projectRoot);
if (consumer.includeReact) {
  console.log("ℹ react 의존성 감지 — react 규칙을 에이전트 지침에 포함합니다.");
}
if (consumer.includeNextjs) {
  console.log("ℹ next 의존성 감지 — next 규칙을 에이전트 지침에 포함합니다.");
}

const enabledConventions = [
  "typescript",
  ...(consumer.includeReact ? ["react"] : []),
  ...(consumer.includeNextjs ? ["next"] : []),
];
const includeReactBestPractices =
  consumer.includeReact || consumer.includeNextjs;
const conventionsSource = join(packageRoot, "docs", "conventions");
const skillsSource = join(packageRoot, "skills");
if (!existsSync(conventionsSource)) {
  fail(`Source conventions directory not found: ${conventionsSource}`);
}

const conditionalConventionFiles = {
  "react.md": consumer.includeReact,
  "next.md": consumer.includeNextjs,
};
const isEnabledConventionFile = (rel) =>
  conditionalConventionFiles[rel] ?? true;

let externalSkillState;
try {
  externalSkillState = syncVercelReactBestPractices({
    projectRoot,
    syncClaude,
    syncCodex,
    required: includeReactBestPractices,
    previousFiles: manifestContext.previousFiles,
    modes,
  });
} catch (error) {
  fail(error);
}

const plans = [
  {
    group: "common",
    label: "docs/conventions → docs/conventions",
    operations: planArea(
      conventionsSource,
      join(projectRoot, "docs", "conventions"),
      isEnabledConventionFile,
    ),
  },
  ...(syncClaude
    ? [
        {
          group: "claude",
          label: "skills → .claude/skills",
          operations: planArea(
            skillsSource,
            join(projectRoot, ".claude", "skills"),
          ),
        },
      ]
    : []),
  ...(syncCodex
    ? [
        {
          group: "codex",
          label: "skills → .agents/skills",
          operations: planArea(
            skillsSource,
            join(projectRoot, ".agents", "skills"),
          ),
        },
      ]
    : []),
];
const summary = await runFileSync({ plans, projectRoot, modes });

const copiedDesiredFiles = createCopiedDesiredFiles({
  plans,
  projectRoot,
  packageRoot,
});
const externalDesiredFiles = createExternalDesiredFiles({
  externalSkillState,
  previousFiles: manifestContext.previousFiles,
  projectRoot,
});
const desiredFiles = [...copiedDesiredFiles, ...externalDesiredFiles];
const cleanup = cleanupRetiredFiles({
  previousFiles: manifestContext.previousFiles,
  desiredFiles,
  managedGroups,
  projectRoot,
  modes,
});

const agentDocs = syncAgentDocs({
  projectRoot,
  conventionsSource,
  enabledConventions,
  includeReactBestPractices,
  syncClaude,
  syncCodex,
  modes,
});
const manifestSync = syncManagedManifest({
  manifestPath,
  manifestState: manifestContext.state,
  previousFiles: manifestContext.previousFiles,
  previousBlocks: manifestContext.previousBlocks,
  managedGroups,
  desiredFiles,
  desiredBlocks: agentDocs.desiredBlocks,
  presetPackage,
  projectRoot,
  readOnly: modes.readOnly,
});

const diagnosticContext = {
  packageStatus: consumer.packageStatus,
  plans,
  agentDocResults: agentDocs.results,
  cleanupDiagnostics: cleanup.diagnostics,
  manifestSyncStatus: manifestSync.status,
  manifestPath,
  manifestState: manifestContext.state,
  externalSkillState,
  presetPackage,
  projectRoot,
  selectedAgentLabel,
  includeReact: consumer.includeReact,
  includeNextjs: consumer.includeNextjs,
  enabledConventions,
  skillsSource,
  summary,
};

if (modes.doctor) {
  printDoctorReport(diagnosticContext);
} else if (modes.check) {
  if (!printCheckResult(diagnosticContext)) process.exitCode = 1;
} else if (!modes.dry) {
  const parts = [
    `신규 ${summary.new}`,
    `변경 ${summary.changed}`,
    `동일 ${summary.same}`,
  ];
  if (cleanup.removed) {
    parts.push(`폐기된 관리 파일 삭제 ${cleanup.removed}`);
  }
  if (summary.skipped) parts.push(`건너뜀 ${summary.skipped}`);
  console.log(`\n✓ 동기화 완료 — ${parts.join(" · ")}`);
}
