import fs from "node:fs"
import path from "node:path"

export function resolveTerminalInstallDir(commandArgs: string[], executablePath: string): string {
  const cliArg = commandArgs[0]
  if (cliArg) return path.resolve(cliArg)

  if (process.env.IRIS_DIR) {
    return path.resolve(process.env.IRIS_DIR)
  }

  const executableInstallDir = path.resolve(path.dirname(executablePath), "..")
  if (fs.existsSync(path.join(executableInstallDir, "data", "configs.example"))) {
    return executableInstallDir
  }

  return process.cwd()
}
