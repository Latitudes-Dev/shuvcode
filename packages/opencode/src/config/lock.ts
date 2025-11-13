import path from "path"
import { Log } from "@/util/log"
import { existsSync } from "fs"

const log = Log.create({ service: "config.lock" })

const DEFAULT_LOCK_TIMEOUT_MS = 30000
const LOCK_WARNING_THRESHOLD_MS = 5000
const LOCK_WARNING_WINDOW_MS = 100
const STALE_LOCK_MS = 5000

interface LockOptions {
  timeout?: number
}

type UnlockFn = () => Promise<void>

async function ensureFileExists(filepath: string) {
  if (!existsSync(filepath)) {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(filepath, "", { flag: "wx" }).catch(() => {})
  }
}

export async function acquireLock(filepath: string, options?: LockOptions): Promise<UnlockFn> {
  const normalized = path.normalize(filepath)
  const timeout = options?.timeout ?? DEFAULT_LOCK_TIMEOUT_MS

  await ensureFileExists(normalized)

  const { lock } = await import("proper-lockfile")
  const startTime = Date.now()

  try {
    const release = await lock(normalized, {
      stale: STALE_LOCK_MS,
      update: STALE_LOCK_MS / 2,
      retries: {
        retries: Math.max(1, Math.floor(timeout / 200)),
        minTimeout: 100,
        maxTimeout: 2000,
        factor: 2,
      },
    })
    return release
  } catch (error) {
    const waited = Date.now() - startTime
    throw new Error(`Lock timeout: could not acquire lock for ${normalized} after ${waited}ms`)
  }
}

export async function cleanupStaleLocks(lockDir: string) {
  const { readdir, stat, unlink } = await import("node:fs/promises")
  const { join } = await import("path")

  try {
    const entries = await readdir(lockDir, { withFileTypes: true })
    const { check } = await import("proper-lockfile")

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith(".lock")) {
        const lockPath = join(lockDir, entry.name)
        try {
          const isLocked = await check(lockPath).catch(() => false)
          if (!isLocked) {
            log.info("cleaning up stale lock directory", { lockPath })
            await unlink(lockPath).catch(() => {})
          }
        } catch {}
      }
    }
  } catch {}
}
