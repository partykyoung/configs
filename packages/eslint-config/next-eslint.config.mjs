import { defineConfig } from "eslint/config";
import reactEslintConfig from "./react-eslint.config.mjs";
import nextPlugin from "@next/eslint-plugin-next";

/** Next.js 라우팅 파일 (page, layout, loading, error 등) */
const nextRouteFiles = [
  "app/**/{page,layout,loading,error,not-found,template,default,global-error}.{jsx,tsx}",
  "src/app/**/{page,layout,loading,error,not-found,template,default,global-error}.{jsx,tsx}",
  "apps/**/app/**/{page,layout,loading,error,not-found,template,default,global-error}.{jsx,tsx}",
];

/** Route Handler 파일 */
const nextRouteHandlerFiles = [
  "app/**/route.{js,ts}",
  "src/app/**/route.{js,ts}",
  "apps/**/app/**/route.{js,ts}",
];

/** page / layout 파일만 (Server Component 유지 대상) */
const nextPageLayoutFiles = [
  "app/**/{page,layout}.{jsx,tsx}",
  "src/app/**/{page,layout}.{jsx,tsx}",
  "apps/**/app/**/{page,layout}.{jsx,tsx}",
];

const eslintConfig = defineConfig([
  ...reactEslintConfig,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  /* 라우팅 파일: default export 허용 (프레임워크 규약) */
  {
    files: [...nextRouteFiles, ...nextRouteHandlerFiles],
    rules: {
      "import/no-default-export": "off",
    },
  },
  /* page / layout: Server Component 유지 — "use client" 금지, 일반명 금지 */
  {
    files: nextPageLayoutFiles,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Program > ExpressionStatement > Literal[value='use client']",
          message:
            "page/layout은 Server Component로 유지하세요. 'use client'는 하위 컴포넌트로 이동합니다.",
        },
        {
          selector: "FunctionDeclaration[id.name='Page']",
          message:
            "page 함수명은 역할이 드러나는 이름을 사용하세요. (예: RecruitListPage)",
        },
        {
          selector: "FunctionDeclaration[id.name='Layout']",
          message:
            "layout 함수명은 역할이 드러나는 이름을 사용하세요. (예: RecruitLayout)",
        },
      ],
    },
  },
  /* 라우팅 파일: 일반명(Loading, Error 등) 금지 */
  {
    files: nextRouteFiles,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "FunctionDeclaration[id.name='Loading']",
          message:
            "loading 함수명은 역할이 드러나는 이름을 사용하세요. (예: RecruitListLoading)",
        },
        {
          selector: "FunctionDeclaration[id.name='Error']",
          message:
            "error 함수명은 역할이 드러나는 이름을 사용하세요. (예: RecruitListError)",
        },
        {
          selector: "FunctionDeclaration[id.name='NotFound']",
          message:
            "not-found 함수명은 역할이 드러나는 이름을 사용하세요. (예: RecruitNotFound)",
        },
        {
          selector: "FunctionDeclaration[id.name='Template']",
          message:
            "template 함수명은 역할이 드러나는 이름을 사용하세요. (예: RecruitTemplate)",
        },
      ],
    },
  },
  /* App Router: next/head 금지, document.title DOM 조작 금지 */
  {
    files: [
      "app/**/*.{js,jsx,ts,tsx}",
      "src/app/**/*.{js,jsx,ts,tsx}",
      "apps/**/app/**/*.{js,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/head",
              message:
                "App Router에서는 Next.js Metadata API를 사용하세요. (next/head는 Pages Router 전용)",
            },
          ],
          patterns: [
            {
              group: ["../../../*"],
              message:
                "상위 디렉토리 3단계 이상 접근 시 alias(@/...) 기반 절대경로를 사용하세요.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "document",
          property: "title",
          message:
            "document.title 직접 조작 금지. Next.js Metadata API를 사용하세요.",
        },
      ],
    },
  },
]);

export default eslintConfig;
