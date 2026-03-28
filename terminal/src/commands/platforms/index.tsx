import { App } from "./App.js"
import { resolveTerminalInstallDir } from "../../shared/install-dir.js"
import type { TerminalCommandContext, TerminalCommandDefinition } from "../types.js"

const platformsCommand: TerminalCommandDefinition = {
  name: "platforms",
  title: "Iris Platforms",
  description: "平台配置界面",
  render(context: TerminalCommandContext) {
    return <App installDir={resolveTerminalInstallDir(context.commandArgs, context.executablePath)} />
  },
}

export default platformsCommand
