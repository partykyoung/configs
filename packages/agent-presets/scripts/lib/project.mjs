import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const findProjectRoot = (cwd = process.cwd()) => {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : cwd;
};

export const inspectConsumerProject = (projectRoot) => {
  const packagePath = join(projectRoot, "package.json");
  if (!existsSync(packagePath)) {
    return {
      packageStatus: "missing",
      dependencies: {},
      includeReact: false,
      includeNextjs: false,
    };
  }

  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    const dependencies = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    };
    const names = Object.keys(dependencies);
    return {
      packageStatus: "valid",
      dependencies,
      includeReact: names.includes("react"),
      includeNextjs: names.includes("next"),
    };
  } catch {
    return {
      packageStatus: "invalid",
      dependencies: {},
      includeReact: false,
      includeNextjs: false,
    };
  }
};
