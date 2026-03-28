import { App } from "./App.js"
import { resolveTerminalInstallDir } from "../../shared/install-dir.js"
import type { TerminalCommandContext, TerminalCommandDefinition } from "../types.js"

const modelsCommand: TerminalCommandDefinition = {
  name: "models",
  title: "Iris Models",
  description: "模型配置界面",
  render(context: TerminalCommandContext) {
    return <App installDir={resolveTerminalInstallDir(context.commandArgs, context.executablePath)} />
  },
}

export default modelsCommand
