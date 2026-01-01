const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

config.watchFolders = [monorepoRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
]

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith(".js")) {
    const tsPath = moduleName.replace(/\.js$/, ".ts")
    try {
      return context.resolveRequest(context, tsPath, platform)
    } catch {
      return context.resolveRequest(context, moduleName, platform)
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
