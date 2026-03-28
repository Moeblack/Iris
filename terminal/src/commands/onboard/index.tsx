/**
 * Iris Onboard 命令界面
 *
 * 作为 terminal 命令集合中的一个命令模块存在。
 * 当前通过 iris-onboard 二进制或 iris onboard 间接启动。
 */
import { App } from "./App.js"
import { resolveTerminalInstallDir } from "../../shared/install-dir.js"
import type { TerminalCommandContext, TerminalCommandDefinition } from "../types.js"

const onboardCommand: TerminalCommandDefinition = {
  name: "onboard",
  title: "Iris Onboard",
  description: "交互式配置引导",
  render(context: TerminalCommandContext) {
    return <App installDir={resolveTerminalInstallDir(context.commandArgs, context.executablePath)} />
  },
}

export default onboardCommand
