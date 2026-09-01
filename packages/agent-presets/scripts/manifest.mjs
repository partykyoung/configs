import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export const manifestSchemaVersion = 1;

export function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function hashFile(path) {
  return hashContent(readFileSync(path));
}

export function projectPath(projectRoot, path) {
  const root = resolve(projectRoot);
  const target = resolve(root, path);
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error(`프로젝트 밖의 경로는 관리할 수 없습니다: ${path}`);
  }
  return target;
}

export function relativeProjectPath(projectRoot, path) {
  return relative(projectRoot, path).split(sep).join("/");
}

function isString(value) {
  return typeof value === "string" && value.length > 0;
}

function validEntry(entry, fields) {
  return (
    entry != null &&
    typeof entry === "object" &&
    fields.every((field) => isString(entry[field]))
  );
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== manifestSchemaVersion) {
    throw new Error(
      `지원하지 않는 schemaVersion입니다: ${manifest?.schemaVersion ?? "없음"}`,
    );
  }
  if (
    !isString(manifest.preset?.name) ||
    !isString(manifest.preset?.version) ||
    !Array.isArray(manifest.files) ||
    !Array.isArray(manifest.blocks)
  ) {
    throw new Error("필수 필드가 없거나 형식이 올바르지 않습니다.");
  }
  if (
    !manifest.files.every((entry) =>
      validEntry(entry, ["path", "source", "sha256", "group", "kind"]),
    ) ||
    !manifest.blocks.every((entry) =>
      validEntry(entry, ["path", "id", "sha256", "group"]),
    )
  ) {
    throw new Error("관리 항목 형식이 올바르지 않습니다.");
  }
  return manifest;
}

export function readManifest(path) {
  if (!existsSync(path)) return { status: "missing", manifest: null };
  try {
    return {
      status: "valid",
      manifest: validateManifest(JSON.parse(readFileSync(path, "utf8"))),
    };
  } catch (error) {
    return {
      status: "invalid",
      manifest: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function sortedEntries(entries, keys) {
  return [...entries].sort((a, b) => {
    for (const key of keys) {
      const compared = a[key].localeCompare(b[key]);
      if (compared !== 0) return compared;
    }
    return 0;
  });
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(
    {
      schemaVersion: manifestSchemaVersion,
      preset: manifest.preset,
      files: sortedEntries(manifest.files, ["path", "group"]),
      blocks: sortedEntries(manifest.blocks, ["path", "id"]),
    },
    null,
    2,
  )}\n`;
}

export function ensureSafeManifestEntries(projectRoot, entries) {
  for (const entry of entries) projectPath(projectRoot, entry.path);
}

export function readMigration(path) {
  const migration = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(migration.files)) {
    throw new Error(`migration 파일 형식이 올바르지 않습니다: ${path}`);
  }
  return migration.files;
}
