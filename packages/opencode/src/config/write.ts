import {
  modify,
  applyEdits,
  type ModificationOptions,
  parse as parseJsonc,
  type ParseError,
  printParseErrorCode,
} from "jsonc-parser"
import { Log } from "@/util/log"
import type { Config } from "./config"

const log = Log.create({ service: "config.write" })

export async function writeConfigFile(
  filepath: string,
  newConfig: Config.Info,
  existingContent: string | null,
): Promise<void> {
  const file = Bun.file(filepath)
  const isJsonc = filepath.endsWith(".jsonc") || filepath.endsWith(".json")

  if (!existingContent || !(await file.exists())) {
    const content = JSON.stringify(newConfig, null, 2) + "\n"
    await Bun.write(filepath, content)
    return
  }

  if (isJsonc) {
    const updated = applyIncrementalUpdates(existingContent, newConfig)
    validateJsonc(updated)
    await Bun.write(filepath, updated)
    return
  }

  const content = JSON.stringify(newConfig, null, 2) + "\n"
  await Bun.write(filepath, content)
}

function applyIncrementalUpdates(content: string, newConfig: Config.Info) {
  const formattingOptions: ModificationOptions = {
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true,
      eol: "\n",
    },
  }

  let currentContent = content

  for (const [key, value] of Object.entries(newConfig)) {
    const edits = modify(currentContent, [key], value, formattingOptions)
    currentContent = applyEdits(currentContent, edits)
  }

  return currentContent
}

function validateJsonc(content: string) {
  const errors: ParseError[] = []
  parseJsonc(content, errors, { allowTrailingComma: true })

  if (errors.length === 0) {
    return
  }

  const details = errors
    .map((error) => {
      const code = printParseErrorCode(error.error)
      return `${code} at ${error.offset}`
    })
    .join("; ")

  throw new SyntaxError(`Invalid JSONC produced while persisting config: ${details}`)
}
