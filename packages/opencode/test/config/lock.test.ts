import { expect, test } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { acquireLock, cleanupStaleLocks } from "../../src/config/lock"

test("acquireLock provides exclusive access across multiple calls", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-lock-"))
  const filepath = path.join(dir, "test.json")
  await Bun.write(filepath, JSON.stringify({ value: 0 }))

  let concurrentAccess = 0
  let maxConcurrentAccess = 0

  const promises = Array.from({ length: 5 }, async (_, i) => {
    const release = await acquireLock(filepath, { timeout: 10000 })
    try {
      concurrentAccess++
      maxConcurrentAccess = Math.max(maxConcurrentAccess, concurrentAccess)
      await new Promise((resolve) => setTimeout(resolve, 10))
      concurrentAccess--
    } finally {
      await release()
    }
  })

  await Promise.all(promises)
  expect(maxConcurrentAccess).toBe(1)

  await fs.rm(dir, { recursive: true, force: true })
})

test("acquireLock times out when lock cannot be acquired", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-lock-timeout-"))
  const filepath = path.join(dir, "test.json")
  await Bun.write(filepath, JSON.stringify({ value: 0 }))

  const release1 = await acquireLock(filepath, { timeout: 5000 })

  await expect(acquireLock(filepath, { timeout: 100 })).rejects.toThrow("Lock timeout")

  await release1()
  await fs.rm(dir, { recursive: true, force: true })
})

test("cleanupStaleLocks removes stale lock directories", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-lock-cleanup-"))
  const filepath = path.join(dir, "test.json")
  await Bun.write(filepath, "")

  const staleLockDir = path.join(dir, "test.json.lock")
  await fs.mkdir(staleLockDir)

  await cleanupStaleLocks(dir)

  expect(await Bun.file(staleLockDir).exists()).toBe(false)

  await fs.rm(dir, { recursive: true, force: true })
})

test("acquireLock creates file if it doesn't exist", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-lock-create-"))
  const filepath = path.join(dir, "nonexistent.json")

  const release = await acquireLock(filepath, { timeout: 5000 })
  await release()

  expect(await Bun.file(filepath).exists()).toBe(true)

  await fs.rm(dir, { recursive: true, force: true })
})
