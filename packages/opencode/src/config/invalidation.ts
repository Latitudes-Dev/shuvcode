import { Bus } from "@/bus"
import { Config } from "./config"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import type { ConfigDiff } from "./diff"
import { Context } from "../util/context"
import { isConfigHotReloadEnabled } from "./hot-reload"

const log = Log.create({ service: "config.invalidation" })
const shouldLogConfigDiff = process.env.OPENCODE_CONFIG_INVALIDATION_LOG_DIFF === "true"

type ApplyInput = {
  scope: "project" | "global"
  directory?: string
  diff: ConfigDiff
  refreshed?: boolean
}

let initialized = false
async function invalidateProvider(diff: ConfigDiff): Promise<void> {
  await Instance.invalidate("provider")
}

async function invalidateMCP(diff: ConfigDiff): Promise<void> {
  await Instance.invalidate("mcp")
}

async function invalidateLSP(diff: ConfigDiff): Promise<void> {
  await Instance.invalidate("lsp")
}

async function invalidateFileWatcher(_diff: ConfigDiff): Promise<void> {
  await Instance.invalidate("filewatcher")
}

async function invalidatePlugin(diff: ConfigDiff): Promise<void> {
  await Instance.invalidate("plugin")
}

async function invalidateToolRegistry(_diff: ConfigDiff): Promise<void> {
  await Instance.invalidate("tool-registry")
}

async function invalidatePermission(_diff: ConfigDiff): Promise<void> {
  await Instance.invalidate("permission")
}

async function invalidateCommandAgentFormat(diff: ConfigDiff): Promise<void> {
  if (diff.command) await Instance.invalidate("command")
  if (diff.agent) await Instance.invalidate("agent")
  if (diff.formatter) await Instance.invalidate("format")
}

async function invalidateUIAndPrompts(diff: ConfigDiff): Promise<void> {
  if (diff.instructions) await Instance.invalidate("instructions")
  if (diff.theme) await Instance.invalidate("theme")
  if (diff.share || diff.autoshare) await Instance.invalidate("share-settings")
}

type DiffKey = {
  [K in keyof ConfigDiff]: ConfigDiff[K] extends boolean | undefined ? K : never
}[keyof ConfigDiff]

type TargetMatrixEntry = {
  keys: DiffKey[]
  targets: (diff: ConfigDiff) => string[]
  invalidate: (diff: ConfigDiff) => Promise<void>
}

const TARGET_MATRIX: TargetMatrixEntry[] = [
  {
    keys: ["provider", "model", "small_model", "disabled_providers"],
    targets: () => ["provider"],
    invalidate: invalidateProvider,
  },
  {
    keys: ["mcp"],
    targets: () => ["mcp"],
    invalidate: invalidateMCP,
  },
  {
    keys: ["lsp", "formatter"],
    targets: () => ["lsp"],
    invalidate: invalidateLSP,
  },
  {
    keys: ["watcher"],
    targets: () => ["filewatcher"],
    invalidate: invalidateFileWatcher,
  },
  {
    keys: ["plugin"],
    targets: () => ["plugin"],
    invalidate: invalidatePlugin,
  },
  {
    keys: ["plugin", "tools"],
    targets: () => ["tool-registry"],
    invalidate: invalidateToolRegistry,
  },
  {
    keys: ["permission"],
    targets: () => ["permission"],
    invalidate: invalidatePermission,
  },
  {
    keys: ["command", "agent", "formatter"],
    targets: (diff) => {
      const names: string[] = []
      if (diff.command) names.push("command")
      if (diff.agent) names.push("agent")
      if (diff.formatter) names.push("format")
      return names
    },
    invalidate: invalidateCommandAgentFormat,
  },
  {
    keys: ["instructions", "theme", "share", "autoshare"],
    targets: (diff) => {
      const names: string[] = []
      if (diff.instructions) names.push("instructions")
      if (diff.theme) names.push("theme")
      if (diff.share || diff.autoshare) names.push("share-settings")
      return names
    },
    invalidate: invalidateUIAndPrompts,
  },
]

async function applyInternal(input: ApplyInput) {
  const { diff, scope } = input
  const targetDirectory = input.directory ?? process.cwd()
  const directoryForLog = input.directory ?? targetDirectory
  const alreadyRefreshed = input.refreshed === true

  await Instance.provide({
    directory: targetDirectory,
    fn: async () => {
      if (!alreadyRefreshed) {
        await Instance.invalidate("config")
      }
      log.info("config.invalidate.stateRefreshed", { scope, directory: directoryForLog })

      if (Object.keys(diff).length === 0) {
        log.info("config.update.noop", { scope, directory: directoryForLog })
        return
      }

      const sections = Object.keys(diff).filter((key) => diff[key as keyof ConfigDiff] === true)
      const targets = new Set<string>()
      const tasks: Promise<void>[] = []

      if (shouldLogConfigDiff) {
        log.debug("config.invalidate.diff", {
          scope,
          directory: directoryForLog,
          diff,
        })
      }

      for (const entry of TARGET_MATRIX) {
        const matches = entry.keys.some((key) => diff[key as keyof ConfigDiff] === true)
        if (!matches) continue
        const names = entry.targets(diff)
        for (const name of names) {
          targets.add(name)
        }
        tasks.push(entry.invalidate(diff))
      }

      log.info("config.invalidate.start", {
        scope,
        directory: directoryForLog,
        sections,
        targets: Array.from(targets),
      })

      try {
        await Promise.all(tasks)
      } catch (error) {
        log.error("Targeted config invalidation failed", {
          error: String(error),
        })
      }

      log.info("config.invalidate.complete", {
        scope,
        directory: directoryForLog,
        sections,
        targets: Array.from(targets),
      })
    },
  })
}
export namespace ConfigInvalidation {
  /**
   * Dispatches the diff-controlled invalidation sweep for a config update.
   *
   * @param input.scope - Scope that was written (`"project"` or `"global"`).
   * @param input.directory - Optional project directory that owns the update request.
   * @param input.diff - Diff object produced by `Config.update`.
   * @param input.refreshed - Set to `true` when the caller already refreshed config state.
   * @throws Context.NotFound when the requested instance context has already disposed (warning logged).
   * @throws Error for unexpected invalidation failures.
   *
   * @example
   * await ConfigInvalidation.apply({
   *   scope: "project",
   *   directory: "/home/user/workspace",
   *   diff: { provider: true, model: true },
   * })
   */
  export async function apply(input: ApplyInput) {
    try {
      await applyInternal(input)
    } catch (error) {
      if (error instanceof Context.NotFound) {
        log.warn("config.invalidate.missingContext", { error: String(error) })
        return
      }
      throw error
    }
  }

  export function setup() {
    if (initialized) {
      return
    }
    initialized = true

    Bus.subscribe(Config.Event.Updated, async (event) => {
      if (!isConfigHotReloadEnabled()) {
        return
      }

      const { diff, scope, directory, refreshed } = event.properties as any
      await apply({ diff, scope, directory, refreshed })
    })
  }
}
