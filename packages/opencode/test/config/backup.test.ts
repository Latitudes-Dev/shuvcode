import { expect, test } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { cleanupOldBackups } from "../../src/config/backup"

test("cleanupOldBackups removes backups older than ttl while keeping recent ones", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-backup-"))
  const filepath = path.join(dir, "opencode.jsonc")
  await Bun.write(filepath, JSON.stringify({ model: "alpha" }, null, 2))

  const staleBackup = `${filepath}.bak-stale`
  const freshBackup = `${filepath}.bak-fresh`
  await Bun.write(staleBackup, "{}")
  await Bun.write(freshBackup, "{}")

  const now = Date.now()
  const ttlMs = 2000
  await fs.utimes(staleBackup, new Date(now - ttlMs - 5000), new Date(now - ttlMs - 5000))
  await fs.utimes(freshBackup, new Date(now - 500), new Date(now - 500))

  try {
    const deleted = await cleanupOldBackups(filepath, { ttlMs })
    expect(deleted).toBe(1)
    expect(await Bun.file(staleBackup).exists()).toBe(false)
    expect(await Bun.file(freshBackup).exists()).toBe(true)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
