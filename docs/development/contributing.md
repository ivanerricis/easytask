# Contributing

Thanks for wanting to help. This page explains how to propose a change.

## Ideas and bugs

Open an [issue](https://github.com/ivanerricis/easytask/issues) first for a bug or a feature idea. There are templates for both. For a big change, discuss it in an issue before writing code.

## Make a change

1. Fork the repository, or create a branch if you have access.
2. Never commit to `master` directly: work on a branch such as `feat/my-change` or `fix/my-bug`.
3. Make the change, with tests. See [Local development](./local) to set up.
4. Run the checks (below).
5. Open a pull request to `master` and fill in the template.

## Commit messages

Use conventional commits: a type, an optional scope, a short description.

```
feat(settings): settings search, system and data options
fix(audio): adapt the tag reading to the lofty 0.25 API
chore(deps): fix the webpki advisories
docs: release flow through a branch and PR
test(e2e): fix the toast wait
perf: speed up drag & drop
```

Common types: `feat`, `fix`, `perf`, `docs`, `test`, `chore`.

## Before the pull request

```bash
npx eslint .
npx tsc -b
npm test
```

If you changed `src-tauri`, also run these in that folder:

```bash
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

CI runs the same checks, plus the coverage thresholds and the audits. See [Tests](./tests).

## Rules for the code

- **Translations:** every text the user sees must exist in both languages, in `src/i18n/locales/it` and `src/i18n/locales/en`. A missing key breaks the type-check, and a new key must be used in the code (the unused-keys test fails otherwise).
- **UI components:** use the [shadcn/ui](https://ui.shadcn.com/) components in `src/components/ui` first, and add missing ones with the shadcn CLI, instead of building native or custom controls.
- **Database:** add a new migration; never edit one that was already applied. See [Architecture](./architecture#migrations).
- **Tests:** add or update tests for what you change.

## Changelog

For any change the user can see, add a line under `## [Unreleased]` in both `CHANGELOG.md` (English) and `CHANGELOG.it.md` (Italian). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Releases

Only the maintainer publishes releases. The steps are in [RELEASING.md](https://github.com/ivanerricis/easytask/blob/master/RELEASING.md).

## Security

Do not open a public issue for a vulnerability. Report it privately as described in [SECURITY.md](https://github.com/ivanerricis/easytask/blob/master/SECURITY.md).
