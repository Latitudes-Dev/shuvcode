# Config Hot Reload

This document summarizes the configuration, locking, backup, and observability story around `packages/opencode/src/config`, so you can safely exercise hot reload in development and production.

## Overview

With `OPENCODE_CONFIG_HOT_RELOAD=true` OpenCode switches from a full `Instance.dispose()` restart to a targeted invalidation sweep that touches only the subsystems named in `ConfigInvalidation.apply`. That lets editors, providers, the MCP bus, and language services keep running while only `config`, `provider`, `lsp`, `plugin`, `tool-registry`, and other affected states refresh.

Hot reload is gated by feature flags so you can stage it gradually.

## Feature Flags

- `OPENCODE_CONFIG_HOT_RELOAD` (default `"false"`): Enable targeted invalidation across project/global updates. Set this before launching the server or CLI.
- `OPENCODE_FULL_DISPOSE_ON_CONFIG_UPDATE` (default `"false"`): Force the legacy `Instance.dispose()` behaviour even when hot reload is enabled, useful for troubleshooting.
- `OPENCODE_CONFIG_INVALIDATION_LOG_DIFF` (default `"false"`): Emit `config.invalidate.diff` debug logs that include `scope`, `directory`, and the raw `ConfigDiff` so you can inspect which sections changed before the invalidation tasks run.
- `OPENCODE_CONFIG_BACKUP_TTL_DAYS` (default `7`): How long `.bak-<timestamp>` files should be retained. Shorten if disk space is tight, or extend for longer history.

## Backup Cleanup

Every config update writes a timestamped `.bak-<iso-timestamp>` backup next to the target config file. The cleanup routine in `packages/opencode/src/config/backup.ts` runs during bootstrap and immediately after each successful `Config.update`, deleting backups older than `OPENCODE_CONFIG_BACKUP_TTL_DAYS`. This keeps disk growth bounded without manual maintenance.

## Locking & Concurrency

Writes are protected by `proper-lockfile` in `packages/opencode/src/config/lock.ts`. Before acquiring a lock OpenCode ensures the lock file exists and configures retries (`retries`, `minTimeout`, `maxTimeout`) with stale detection (`stale = 5s`, `update = stale / 2`). On startup `cleanupStaleLocks` scans for residual `.lock` directories, verifies `lockfile.check`, and removes orphaned directories while logging the cleanup. The same lock is reused for project/global config writes, so simultaneous `Config.update` calls serialize safely.

## Updating Config

Apply config changes via `PATCH /config` (defaults to project scope) or `PATCH /config?scope=global` (for global overrides). Example:

```bash
export OPENCODE_CONFIG_HOT_RELOAD=true

curl -X PATCH http://localhost:4096/config \
  -H "Content-Type: application/json" \
  -d '{"model": "anthropic/claude-3-5-sonnet"}'
```

The API merges the payload with the existing `Info` schema, emits `config.updated` via `Bus`, and publishes a `ConfigDiff` that `ConfigInvalidation.apply` uses to derive invalidation targets.

## Logs & Diagnostics

- `config.invalidate.stateRefreshed` fires whenever a new `Instance` context loads the latest config.
- `config.invalidate.start`/`config.invalidate.complete` include `scope`, `directory`, `sections`, and `targets`.
- Enable `OPENCODE_CONFIG_INVALIDATION_LOG_DIFF=true` to capture `config.invalidate.diff`, which adds the entire diff object to the log entry so you can see every changed section before invalidation begins.
- Any fallback to the JSONC writer still logs warnings via `config.write.fallback`, and backup cleanup emits `config.backup.cleanup` with deletion counts.

## Testing & CI

Config updates now have dedicated regression suites in `packages/opencode/test/config`. The new `.github/workflows/config.yml` workflow runs `bun test packages/opencode/test/config/*` and `bun run --cwd packages/opencode typecheck` whenever config sources, docs, or tests change, ensuring the hot reload story is fully exercised before merging.
