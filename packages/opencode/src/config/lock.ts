import path from "path"
import { Log } from "@/util/log"

const log = Log.create({ service: "config.lock" })
const fileLocks = new Map<string, Promise<void>>()

interface LockOptions {
  timeout?: number
}

export async function acquireLock(filepath: string, options?: LockOptions): Promise<() => void> {
  const normalized = path.normalize(filepath)
  const timeout = options?.timeout ?? 30000
  const startTime = Date.now()

  while (fileLocks.has(normalized)) {
    const waited = Date.now() - startTime

    if (waited > 5000 && waited < 5100) {
      log.warn("lock acquisition taking longer than expected", {
        filepath: normalized,
        waited,
      })
    }

    if (waited > timeout) {
      throw new Error(`Lock timeout: could not acquire lock for ${normalized} after ${waited}ms`)
    }

    await fileLocks.get(normalized)
  }

  let releaseFn: () => void
  const lockPromise = new Promise<void>((resolve) => {
    releaseFn = resolve
  })

  fileLocks.set(normalized, lockPromise)

  return () => {
    fileLocks.delete(normalized)
    releaseFn!()
  }
}
