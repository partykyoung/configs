# ESLint 규칙 ↔ Claude Presets 매핑

이 문서는 `@kyoungah/eslint-config`의 ESLint 규칙이 `@kyoungah/claude-presets`의 어떤 가이드라인에서 비롯되었는지 설명합니다.

---

## eslint.config.mjs (Base)

TypeScript 스타일 가이드라인(`rules/typescript.md`) 기반.

| ESLint 규칙 | 설정 | 근거 (가이드라인 원문) |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | `error` | `any` 금지. 대신 `unknown` 사용 후 narrowing |
| `@typescript-eslint/no-non-null-assertion` | `error` | Non-null assertion(`!`) 금지. `?.` / `??` 사용 |
| `@typescript-eslint/ban-ts-comment` | `ts-ignore: true`, `ts-expect-error: allow-with-description` | `@ts-ignore` 절대 금지. 우회가 필요하면 `@ts-expect-error` + 사유 주석 |
| `@typescript-eslint/consistent-type-assertions` | `objectLiteralTypeAssertions: "never"` | `as` 단언 최소화. 객체 리터럴 타입 검증은 `satisfies` 사용 |
| `@typescript-eslint/consistent-type-definitions` | `"interface"` | 객체 형태는 `interface` 기본. `type`은 유니온/유틸리티/튜플/함수 시그니처에만 |
| `@typescript-eslint/explicit-function-return-type` | `error` (allowExpressions, allowTypedFunctionExpressions) | 함수 반환 타입은 명시 (export 함수 기준) |
| `@typescript-eslint/no-inferrable-types` | `warn` | 변수 타입은 추론에 맡김 |
| `@typescript-eslint/naming-convention` | variable: `camelCase`, const: `camelCase/UPPER_CASE/PascalCase`, function: `camelCase/PascalCase`, class: `PascalCase`, type/interface: `PascalCase` + `I`접두사·`Type`접미사 금지 | 네이밍 섹션 전체 반영 |
| `func-style` | `"expression"` (allowArrowFunctions) | 화살표 함수 기본 |
| `prefer-arrow-callback` | `error` | 콜백은 화살표 함수 |
| `import/no-default-export` | `error` | `named export` 기본 |
| `no-restricted-imports` | `../../../*` 패턴 금지 | 3단계 이상 상위 경로는 alias(`@/...`) 사용 |
| `check-file/filename-naming-convention` | `KEBAB_CASE` | 파일: `kebab-case` |
| `check-file/folder-naming-convention` | `KEBAB_CASE` | 폴더: `kebab-case` |

---

## react-eslint.config.mjs

React 스타일 가이드라인(`rules/react.md`) 기반. Base 설정을 상속합니다.

| ESLint 규칙 | 설정 | 근거 (가이드라인 원문) |
|---|---|---|
| `func-style` | `off` | 컴포넌트는 `function` 선언식이므로 Base의 화살표 함수 강제를 해제 |
| `react/function-component-definition` | `namedComponents: "function-declaration"` | 컴포넌트는 `function` 키워드 + PascalCase. 화살표 함수 컴포넌트 금지 |
| `react/jsx-pascal-case` | `error` | 컴포넌트: `PascalCase` |
| `react/jsx-handler-names` | `eventHandlerPrefix: "handle"`, `eventHandlerPropPrefix: "on"` | 내부 핸들러: `handleXxx`, props 콜백: `onXxx` |
| `react-hooks/rules-of-hooks` | `error` | 커스텀 훅·Hook 규칙 준수 |
| `react-hooks/exhaustive-deps` | `warn` | useEffect 의존성 배열 관리 — 하나의 Effect는 하나의 책임만 |

---

## next-eslint.config.mjs

Next.js 스타일 가이드라인(`rules/next.md`) 기반. React 설정을 상속합니다.

| ESLint 규칙 | 적용 파일 | 설정 | 근거 (가이드라인 원문) |
|---|---|---|---|
| `import/no-default-export` | 라우팅 파일 (`page`, `layout`, `loading`, `error`, `route` 등) | `off` | 라우팅 파일은 **default export** (프레임워크 규약) |
| `no-restricted-syntax` (`use client`) | `page.tsx`, `layout.tsx` | `error` | Server Component를 기본으로 사용. `"use client"`는 하위 컴포넌트에 위치 |
| `no-restricted-syntax` (함수명 `Page`, `Layout`, `Loading` 등) | 라우팅 파일 | `error` | 일반명 금지. 역할이 드러나는 함수명 사용 (예: `RecruitListPage`) |
| `no-restricted-imports` (`next/head`) | `app/` 하위 전체 | `error` | `next/head` 사용 금지. Metadata는 Next.js Metadata API로만 |
| `no-restricted-properties` (`document.title`) | `app/` 하위 전체 | `error` | `document.title` DOM 조작 금지. Metadata API 사용 |
