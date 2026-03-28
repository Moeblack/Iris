import type { CliRenderer } from "@opentui/core"

let renderer: CliRenderer | null = null

export function setRenderer(value: CliRenderer | null): void {
  renderer = value
}

export function getRenderer(): CliRenderer | null {
  return renderer
}

export function gracefulExit(code = 0): void {
  const currentRenderer = renderer
  if (currentRenderer) {
    renderer = null
    currentRenderer.destroy()
  }

  setTimeout(() => process.exit(code), 50)
}
