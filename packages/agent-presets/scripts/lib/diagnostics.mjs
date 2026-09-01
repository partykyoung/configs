import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { vercelReactBestPracticesRevision } from "./external-skills.mjs";

const externalSkillStatusLabel = (status) => {
  const labels = {
    current: "최신",
    missing: "없음",
    "missing-marker": "marker 없음",
    "invalid-marker": "marker 오류",
    outdated: "갱신 필요",
    modified: "로컬 수정 감지",
  };
  return labels[status] ?? status;
};

const getPendingDiagnostics = (context) => ({
  environment:
    context.packageStatus === "invalid"
      ? ["package.json을 파싱할 수 없어 의존성 감지가 불완전합니다."]
      : [],
  files: context.plans.flatMap((plan) =>
    plan.operations
      .filter((operation) => operation.status !== "same")
      .map((operation) => ({
        label: plan.label,
        path: operation.target,
        status: operation.status,
      })),
  ),
  agentDocs: context.agentDocResults.filter((result) =>
    ["new", "changed"].includes(result.status),
  ),
  cleanup: context.cleanupDiagnostics.filter(
    (diagnostic) => diagnostic.status === "pending",
  ),
  manifest:
    context.manifestSyncStatus === "current"
      ? []
      : [
          {
            path: context.manifestPath,
            status: context.manifestSyncStatus,
            error: context.manifestState.error,
          },
        ],
  externalSkills: context.externalSkillState.targets.filter(
    (target) => target.status !== "current",
  ),
});

const pendingCount = (diagnostics) =>
  diagnostics.environment.length +
  diagnostics.files.length +
  diagnostics.agentDocs.length +
  diagnostics.cleanup.length +
  diagnostics.manifest.length +
  diagnostics.externalSkills.length;

const printPendingDiagnostics = (diagnostics, projectRoot) => {
  const relLabel = (path) => relative(projectRoot, path) || ".";
  for (const message of diagnostics.environment) {
    console.log(`- [환경 오류] ${message}`);
  }
  for (const item of diagnostics.files) {
    console.log(
      `- [${item.status === "new" ? "신규" : "변경"}] ${relLabel(item.path)} (${item.label})`,
    );
  }
  for (const item of diagnostics.agentDocs) {
    console.log(
      `- [${item.status === "new" ? "신규" : "변경"}] ${relLabel(item.path)} 관리 블록`,
    );
  }
  for (const item of diagnostics.cleanup) {
    console.log(`- [삭제] ${relLabel(item.path)} (${item.label})`);
  }
  for (const item of diagnostics.manifest) {
    const labels = {
      missing: "생성 필요",
      outdated: "갱신 필요",
      invalid: "JSON 오류",
    };
    console.log(
      `- [manifest ${labels[item.status] ?? item.status}] ${relLabel(item.path)}${item.error ? ` (${item.error})` : ""}`,
    );
  }
  for (const item of diagnostics.externalSkills) {
    console.log(
      `- [외부 스킬 ${externalSkillStatusLabel(item.status)}] ${item.agent}: ${relLabel(item.path)}`,
    );
  }
};

const bundledSkillNames = (skillsSource) =>
  readdirSync(skillsSource, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(skillsSource, entry.name, "SKILL.md")),
    )
    .map((entry) => entry.name)
    .sort();

export const printDoctorReport = (context) => {
  const diagnostics = getPendingDiagnostics(context);
  const customized = context.cleanupDiagnostics.filter(
    (diagnostic) => diagnostic.status === "customized",
  );
  const packageStatusLabels = {
    valid: "정상",
    missing: "없음",
    invalid: "JSON 오류",
  };
  const manifestStatusLabels = {
    current: "최신",
    missing: "생성 필요",
    outdated: "갱신 필요",
    invalid: "JSON 오류",
  };

  console.log("\n=== Agent Presets Doctor ===");
  console.log(
    `프리셋: ${context.presetPackage.name}@${context.presetPackage.version}`,
  );
  console.log(`프로젝트: ${context.projectRoot}`);
  console.log(`대상 에이전트: ${context.selectedAgentLabel}`);
  console.log(`package.json: ${packageStatusLabels[context.packageStatus]}`);
  console.log(
    `감지 스택: TypeScript${context.includeReact ? " + React" : ""}${context.includeNextjs ? " + Next.js" : ""}`,
  );
  console.log(
    `적용 컨벤션: ${context.enabledConventions.map((name) => `${name}.md`).join(", ")}`,
  );
  console.log(
    `공용 스킬: ${bundledSkillNames(context.skillsSource).join(", ") || "없음"}`,
  );
  console.log(
    `프리셋 파일: 최신 ${context.summary.same} · 신규 필요 ${context.summary.pendingNew} · 변경 필요 ${context.summary.pendingChanged}`,
  );
  console.log(
    `생성 파일 manifest: ${manifestStatusLabels[context.manifestSyncStatus]}`,
  );

  for (const result of context.agentDocResults) {
    const labels = {
      same: "최신",
      new: "생성 필요",
      changed: "갱신 필요",
      manual: "manual 마커로 제외",
    };
    console.log(`${result.title}: ${labels[result.status]}`);
  }

  if (context.externalSkillState.required) {
    console.log("외부 스킬: vercel-react-best-practices");
    console.log(`  revision: ${vercelReactBestPracticesRevision}`);
    console.log(`  source: ${context.externalSkillState.source}`);
    for (const target of context.externalSkillState.targets) {
      console.log(
        `  ${target.agent}: ${externalSkillStatusLabel(target.status)}`,
      );
    }
  } else {
    console.log("외부 스킬: 해당 없음 (React/Next.js 미감지)");
  }

  if (customized.length) {
    console.log("보존된 사용자 수정 파일:");
    for (const item of customized) {
      console.log(
        `- ${relative(context.projectRoot, item.path) || "."} (${item.label})`,
      );
    }
  }

  const count = pendingCount(diagnostics);
  if (count) {
    console.log(`\n⚠ 동기화 필요: ${count}건`);
    printPendingDiagnostics(diagnostics, context.projectRoot);
  } else {
    console.log("\n✓ 프리셋 상태가 정상입니다.");
  }
};

export const printCheckResult = (context) => {
  const diagnostics = getPendingDiagnostics(context);
  const count = pendingCount(diagnostics);
  console.log("\n=== Agent Presets Check ===");
  if (!count) {
    console.log("✓ 모든 프리셋 파일이 최신입니다.");
    return true;
  }

  console.log(`✗ 동기화가 필요한 항목이 ${count}건 있습니다.`);
  printPendingDiagnostics(diagnostics, context.projectRoot);
  console.log("\n`sync-agent-presets`를 실행해 갱신하세요.");
  return false;
};
