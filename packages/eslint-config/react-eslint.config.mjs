import globals from "globals";

import { defineConfig } from "eslint/config";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";

import baseConfig from "./eslint.config.mjs";

export default defineConfig([
  ...baseConfig,
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      /* 컴포넌트는 function 선언이므로 func-style 경고 해제 (.tsx에서 충돌 방지) */
      "func-style": "off",

      // 컴포넌트 이름은 PascalCase
      "react/jsx-pascal-case": [
        "error",
        {
          allowAllCaps: false,
          ignore: [],
        },
      ],

      /* 
        컴포넌트는 함수 선언문으로 정의 
        내부 로직은 화살표 함수를 쓰되, 컴포넌트 자체는 function을 강제합니다
      */
      "react/function-component-definition": [
        "error",
        {
          namedComponents: "function-declaration",
          unnamedComponents: "function-expression",
        },
      ],

      /* 내부 핸들러는 handleXXX, Props 전달 시 onXXX */
      "react/jsx-handler-names": [
        "error",
        {
          eventHandlerPrefix: "handle",
          eventHandlerPropPrefix: "on",
          checkLocalVariables: true,
          checkInlineFunction: true,
        },
      ],

      /*
        Hook과 useEffect는 하나의 책임만
        의존성 배열을 강제하여 의도치 않은 사이드 이펙트를 방지합니다.
      */
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      /* 불필요한 JSX 구문 정리 - Fragment 축약 문법 권장 */
      "react/jsx-fragments": ["error", "syntax"],

      /*. 불필요한 JSX 구문 정리 - Boolean prop 축약 허용 */
      "react/jsx-boolean-value": ["error", "never"],

      /* 불필요한 JSX 구문 정리 - JSX 중괄호 불필요한 경우 제거 */
      "react/jsx-curly-brace-presence": [
        "error",
        {
          props: "never",
          children: "never",
        },
      ],

      // 자동 포커스 금지
      "jsx-a11y/no-autofocus": "warn",
      // 클릭 요소에 키보드 이벤트 요구
      "jsx-a11y/click-events-have-key-events": "warn",
      // 정적 요소 상호작용 제한
      "jsx-a11y/no-static-element-interactions": "warn",
    },
  },
]);
