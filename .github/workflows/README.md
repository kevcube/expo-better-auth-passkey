# GitHub Actions CI/CD

## Workflows

### CI (`ci.yml`)
- Runs on push/PR to main
- Uses Bun for fast builds
- Runs lint, build, test

### PR Title (`pr-title.yml`)
- Validates PR titles use conventional commits

### Release (`release.yml`)
- Uses Release Please for automated releases
- Creates release PRs with version bumps and changelog
- Publishes to npm when merged

## Conventional Commits

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature (minor version bump)
- `fix:` Bug fix (patch version bump)
- `feat!:` or `BREAKING CHANGE:` Breaking change (major version bump)
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Test additions or fixes
- `build:` Build system changes
- `ci:` CI configuration changes
- `chore:` Other changes that don't modify src or test files

### Examples:
```
feat: add passkey registration support for Android
fix(ios): resolve keychain access issue
feat!: change API to use async/await pattern
docs: update README with installation instructions
chore(deps): update expo to v54
```

## Setup

1. Add `NPM_TOKEN` secret in repo settings for npm publishing
2. Use conventional commits for all changes

## Release Process

1. Push commits with conventional format to main
2. Release Please creates a PR with version bump
3. Merge PR → publishes to npm + creates GitHub release

## Conventional Commits → Version Bumps

- `fix:` → patch (0.1.0 → 0.1.1)
- `feat:` → minor (0.1.0 → 0.2.0)  
- `feat!:` → major (0.1.0 → 1.0.0)
