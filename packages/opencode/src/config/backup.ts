import fs from "fs/promises"
import path from "path"
import { Log } from "@/util/log"

const log = Log.create({ service: "config.backup" })
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_TTL_DAYS = 7

const envTtlDays = Number(process.env.OPENCODE_CONFIG_BACKUP_TTL_DAYS)
const CONFIG_BACKUP_TTL_MS =
  Number.isFinite(envTtlDays) && envTtlDays > 0 ? envTtlDays * DAY_MS : DEFAULT_TTL_DAYS * DAY_MS

interface CleanupOptions {
  ttlMs?: number
}

function resolveTtlMs(override?: number) {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override
  }
  return CONFIG_BACKUP_TTL_MS
}

export async function createBackup(filepath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = `${filepath}.bak-${timestamp}`

  if (await Bun.file(filepath).exists()) {
    await fs.copyFile(filepath, backupPath)
  }

  return backupPath
}

export async function restoreBackup(backupPath: string, targetPath: string): Promise<void> {
  await fs.copyFile(backupPath, targetPath)
  await fs.unlink(backupPath)
}

export async function cleanupOldBackups(filepath: string, options?: CleanupOptions): Promise<number> {
  const ttlMs = resolveTtlMs(options?.ttlMs)
  const directory = path.dirname(filepath)
  const base = path.basename(filepath)
  const entries = await fs.readdir(directory).catch(() => [])
  const now = Date.now()
  let deleted = 0

  for (const entry of entries) {
    if (!entry.startsWith(`${base}.bak-`)) {
      continue
    }

    const candidate = path.join(directory, entry)
    const stats = await fs.stat(candidate).catch(() => undefined)
    if (!stats) {
      continue
    }

    if (now - stats.mtimeMs <= ttlMs) {
      continue
    }

    try {
      await fs.unlink(candidate)
      deleted += 1
    } catch (error) {
      log.warn("backup.cleanup.unlinkFailed", {
        backupPath: candidate,
        error: String(error),
      })
    }
  }

  if (deleted > 0) {
    log.info("backup.cleanup.completed", {
      filepath,
      deleted,
    })
  }

  return deleted
}
