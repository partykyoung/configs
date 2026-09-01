import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative } from "node:path";
import {
  ensureSafeManifestEntries,
  hashFile,
  projectPath,
  readManifest,
  readMigration,
  relativeProjectPath,
  serializeManifest,
} from "../manifest.mjs";

export const loadManifestContext = ({
  projectRoot,
  manifestPath,
  migrationPath,
  readOnly,
}) => {
  const state = readManifest(manifestPath);
  if (state.status === "valid") {
    try {
      ensureSafeManifestEntries(projectRoot, [
        ...state.manifest.files,
        ...state.manifest.blocks,
      ]);
    } catch (error) {
      state.status = "invalid";
      state.manifest = null;
      state.error = error instanceof Error ? error.message : String(error);
    }
  }

  if (state.status === "invalid" && !readOnly) {
    throw new Error(
      `${relative(projectRoot, manifestPath)}을 읽을 수 없습니다: ${state.error}\n  파일을 복구하거나 삭제한 뒤 다시 실행하세요.`,
    );
  }

  const migrationFiles =
    state.status === "missing" ? readMigration(migrationPath) : [];
  const previousFiles = state.manifest?.files ?? migrationFiles;
  const previousBlocks = state.manifest?.blocks ?? [];
  ensureSafeManifestEntries(projectRoot, [...previousFiles, ...previousBlocks]);
  return { state, previousFiles, previousBlocks };
};

export const createCopiedDesiredFiles = ({ plans, projectRoot, packageRoot }) =>
  plans.flatMap((plan) =>
    plan.operations.map((operation) => ({
      path: relativeProjectPath(projectRoot, operation.target),
      source: relativeProjectPath(packageRoot, operation.source),
      sha256: hashFile(operation.source),
      group: plan.group,
      kind: "copy",
    })),
  );

export const cleanupRetiredFiles = ({
  previousFiles,
  desiredFiles,
  managedGroups,
  projectRoot,
  modes,
}) => {
  const diagnostics = [];
  const desiredPaths = new Set(desiredFiles.map((entry) => entry.path));
  const relLabel = (path) => relative(projectRoot, path) || ".";
  let removed = 0;

  for (const entry of previousFiles) {
    if (!managedGroups.has(entry.group) || desiredPaths.has(entry.path)) {
      continue;
    }

    const target = projectPath(projectRoot, entry.path);
    if (!existsSync(target)) continue;
    if (hashFile(target) !== entry.sha256) {
      diagnostics.push({
        label: "폐기된 관리 파일 보존",
        path: target,
        status: "customized",
      });
      if (!modes.check && !modes.doctor) {
        console.warn(`⚠ 수정된 파일을 보존합니다: ${relLabel(target)}`);
      }
      continue;
    }

    if (modes.readOnly) {
      diagnostics.push({
        label: "폐기된 관리 파일 삭제",
        path: target,
        status: "pending",
      });
      if (modes.dry) {
        console.log(`ℹ (--dry) 폐기된 관리 파일 삭제: ${relLabel(target)}`);
      }
    } else {
      unlinkSync(target);
      diagnostics.push({
        label: "폐기된 관리 파일 삭제",
        path: target,
        status: "removed",
      });
      console.log(`✓ 폐기된 관리 파일 삭제: ${relLabel(target)}`);
    }
    removed++;
  }

  return { removed, diagnostics };
};

const entriesOutsideManagedGroups = (entries, managedGroups) =>
  entries.filter((entry) => !managedGroups.has(entry.group));

const currentManagedFileEntries = ({
  desiredFiles,
  previousFiles,
  projectRoot,
  readOnly,
}) => {
  if (readOnly) return desiredFiles;

  return desiredFiles.flatMap((entry) => {
    const target = projectPath(projectRoot, entry.path);
    if (existsSync(target) && hashFile(target) === entry.sha256) return [entry];

    const previous = previousFiles.find(
      (candidate) => candidate.path === entry.path,
    );
    return previous && existsSync(target) ? [previous] : [];
  });
};

export const syncManagedManifest = ({
  manifestPath,
  manifestState,
  previousFiles,
  previousBlocks,
  managedGroups,
  desiredFiles,
  desiredBlocks,
  presetPackage,
  projectRoot,
  readOnly,
}) => {
  const nextManifest = {
    preset: {
      name: presetPackage.name,
      version: presetPackage.version,
    },
    files: [
      ...entriesOutsideManagedGroups(previousFiles, managedGroups),
      ...currentManagedFileEntries({
        desiredFiles,
        previousFiles,
        projectRoot,
        readOnly,
      }),
    ],
    blocks: [
      ...entriesOutsideManagedGroups(previousBlocks, managedGroups),
      ...desiredBlocks,
    ],
  };
  const nextContent = serializeManifest(nextManifest);
  const currentContent =
    manifestState.status === "valid"
      ? readFileSync(manifestPath, "utf8")
      : null;
  const status =
    manifestState.status === "invalid"
      ? "invalid"
      : currentContent === nextContent
        ? "current"
        : manifestState.status === "missing"
          ? "missing"
          : "outdated";

  if (!readOnly && status !== "current") {
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, nextContent);
    console.log(
      `✓ 생성 파일 manifest ${status === "missing" ? "생성" : "갱신"}: ${relative(projectRoot, manifestPath)}`,
    );
  }

  return { status, nextManifest };
};
