# Better Auth RN Passkey – Example

Simple steps to run the example with a local Postgres database, apply migrations with the Better Auth CLI, and start the Expo app.

## 1) Start Postgres
- From the `example/` folder run:
- `docker compose up -d`
- This starts Postgres on `localhost:5432` with:
  - user: `auth`, password: `auth`, database: `auth`

Optional: verify status with `docker compose ps`.

## 2) Run Better Auth migrations
- Create a `.env` (in `example/`) with your connection string:
- `DATABASE_URL=postgres://auth:auth@localhost:5432/auth`
- Run migrations using the Better Auth CLI:
- `npx @better-auth/cli migrate`

Notes:
- The CLI infers your Better Auth config from `lib/auth.ts`.
- Re-run `migrate` whenever schema changes or on a fresh database.

## 3) Start the Expo app
- Install deps (first time only):
- `npm install`
- Start dev server:
- `npm start`
- Launch platform targets:
  - iOS: `npm run ios`
  - Android: `npm run android`
  - Web: `npm run web`

The Better Auth server in this example uses Postgres via Kysely (see `lib/auth.ts`). The `baseURL` is `http://localhost:8081` during development.

## 4) Handy commands
- Stop and remove containers/volumes:
- `docker compose down -v`
- View Postgres logs:
- `docker compose logs -f postgres`
