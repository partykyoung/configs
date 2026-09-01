import { createInterface } from "node:readline/promises";

const parseAgentSelection = (value) => {
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
};

const getAgentArg = (argv) => {
  const inlineArg = argv.find((arg) => arg.startsWith("--agent="));
  if (inlineArg) return inlineArg.slice("--agent=".length).toLowerCase();

  const argIndex = argv.indexOf("--agent");
  if (argIndex === -1) return null;
  return argv[argIndex + 1]?.toLowerCase() ?? "";
};

export const parseCliOptions = (argv) => {
  const dry = argv.includes("--dry") || argv.includes("--preview");
  const check = argv.includes("--check");
  const doctor = argv.includes("--doctor");
  const readOnly = dry || check || doctor;

  if ([dry, check, doctor].filter(Boolean).length > 1) {
    throw new Error("--dry, --check, --doctor 는 함께 사용할 수 없습니다.");
  }

  let interactive = argv.includes("--interactive") || argv.includes("-i");
  if (readOnly && interactive) {
    throw new Error(
      "read-only 모드와 --interactive 는 함께 사용할 수 없습니다.",
    );
  }
  if (interactive && !process.stdin.isTTY) {
    console.warn(
      "⚠ --interactive 는 TTY 가 필요합니다 (비대화형 환경). 기본 덮어쓰기로 진행합니다.",
    );
    interactive = false;
  }

  return { argv, dry, check, doctor, readOnly, interactive };
};

export const selectAgents = async ({ argv }) => {
  const agentArg = getAgentArg(argv);
  if (agentArg != null) {
    const selection = parseAgentSelection(agentArg);
    if (selection) return selection;
    throw new Error(
      `잘못된 --agent 값입니다: ${agentArg || "(없음)"}. claude와 codex를 쉼표로 구분해 선택하세요.`,
    );
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
  throw new Error(
    `잘못된 선택입니다: ${answer || "(없음)"}. claude와 codex를 쉼표로 구분해 선택하세요.`,
  );
};
