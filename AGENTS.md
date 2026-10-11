# Repository Guidelines & Memory: pi-focus-guard

## Feature Documentation Structure
- All new features follow `docs/feature-impl/<YYYYMMDD>-<feature-short-name>/`. See `docs/feature-impl/README.md` for conventions.

# Precommit

- Gate: `npm run precommit` = `tsc --noEmit && npm run test && npm audit --audit-level=moderate`. No git hooks are installed; this is the manual convention.

# Follow-ups

- (Resolved 2026-10-11) Development dependency audit was clean: after bumping `@earendil-works/pi-coding-agent` / `pi-tui` to 1.1.0, `@types/node` to 26.6.5, and `vitest` to 5.0.3, `npm audit --audit-level=moderate` reports 0 vulnerabilities (brace-expansion → 5.0.12, source-map-js → 1.2.2, protobufjs → 7.6.6 under Pi 1.1.0). The earlier `protobufjs@7.6.4` (GHSA-j3f2-48v5-ccww, upstream Pi issue #7005) is no longer in the tree. Re-run `npm audit --audit-level=moderate` on any future dependency or lockfile change.
- Standing rule for dependency work: do not suppress the audit (`audit: false`), hand-edit `package-lock.json`, or patch `node_modules` as a workaround.
