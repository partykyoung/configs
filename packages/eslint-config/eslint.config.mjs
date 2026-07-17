import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

import importPlugin from "eslint-plugin-import";
import checkFilePlugin from "eslint-plugin-check-file";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
  eslintConfigPrettier,
  {
    ignores: ["**/*.config.{js,mjs,cjs,ts,mts,cts}", "**/.*rc.{js,mjs,cjs}"],
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    plugins: { js, import: importPlugin, "check-file": checkFilePlugin },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
    rules: {
      /* console.log 금지 */
      "no-console": ["error", { allow: ["warn", "error"] }],

      /* debugger 금지 */
      "no-debugger": "error",

      /* any 금지 */
      "@typescript-eslint/no-explicit-any": "error",

      /* @ts-expect-error 사용, @ts-ignore 금지 */
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],

      /* 사용하지 않는 변수 금지 */
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",

      /* non-null assertion 금지 */
      "@typescript-eslint/no-non-null-assertion": "error",

      /* 함수 반환 타입 명시 */
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true, // 콜백 허용
          allowTypedFunctionExpressions: true, // 이미 타입이 있으면 허용
        },
      ],

      /* 변수는 타입 추론 선호 */
      "@typescript-eslint/no-inferrable-types": "warn",

      /* 객체 형태는 interface 기본. type은 유니온/유틸리티/튜플/함수 시그니처에만 */
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

      /* as 단언 최소화 — 객체 리터럴은 satisfies 사용 */
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "never",
        },
      ],

      /* Error 객체만 throw 허용 */
      "no-throw-literal": "error",

      /* === / !== 강제 */
      eqeqeq: ["error", "always"],

      /* if / else / loop 중괄호 필수 */
      curly: ["error", "all"],

      /* 화살표 함수 선호, 단 함수 선언식도 예외적으로 허용 (컨벤션 준수) */
      "func-style": ["warn", "expression", { allowArrowFunctions: true }],

      /* 콜백함수는 화살표 함수만 허용 */
      "prefer-arrow-callback": ["error", { allowNamedFunctions: false }],

      /* 화살표 함수 본문: 필요할 때만 중괄호 사용 */
      "arrow-body-style": ["error", "as-needed"],

      /* 네이밍 컨벤션 (Variable, Function, Class, Constant) */
      "@typescript-eslint/naming-convention": [
        "error",
        // 변수: camelCase
        {
          selector: "variable",
          format: ["camelCase"],
        },
        // const 변수: camelCase, UPPER_CASE, PascalCase (React.memo 등 컴포넌트 할당 허용)
        {
          selector: "variable",
          modifiers: ["const"],
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
        },
        // 함수: camelCase + PascalCase (React 컴포넌트는 PascalCase function 선언)
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        // 클래스: PascalCase
        {
          selector: "class",
          format: ["PascalCase"],
        },
        // 타입/인터페이스: PascalCase, I 접두사 및 Type 접미사 금지
        {
          selector: ["typeAlias", "interface"],
          format: ["PascalCase"],
          custom: {
            regex: "^(I[A-Z]|.*Type$)",
            match: false,
          },
        },
      ],

      /*  파일명: kebab-case */
      "check-file/filename-naming-convention": [
        "error",
        {
          "**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}": "KEBAB_CASE",
        },
      ],

      /* 폴더명: kebab-case */
      "check-file/folder-naming-convention": [
        "error",
        {
          "**/": "KEBAB_CASE",
        },
      ],

      /* 기본은 named export */
      "import/no-default-export": "error",

      /* 3단계 이상 상대경로 금지 */
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../../*"],
              message:
                "상위 디렉토리 3단계 이상 접근 시 alias(@/...) 기반 절대경로를 사용하세요.",
            },
          ],
        },
      ],

      /* import 순서: alias → 상대경로 */
      "import/order": [
        "error",
        {
          groups: [
            "builtin", // Node.js 내장 모듈
            "external", // npm 패키지 (절대경로)
            "internal", // 프로젝트 내부 절대경로 (alias 등)
            "parent", // 상위 디렉토리 상대경로 (../)
            "sibling", // 같은 디렉토리 상대경로 (./)
            "index", // 현재 디렉토리 index
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
