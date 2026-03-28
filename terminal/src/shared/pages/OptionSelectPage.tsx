import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import { gracefulExit } from "../runtime.js"
import { PageFrame } from "./PageFrame.js"

export interface OptionSelectItem {
  value: string
  label: string
  description?: string
}

interface OptionSelectPageProps {
  title: string
  description?: string
  options: OptionSelectItem[]
  onSelect: (value: string) => void
  onSkip?: () => void
  onBack?: () => void
  maxVisibleOptions?: number
  initialSelectedIndex?: number
}

export function OptionSelectPage({
  title,
  description,
  options,
  onSelect,
  onSkip,
  onBack,
  maxVisibleOptions = 7,
  initialSelectedIndex = 0,
}: OptionSelectPageProps) {
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex)

  let scrollStart = 0
  if (options.length > maxVisibleOptions) {
    scrollStart = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisibleOptions / 2), options.length - maxVisibleOptions))
  }
  const visibleOptions = options.slice(scrollStart, scrollStart + maxVisibleOptions)

  useKeyboard((key) => {
    if (key.name === "n" && key.ctrl) {
      onSkip?.()
      return
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((index) => Math.max(0, index - 1))
      return
    }

    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((index) => Math.min(options.length - 1, index + 1))
      return
    }

    if (key.name === "return") {
      const selected = options[selectedIndex]
      if (selected) {
        onSelect(selected.value)
      }
      return
    }

    if (key.name === "escape") {
      onBack?.()
      return
    }

    if (key.name === "q" || (key.name === "c" && key.ctrl)) {
      gracefulExit()
    }
  })

  return (
    <PageFrame
      title={title}
      description={description}
      actions={[
        "↑↓ 选择",
        "Enter 确认",
        onSkip ? "Ctrl+N 跳过此环节" : undefined,
        onBack ? "Esc 返回" : undefined,
      ]}
    >
      <box flexDirection="column" gap={0}>
        {scrollStart > 0 && (
          <text fg="#636e72">{`↑ 上方还有 ${scrollStart} 项`}</text>
        )}

        {visibleOptions.map((option, index) => {
          const realIndex = scrollStart + index
          const isSelected = realIndex === selectedIndex

          return (
            <box key={option.value} flexDirection="column" paddingLeft={1}>
              <text>
                <span fg={isSelected ? "#00b894" : "#636e72"}>
                  {isSelected ? "❯ " : "  "}
                </span>
                <span fg={isSelected ? "#dfe6e9" : "#b2bec3"}>
                  {isSelected ? <b>{option.label}</b> : option.label}
                </span>
              </text>
              {option.description && (
                <text>
                  <span fg="#636e72">{`    ${option.description}`}</span>
                </text>
              )}
            </box>
          )
        })}

        {scrollStart + maxVisibleOptions < options.length && (
          <text fg="#636e72">{`↓ 下方还有 ${options.length - scrollStart - maxVisibleOptions} 项`}</text>
        )}
      </box>
    </PageFrame>
  )
}
