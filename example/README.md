# Better Auth RN Passkey – Example

Passkeys need a stable HTTPS hostname that matches the WebAuthn `rpID`. This example is set up for Tailscale HTTPS on a MagicDNS name.

## 1) Start Postgres

From `example/`:

```bash
docker compose up -d
```

Postgres listens on `localhost:5432` (`auth` / `auth` / `auth`).

## 2) Run Better Auth migrations

```bash
pnpm dlx @better-auth/cli migrate
```

The CLI reads `lib/auth.ts`. Re-run `migrate` after schema changes or on a fresh database.

## 3) Expose Metro over Tailscale TLS

1. Find your MagicDNS name: `tailscale status --json` → `Self.DNSName` (strip the trailing dot).
2. Put that hostname in `.env`:

```bash
EXPO_PUBLIC_PASSKEY_RP_ID=kbp.tailnet-name.ts.net
```

3. Start the app, then serve it over HTTPS:

```bash
pnpm start
tailscale serve --bg 8081
```

`tailscale serve` terminates TLS for `https://<magicdns>` and proxies to Metro. That hostname becomes both `baseURL` and `rpID`.

Associated domains use `?mode=developer`. On the phone: Settings → Developer → Associated Domains Development. The device must be on the tailnet so it can fetch `/.well-known/apple-app-site-association`.

Need Apple’s CDN to fetch the AASA file without developer mode? Use `tailscale funnel --bg 8081` instead of `serve`.

## 4) Native run

The example is pinned to stable Expo 57 for compatibility testing. After changing Expo versions, discard generated native projects and regenerate them with that SDK's default CNG template:

```bash
rm -rf ios android
pnpm exec expo prebuild
pnpm ios
# or
pnpm android
```

## Handy commands

- Stop Postgres: `docker compose down -v`
- Postgres logs: `docker compose logs -f postgres`
- Clear Tailscale serve: `tailscale serve reset`
