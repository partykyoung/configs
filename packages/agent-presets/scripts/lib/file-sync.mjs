import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

export const walk = (root) => {
  const files = [];
  const visit = (rel) => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const childRel = rel ? join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) visit(childRel);
      else if (entry.isFile()) files.push(childRel);
    }
  };
  visit("");
  return files;
};

const classify = (source, target) => {
  if (!existsSync(target)) return "new";
  try {
    if (statSync(source).size !== statSync(target).size) return "changed";
    return readFileSync(source).equals(readFileSync(target))
      ? "same"
      : "changed";
  } catch {
    return "changed";
  }
};

export const planArea = (sourceRoot, targetRoot, fileFilter) => {
  if (!existsSync(sourceRoot)) return [];
  const files = fileFilter
    ? walk(sourceRoot).filter(fileFilter)
    : walk(sourceRoot);
  return files.map((rel) => {
    const source = join(sourceRoot, rel);
    const target = join(targetRoot, rel);
    return {
      rel,
      source,
      target,
      status: classify(source, target),
    };
  });
};

const printDiff = (operation) => {
  const from = operation.status === "new" ? "/dev/null" : operation.target;
  const result = spawnSync(
    "git",
    ["--no-pager", "diff", "--no-index", "--", from, operation.source],
    { stdio: "inherit" },
  );
  if (result.error) console.log("   (git 없음 — diff 생략)");
};

const writeOperation = (operation) => {
  mkdirSync(dirname(operation.target), { recursive: true });
  copyFileSync(operation.source, operation.target);
};

export const runFileSync = async ({ plans, projectRoot, modes }) => {
  const relLabel = (path) => relative(projectRoot, path) || ".";
  const operations = plans.flatMap((plan) => plan.operations);
  const changed = operations.filter((operation) => operation.status !== "same");
  const summary = {
    new: 0,
    changed: 0,
    same: operations.length - changed.length,
    skipped: 0,
    pendingNew: changed.filter((operation) => operation.status === "new")
      .length,
    pendingChanged: changed.filter(
      (operation) => operation.status === "changed",
    ).length,
  };

  if (!changed.length) {
    if (!modes.check && !modes.doctor) {
      console.log("✓ 모든 프리셋 파일이 이미 최신입니다 (변경 없음).");
    }
    return summary;
  }

  if (modes.dry) {
    console.log(
      `\n=== 미리보기 (--dry): ${changed.length}개 파일이 바뀝니다. 쓰지 않음 ===`,
    );
    for (const operation of changed) {
      console.log(
        `\n### [${operation.status === "new" ? "신규" : "변경"}] ${relLabel(operation.target)}`,
      );
      printDiff(operation);
    }
    console.log(
      `\n요약: 신규 ${summary.pendingNew} · 변경 ${summary.pendingChanged} · 동일 ${summary.same}. 실제 반영하려면 --dry 없이 다시 실행하세요.`,
    );
    return summary;
  }

  if (modes.check || modes.doctor) return summary;

  let rl = null;
  let applyRest = false;
  let quit = false;
  if (modes.interactive) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n=== 대화형 동기화: 변경 ${changed.length}개 ===`);
  }

  for (const operation of changed) {
    let apply = true;
    if (modes.interactive && !applyRest && !quit) {
      console.log(
        `\n### [${operation.status === "new" ? "신규" : "변경"}] ${relLabel(operation.target)}`,
      );
      printDiff(operation);
      const answer = (
        await rl.question(
          "적용? [y]예 / [n]건너뜀 / [a]나머지 전체 / [q]중단: ",
        )
      )
        .trim()
        .toLowerCase();
      if (answer === "q") quit = true;
      else if (answer === "a") applyRest = true;
      else if (answer === "n" || answer === "no") apply = false;
    }
    if (quit) apply = false;

    if (apply) {
      writeOperation(operation);
      summary[operation.status === "new" ? "new" : "changed"]++;
    } else {
      summary.skipped++;
    }
  }
  rl?.close();

  if (quit) console.log("\n중단됨 — 남은 변경은 반영하지 않았습니다.");
  return summary;
};
