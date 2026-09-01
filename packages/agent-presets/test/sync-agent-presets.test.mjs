import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { vercelReactBestPracticesSource } from "../scripts/lib/external-skills.mjs";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const syncScript = join(packageRoot, "scripts", "sync-agent-presets.mjs");
const conventionsSource = join(packageRoot, "docs", "conventions");

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const createFixture = (t, packageJson = {}) => {
  const root = mkdtempSync(join(tmpdir(), "agent-presets-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeJson(join(root, "package.json"), {
    name: "agent-presets-fixture",
    private: true,
    ...packageJson,
  });
  return root;
};

const runSync = (root, ...args) =>
  spawnSync(process.execPath, [syncScript, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });

const output = (result) => `${result.stdout}\n${result.stderr}`;

test("legacy 파일을 안전하게 정리하고 agent별 manifest 항목을 유지한다", (t) => {
  const root = createFixture(t);
  const conventionsTarget = join(root, "docs", "conventions");
  mkdirSync(conventionsTarget, { recursive: true });
  copyFileSync(
    join(conventionsSource, "react.md"),
    join(conventionsTarget, "react.md"),
  );
  writeFileSync(
    join(conventionsTarget, "next.md"),
    "사용자가 수정한 next 컨벤션\n",
  );

  const firstSync = runSync(root, "--agent", "all");
  assert.equal(firstSync.status, 0, output(firstSync));
  assert.equal(existsSync(join(conventionsTarget, "react.md")), false);
  assert.equal(existsSync(join(conventionsTarget, "next.md")), true);

  const manifestPath = join(root, ".agent-presets", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(
    manifest.files.some((entry) => entry.group === "claude"),
    true,
  );
  assert.equal(
    manifest.files.some((entry) => entry.group === "codex"),
    true,
  );

  const claudeSync = runSync(root, "--agent", "claude");
  assert.equal(claudeSync.status, 0, output(claudeSync));
  const afterClaude = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(
    afterClaude.files.some((entry) => entry.group === "codex"),
    true,
  );

  const check = runSync(root, "--check", "--agent", "all");
  assert.equal(check.status, 0, output(check));
});

test("손상된 manifest를 자동으로 덮어쓰지 않는다", (t) => {
  const root = createFixture(t);
  const initialSync = runSync(root, "--agent", "all");
  assert.equal(initialSync.status, 0, output(initialSync));

  const manifestPath = join(root, ".agent-presets", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeJson(manifestPath, { ...manifest, schemaVersion: 999 });

  const check = runSync(root, "--check", "--agent", "all");
  assert.equal(check.status, 1, output(check));
  assert.match(output(check), /manifest JSON 오류/);

  const sync = runSync(root, "--agent", "all");
  assert.equal(sync.status, 1, output(sync));
  assert.equal(
    JSON.parse(readFileSync(manifestPath, "utf8")).schemaVersion,
    999,
  );
});

test("외부 스킬 폐기 시 수정 파일은 보존하고 원본 파일만 제거한다", (t) => {
  const root = createFixture(t, { dependencies: { react: "19.0.0" } });
  const skillRoot = join(
    root,
    ".agents",
    "skills",
    "vercel-react-best-practices",
  );
  mkdirSync(skillRoot, { recursive: true });
  writeFileSync(join(skillRoot, "SKILL.md"), "# External skill\n");
  writeJson(join(skillRoot, ".agent-presets-source.json"), {
    source: vercelReactBestPracticesSource,
    skill: "vercel-react-best-practices",
  });

  const initialSync = runSync(root, "--agent", "codex");
  assert.equal(initialSync.status, 0, output(initialSync));
  const initialManifest = JSON.parse(
    readFileSync(join(root, ".agent-presets", "manifest.json"), "utf8"),
  );
  assert.equal(
    initialManifest.files.filter((entry) => entry.kind === "external-skill")
      .length,
    2,
  );

  writeJson(join(root, "package.json"), {
    name: "agent-presets-fixture",
    private: true,
  });
  writeFileSync(join(skillRoot, "SKILL.md"), "# User-customized skill\n");

  const cleanup = runSync(root, "--agent", "codex");
  assert.equal(cleanup.status, 0, output(cleanup));
  assert.equal(existsSync(join(skillRoot, "SKILL.md")), true);
  assert.equal(
    existsSync(join(skillRoot, ".agent-presets-source.json")),
    false,
  );

  const manifest = JSON.parse(
    readFileSync(join(root, ".agent-presets", "manifest.json"), "utf8"),
  );
  assert.equal(
    manifest.files.some((entry) => entry.kind === "external-skill"),
    false,
  );
});
