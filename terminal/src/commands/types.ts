import type { ReactNode } from "react"

export interface TerminalCommandContext {
  commandArgs: string[]
  executablePath: string
}

export interface TerminalCommandDefinition {
  name: string
  title: string
  description?: string
  render(context: TerminalCommandContext): ReactNode
}
