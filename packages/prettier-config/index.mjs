/** @type {import("prettier").Config} */
const config = {
  printWidth: 100, // 한 줄 최대 길이
  tabWidth: 2, // 들여쓰기 칸 수
  useTabs: false, // 탭 대신 스페이스
  semi: true, // 세미콜론 사용
  singleQuote: true, // 문자열에 작은따옴표
  jsxSingleQuote: true, // JSX 속성에 작은따옴표
  trailingComma: "all", // 후행 쉼표 항상 사용
  bracketSpacing: true, // 객체 리터럴 중괄호 내 공백 ({ a: 1 })
  bracketSameLine: false, // JSX 닫는 괄호를 새 줄에 배치
  arrowParens: "always", // 화살표 함수 매개변수 괄호 항상 사용
  endOfLine: "lf", // 줄바꿈 문자 LF 통일
};

export default config;
