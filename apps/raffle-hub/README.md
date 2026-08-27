# Pollar app template

You just copied this folder to `apps/<your-slug>/`. Pollar is already wired in: auth, balance, payments, and a UI kit. You build your app's screens on top; you never touch the SDK setup.

## What's included

**Auth**: `usePollarAuth()` is the single auth entry point; sessions persist across reloads.

```tsx
const { user, isLoading, login, logout } = usePollarAuth();
// user.address is the user's id across every Pollar app
```

**Login UI**: drop-in button that handles both states:

```tsx
<LoginButton />
```

**Balance**: the logged-in user's balance in the app's currency, auto-fetched and shared app-wide:

```tsx
const { balance, currency, isLoading, refresh } = useBalance();
```

`<BalanceCard />` renders it and auto-refreshes after every payment.

**Payments**: full payment lifecycle (confirm, processing, success or error) in one component:

```tsx
<PayButton amount="5.00" recipient="G…" onSuccess={(result) => console.log(result.hash)} />
```

The demo home also ships `SendModal` (amount, recipient and memo, review, confirm) and `ReceiveModal`, both built on the shared `Modal`.

**UI kit**: `components/ui/` has `Button`, `Card`, `Input`, `Modal`, `Spinner`, `EmptyState`, `PollarLogo`, `PollarBear`. All styled with the design tokens in `app/globals.css`. Use these and the tokens, no hardcoded colors.

## Setup

1. `cp .env.example .env`
2. Paste your Pollar publishable key into `.env`. Get it at [dashboard.pollar.xyz](https://dashboard.pollar.xyz) under **Build → API Keys → Generate** (type: Publishable, `pub_testnet_…` while developing)
3. `pnpm install`
4. `pnpm dev`

Log in on the home page, and you have a wallet with a balance. To try the demo payment you need a recipient address: any other Pollar account's `G…` address (optionally prefill it via `NEXT_PUBLIC_DEMO_RECIPIENT` in `.env`).

## Fill pollar.manifest.json

The manifest identifies your app so the Pollar hub can list and open it. Fill it before opening your PR:

```jsonc
{
  "name": "",          // display name of your app
  "slug": "",          // must match your folder name under apps/
  "description": "",   // one line: what the app does
  "category": "",      // savings | commerce | community
  "icon": "/icon.png", // path inside your app's public/
  "url": ""            // production deploy URL, filled after you deploy
}
```

The home page reads `name` for its hero. Fill it first and the app stops calling itself "My Pollar App".

## Build your app

`app/page.tsx` is a working demo of everything above (login, balance, send and receive flows). Replace it with your app's screens and keep using the hooks and UI kit:

- Payments go through `<PayButton>` or the `SendModal` flow (or `usePollar().runTx` for custom flows)
- Money amounts and addresses render in Geist Mono (`font-mono`)
- New colors go into the tokens in `app/globals.css`, never inline
- Keep it working with `pnpm install && pnpm dev` plus only the API key in `.env`. That's how your PR gets tested
