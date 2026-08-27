@AGENTS.md

# Pollar app

This codebase is ONE Pollar app, copied from the pollar-apps template into `apps/<slug>/`. The dev you're helping was assigned that slug and builds their app here, on top of an already-integrated Pollar SDK (payments for emerging markets: every end user has one account and one balance shared across all Pollar apps). Your job is the app, never the plumbing.

For anything SDK-related, the source of truth is https://docs.pollar.xyz/llms-full.txt and the installed types in `node_modules/@pollar/*`. Do not invent SDK methods.

## Architecture map

| Piece | Where | What it does |
|---|---|---|
| SDK init | `lib/pollar.tsx` | `PollarAppProvider`, mounted once in `app/layout.tsx`. Reads `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY`. Keeps a single `PollarClient` on `globalThis`. The ONLY place Pollar is initialized. |
| Auth | `hooks/usePollarAuth.ts` | `{ user, isLoading, login, logout, verified }`. Sessions persist across reloads. `user.address` is the user's id across every Pollar app. |
| Balance | `hooks/useBalance.ts` | `{ balance, currency, asset, isLoading, error, refresh }` in the app's primary asset. Shared SDK state: one refresh updates every consumer. |
| Login UI | `components/LoginButton.tsx` | Logged out: login modal. Logged in: account button that opens `AccountModal` (email, wallet, log out). |
| Balance UI | `components/BalanceCard.tsx` | The wallet card; auto-refreshes after every payment (watches the SDK's global `tx` state). |
| Payments | `components/PayButton.tsx` | Full lifecycle: confirm, processing, success or error. Props: `amount`, `recipient` (a `G…` address), optional `asset` and `label`, `onSuccess(result)`. |
| Send/Receive | `components/SendModal.tsx`, `components/ReceiveModal.tsx` | Step-by-step send flow (amount, recipient and memo, review, confirm) and the receive view. Both use `runTx('payment', …)` via `lib/payments.ts`. |
| UI kit | `components/ui/` | `Button`, `Card`, `Input`, `Modal`, `Spinner`, `EmptyState`, `PollarLogo`, `PollarBear`. Typed, token-styled. `Modal` is the single modal shell: bottom sheet on phones, centered on desktop. |
| Design tokens | `app/globals.css` | All colors as CSS variables (light by default, dark via `data-theme="dark"`), exposed as Tailwind utilities (`bg-primary`, `text-muted`, …). |
| Manifest | `pollar.manifest.json` | Identifies the app to the Pollar hub: name, slug, description, category, icon, deploy URL. Must be filled before the PR. |
| Demo | `app/page.tsx` | Working demo of all of the above. Replace it with the real app. |

## Hard rules

- **Never reinitialize the Pollar SDK.** No `new PollarClient(...)`, no second `<PollarProvider>`. Two live clients trip the server's refresh-token reuse detection and log the user out. Consume Pollar through `usePollarAuth()`, `useBalance()`, or `usePollar()` from `@pollar/react`; for advanced calls use `usePollar().getClient()`.
- **Never hardcode colors.** Every color comes from the tokens in `app/globals.css`, used via the UI kit or token utilities. New color, new token first.
- **Never commit `.env` or the API key.** The key lives only in `.env` (gitignored). `.env.example` carries placeholders, never real keys.
- **All user-facing payments go through `PayButton` or the `SendModal` flow**, or a component built on the same SDK methods (`runTx('payment', …)`). Don't reimplement payment logic, don't build custom signing or submission flows.
- **Working directory discipline.** Everything you build lives inside this app's folder. In the monorepo, never modify `template/`, other apps under `apps/`, or root files. The only exception is this app's own entry in the root `apps.json`. A PR touching anything else gets rejected.

## How to extend

- **Screens**: add routes under `app/` (this is Next.js 16 App Router; see the note at the top of this file).
- **Components**: add your own alongside the UI kit; compose the kit primitives.
- **Server logic**: Next.js route handlers (`app/api/*/route.ts`). The `POLLAR_SECRET_KEY` env var (backend-only) exists for privileged Pollar server calls if you need them.
- **Dependencies**: install freely inside this folder. The app has its own `package.json` and lockfile, no workspaces, no imports from other apps.
- **Smart contracts / external backends**: allowed, as long as payments still flow through Pollar.

## Definition of done (bounty)

1. App deployed (production URL live, e.g. Vercel).
2. `pollar.manifest.json` completely filled, including the deploy `url`.
3. Runs from a fresh clone with `pnpm install && pnpm dev` and ONLY the API key in `.env`.
4. Uses Pollar login and real payments (not mocked).
