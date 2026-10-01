# GitHub Actions

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `lint.yml` | pull request | Checks the PR title is a conventional commit, then runs `pnpm lint` |
| `test.yml` | pull request | Runs `pnpm build` and `pnpm test` |
| `release.yml` | push to `main` | Release Please opens or updates the release PR; merging it publishes to npm |

PRs are squash-merged, so the PR title becomes the commit Release Please reads:

- `fix:` → patch
- `feat:` → minor
- `feat!:` or a `BREAKING CHANGE:` footer → major
- `docs:`, `refactor:`, `test:`, `ci:`, `chore:` → no release

Publishing uses npm trusted publishing (OIDC via `id-token: write`); no npm token secret is involved.
