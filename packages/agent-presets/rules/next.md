# Next.js 스타일 가이드라인

> **우선순위**: 본 문서는 프로젝트의 1차 기준입니다. 외부 스킬·가이드(`.claude/skills/` 하위 문서 포함)는 보완 참고용이며, 본 문서와 어긋날 경우 항상 본 문서를 우선합니다.

App Router 기준. Pages Router 패턴 금지.

## 1. Server Component를 기본으로 사용한다

- 새 컴포넌트는 **Server Component로 시작**. 다음 트리거 중 하나라도 해당할 때만 `"use client"`로 전환:
  - React 상태/생명주기 훅 (`useState`, `useEffect`, `useReducer`, `useRef`, `useLayoutEffect`)
  - React Context 사용 (Provider와 소비자 모두 Client여야 함)
  - 브라우저 이벤트 핸들러 (`onClick`, `onChange`, `onSubmit` 등)
  - 브라우저 전용 API (`window`, `document`, `localStorage`, `IntersectionObserver` 등)
  - Next.js 클라이언트 훅 (`useRouter`, `usePathname`, `useSearchParams`, `useParams` from `next/navigation`)
  - 클라이언트 전용 라이브러리 (`framer-motion`, `swiper`, `react-hook-form`, 차트 라이브러리 등)
- 일부만 Client 기능이 필요하면 → 그 부분만 분리해 자식 Client Component로, 부모는 Server로 유지.

## 2. `"use client"`는 가능한 한 하위 컴포넌트에 위치시킨다

- 상호작용이 필요한 컴포넌트에만 `"use client"`. 페이지/레이아웃에는 가급적 붙이지 않는다.
- Client 경계는 트리의 leaf 쪽에 둔다 — 경계가 깊을수록 클라이언트 번들이 작아진다.
- **`"use client"`의 전염은 import에만 적용된다**. `children` prop으로 전달된 컴포넌트는 경계를 넘지 않고 Server Component로 유지된다. Context Provider도 이 패턴으로 감싸면 하위 페이지의 Server Component 이점 유지 가능.

### Server → Client 경계의 props 직렬화 제약

Server Component가 Client Component에 전달하는 props는 **직렬화 가능해야 한다**. 다음은 전달 불가:

- 일반 함수 (이벤트 핸들러, 콜백) — Server Action은 예외
- 커스텀 클래스 인스턴스 (Date는 가능)
- Symbol, Map/Set, 순환 참조 객체

콜백이 필요하면 Client Component 내부에서 정의. **Server → Client로 함수 자체를 넘겨야 하는 특수한 경우**에는 Server Action으로 작성해 prop으로 전달 가능 (일반적인 뮤테이션은 규칙 3의 `useMutation` 사용).

## 3. 데이터 페칭 기준

데이터의 성격으로 페칭 위치와 도구를 정한다:

| 데이터 성격                                        | 위치             | 도구                         |
| -------------------------------------------------- | ---------------- | ---------------------------- |
| SEO/초기 가독성 중요 (상세 본문, 목록 초기 데이터) | Server Component | `fetch`                      |
| 개인화·잦은 인터랙션·클라이언트 상태와 엮임        | Client Component | TanStack Query `useQuery`    |
| 뮤테이션 (생성/수정/삭제)                          | Client Component | TanStack Query `useMutation` |

SEO 영향 없고 Skeleton UI로 충분한 경우(대시보드 위젯, 팝업 데이터 등)는 굳이 서버에서 페칭하지 않는다.

### 3-1. Server Component의 fetch — 캐싱 옵션 명시 필수

Next.js 15부터 `fetch` 기본값이 `no-store`. 의도를 코드에 드러내려면 **반드시 옵션 명시**:

- `cache: "force-cache"` — 빌드 타임 캐시, 재배포까지 유지. 정적 데이터 (약관, 공지 카테고리).
- `next: { revalidate: N }` — N초 캐시 후 재검증. 자주 안 바뀌는 동적 데이터 (이벤트 목록, 공지).
- `next: { tags: [...] }` — 태그 기반 무효화. 뮤테이션 후 `revalidateTag`.
- `cache: "no-store"` — 매 요청 새로 페칭. 실시간/사용자별 데이터.

### 3-2. 여러 데이터는 병렬로 — `Promise.all`

서로 의존하지 않는 요청은 `Promise.all`. 순차 `await`는 워터폴 발생. 의존성이 있는 경우만 순차 실행하되 의존 관계가 코드에 드러나게 작성.

### 3-3. 같은 요청이 여러 곳에서 필요하면 `React.cache()`

페이지 + `generateMetadata` + 레이아웃이 같은 데이터를 쓸 때, `cache()`로 감싸면 한 요청 사이클 내 중복 호출 자동 제거.

### 3-4. Client의 TanStack Query

- **쿼리 키는 배열**. 리소스 이름을 첫 요소로 고정해 도메인 그루핑. 의존 파라미터는 뒤에.
  - ✅ `["events", filter]`, `["event", id]`, `["user", userId, "notifications"]`
  - ❌ `"events"` (배열 아님), `["events"]` + filter 사용 (의존성 누락 → 재요청 안 됨)
- 뮤테이션 성공 후 `queryClient.invalidateQueries({ queryKey: [...] })`로 관련 쿼리 무효화.
- `useState + useEffect + fetch` 조합 직접 짜지 말 것. 로딩/에러/캐싱/재검증/리트라이는 TanStack Query에 위임.

### 3-5. Server + Client 혼합 — Hydration 패턴

초기 데이터는 SEO 필요하고 이후 인터랙션으로 필터링·정렬·페이지네이션 일어나는 목록 페이지에 적합:

Server에서 `queryClient.prefetchQuery` → `<HydrationBoundary state={dehydrate(queryClient)}>`로 감싸 Client Component에 전달 → Client에서 `useQuery`가 prefetch한 데이터로 즉시 시작.

## 4. Page / Layout은 default export + 역할이 드러나는 함수명

- **라우팅 파일**(`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, `route.ts`): **default export** (프레임워크 규약).
- **그 외 일반 컴포넌트/유틸**: **named export**.
- 라우팅 파일의 함수 이름은 `Page`/`Layout`/`Loading` 같은 일반명 금지. 역할이 드러나게:
  - ✅ `RecruitListPage`, `RecruitDetailPage`, `RecruitListLoading`
  - ❌ `function Page()` — 스택 트레이스·DevTools·프로파일러에서 어느 페이지인지 식별 불가
  - **예외**: `route.ts`의 Route Handler는 HTTP 메서드명(`GET`, `POST`, `PUT`, `DELETE` 등)을 그대로 named export — 프레임워크 규약.

## 5. Metadata는 Next.js Metadata API로만

- **`next/head` 사용 금지** (App Router에서 deprecated, Pages Router 도구).
- **`document.title` DOM 조작 금지** — 크롤러·SNS 미리보기는 JS 실행 전 HTML만 읽음.
- 정적: `export const metadata: Metadata = { ... }`
- 동적: `export async function generateMetadata({ params }): Promise<Metadata>`
- 레이아웃의 `title.template = "%s | 서비스명"`로 공통 접미사 처리. 페이지에서는 고유 제목만 신경.
- `generateMetadata`와 페이지가 같은 데이터를 쓰면 페칭 함수를 `React.cache()`로 감쌀 것 (3-3 참조).

## 6. 이미지는 `next/image`의 `<Image>`

- `<img>` 금지. `next/image`의 `<Image>` 사용.
- **반드시 `width`/`height` 또는 `fill` + `sizes` 지정** — 누락 시 CLS 발생.
- **LCP 이미지에는 `priority` 필수** — 첫 화면 히어로 배너, 상세 페이지 메인 썸네일. 스크롤해야 보이는 이미지·리스트의 모든 썸네일에는 붙이지 말 것 (첫 화면에 보이는 1~2개만).
- `fill` 사용 시 `sizes` 반드시 명시. 누락하면 가장 큰 해상도로 srcset 생성되어 불필요한 트래픽.
  - 예: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`
- 외부 도메인 이미지는 `next.config.js`의 `images.remotePatterns`에 등록. 미등록 도메인은 런타임 에러.

## 7. Suspense / loading.tsx / error.tsx

### 7-1. 세그먼트 단위 — 파일 컨벤션

- 비동기 Server Component가 있는 세그먼트에는 **`loading.tsx` 필수**. 없으면 페이지 완성까지 빈 화면.
- 데이터 페칭이 실패할 수 있는 세그먼트에는 **`error.tsx` 필수**. 없으면 에러가 상위로 전파.
- **`error.tsx`는 반드시 `"use client"`** (프레임워크 규약). `reset` 함수로 재시도 버튼 제공.
- 루트 레이아웃 자체 에러는 `app/global-error.tsx`.

### 7-2. 세밀한 제어 — `<Suspense>` 직접 배치

페이지 일부만 느린 데이터에 의존할 때, 전체를 `loading.tsx`로 가리면 빠른 부분까지 지연. 빠른 부분은 페이지 레벨에서 `await`, 느린 부분만 별도 async Server Component로 빼서 `<Suspense fallback={...}>`로 감싼다 — 스트리밍으로 준비되는 대로 교체.

### 7-3. 경계 배치 원칙

- "이 부분이 실패해도 페이지의 다른 부분은 정상 동작해야 하는가?" → 그렇다면 별도 경계.
- 너무 깊지도 얕지도 않게. 모든 컴포넌트를 감싸면 UI 파편화, 페이지 루트에만 두면 스트리밍 이점 상실.

## 8. 환경변수 — 서버 전용 vs 클라이언트 노출 명확히 구분

- **`NEXT_PUBLIC_` 접두사가 붙은 변수만 클라이언트 번들에 포함**. 그 외는 서버 전용.
- 민감한 값(API 시크릿, DB 접속 정보, 서드파티 서버 토큰)에는 **절대 `NEXT_PUBLIC_` 붙이지 말 것**. 잘못 붙이면 시크릿이 번들에 하드코딩되어 배포됨.
- `NEXT_PUBLIC_`은 브라우저 노출되어도 안전한 값에만 (공개 API 엔드포인트, 공개 analytics ID, 공개 feature flag).
- 실제 값이 담긴 `.env.local`은 커밋 금지. 환경변수 목록은 `.env.example`로 관리.
- **앱 시작 시점에 Zod로 검증해 단일 모듈로 export** — `process.env` 직접 접근(`string | undefined`) 금지.

```typescript
// lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  API_SECRET_KEY: z.string().min(1),
  INTERNAL_API_BASE: z.string().url(),
  NEXT_PUBLIC_API_BASE: z.string().url(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),
});

export const env = envSchema.parse({
  API_SECRET_KEY: process.env.API_SECRET_KEY,
  INTERNAL_API_BASE: process.env.INTERNAL_API_BASE,
  NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
});
```

사용처에서는 `import { env } from "@/lib/env"`로 타입 안전하게 접근.
