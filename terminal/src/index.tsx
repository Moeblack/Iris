import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { hasTerminalCommand, resolveTerminalCommand } from "./commands/index.js"
import { gracefulExit, setRenderer } from "./shared/runtime.js"

function resolveRequestedCommand(argv: string[]): { commandName: string; commandArgs: string[] } {
  const args = argv.slice(2)
  const firstArg = args[0]?.trim()

  if (firstArg && hasTerminalCommand(firstArg)) {
    return {
      commandName: firstArg,
      commandArgs: args.slice(1),
    }
  }

  return {
    commandName: "onboard",
    commandArgs: args,
  }
}

async function main() {
  const { commandName, commandArgs } = resolveRequestedCommand(process.argv)
  const command = resolveTerminalCommand(commandName)
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  setRenderer(renderer)

  createRoot(renderer).render(command.render({
    commandArgs,
    executablePath: process.execPath,
  }))
}

main().catch((err) => {
  console.error("Iris Terminal 启动失败:", err)
  gracefulExit(1)
})
