import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { hashFile, projectPath, relativeProjectPath } from "../manifest.mjs";
import { walk } from "./file-sync.mjs";

export const vercelReactBestPracticesSource =
  "https://github.com/vercel-labs/agent-skills/tree/agent-skills-20e89cc4bb256eb7b1fcbdc68f7175284709a847/skills/react-best-practices";
export const vercelReactBestPracticesRevision =
  vercelReactBestPracticesSource.match(/\/tree\/([^/]+)\//)?.[1] ?? "unknown";

const externalSkillMarker = ".agent-presets-source.json";
const packageRequire = createRequire(import.meta.url);

const previousExternalSkillFiles = ({ target, projectRoot, previousFiles }) => {
  const prefix = `${relativeProjectPath(projectRoot, target.path)}/`;
  return previousFiles.filter(
    (entry) =>
      entry.group === target.group &&
      entry.kind === "external-skill" &&
      entry.path.startsWith(prefix),
  );
};

const inspectExternalSkill = ({ target, projectRoot, previousFiles }) => {
  const skillFile = join(target.path, "SKILL.md");
  const markerFile = join(target.path, externalSkillMarker);
  if (!existsSync(skillFile)) return "missing";
  if (!existsSync(markerFile)) return "missing-marker";

  try {
    const marker = JSON.parse(readFileSync(markerFile, "utf8"));
    if (marker.source !== vercelReactBestPracticesSource) return "outdated";

    const previousEntries = previousExternalSkillFiles({
      target,
      projectRoot,
      previousFiles,
    });
    const modified = previousEntries.some((entry) => {
      const path = projectPath(projectRoot, entry.path);
      return !existsSync(path) || hashFile(path) !== entry.sha256;
    });
    return modified ? "modified" : "current";
  } catch {
    return "invalid-marker";
  }
};

const createTargets = ({ projectRoot, syncClaude, syncCodex }) => [
  ...(syncClaude
    ? [
        {
          agent: "Claude",
          group: "claude",
          path: join(
            projectRoot,
            ".claude",
            "skills",
            "vercel-react-best-practices",
          ),
        },
      ]
    : []),
  ...(syncCodex
    ? [
        {
          agent: "Codex",
          group: "codex",
          path: join(
            projectRoot,
            ".agents",
            "skills",
            "vercel-react-best-practices",
          ),
        },
      ]
    : []),
];

export const syncVercelReactBestPractices = ({
  projectRoot,
  syncClaude,
  syncCodex,
  required,
  previousFiles,
  modes,
}) => {
  if (!required) {
    return {
      required: false,
      source: vercelReactBestPracticesSource,
      refreshed: false,
      targets: [],
    };
  }

  const agents = [
    ...(syncClaude ? ["claude-code"] : []),
    ...(syncCodex ? ["codex"] : []),
  ];
  const targets = createTargets({ projectRoot, syncClaude, syncCodex });
  const createState = () => ({
    required: true,
    source: vercelReactBestPracticesSource,
    refreshed: false,
    targets: targets.map((target) => ({
      ...target,
      status: inspectExternalSkill({ target, projectRoot, previousFiles }),
    })),
  });

  const initialState = createState();
  if (!agents.length) return initialState;
  if (initialState.targets.every((target) => target.status === "current")) {
    if (!modes.check && !modes.doctor) {
      console.log("✓ Vercel React Best Practices 스킬이 이미 최신입니다.");
    }
    return initialState;
  }

  if (modes.readOnly) {
    if (modes.dry) {
      console.log(
        `ℹ (--dry) Vercel React Best Practices 스킬을 ${agents.join(" + ")}에 설치합니다.`,
      );
    }
    return initialState;
  }

  let skillsPackagePath;
  try {
    skillsPackagePath = packageRequire.resolve("skills/package.json");
  } catch {
    throw new Error(
      "skills CLI를 찾을 수 없습니다. @kyoungah/agent-presets 의존성을 다시 설치하세요.",
    );
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
    throw new Error("Vercel React Best Practices 스킬 설치에 실패했습니다.");
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
    if (!existsSync(join(target.path, "SKILL.md"))) {
      throw new Error(`설치된 스킬을 찾을 수 없습니다: ${target.path}`);
    }
    writeFileSync(join(target.path, externalSkillMarker), marker);
  }

  return {
    ...createState(),
    refreshed: true,
    targets: targets.map((target) => ({ ...target, status: "current" })),
  };
};

export const createExternalDesiredFiles = ({
  externalSkillState,
  previousFiles,
  projectRoot,
}) =>
  externalSkillState.targets.flatMap((target) => {
    const previousEntries = previousExternalSkillFiles({
      target,
      projectRoot,
      previousFiles,
    });
    if (
      !externalSkillState.refreshed &&
      previousEntries.length &&
      previousEntries.every((entry) =>
        entry.source.startsWith(`${vercelReactBestPracticesSource}#`),
      )
    ) {
      return previousEntries;
    }
    if (!existsSync(target.path)) return previousEntries;

    return walk(target.path).map((rel) => {
      const path = join(target.path, rel);
      return {
        path: relativeProjectPath(projectRoot, path),
        source: `${vercelReactBestPracticesSource}#${rel.split("\\").join("/")}`,
        sha256: hashFile(path),
        group: target.group,
        kind: "external-skill",
      };
    });
  });
