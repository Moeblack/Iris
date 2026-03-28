import type { ReactNode } from "react"

interface PageFrameProps {
  title: string
  description?: ReactNode
  actions?: Array<string | undefined>
  children: ReactNode
}

export function PageFrame({ title, description, actions = [], children }: PageFrameProps) {
  const visibleActions = actions.filter((action): action is string => typeof action === "string" && action.trim().length > 0)

  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text fg="#6c5ce7">
        <b>{title}</b>
      </text>

      {typeof description === "string"
        ? <text fg="#636e72">{description}</text>
        : description
          ? <box>{description}</box>
          : null}

      {children}

      {visibleActions.length > 0 && (
        <text fg="#636e72">{visibleActions.join("  |  ")}</text>
      )}
    </box>
  )
}
