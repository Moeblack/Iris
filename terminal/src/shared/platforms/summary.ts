import type { InfoConfirmRow } from "../pages/index.js"
import type { PlatformOption } from "./catalog.js"

function buildValueState(
  value: string | number,
  options?: {
    skipped?: boolean
    emptyText?: string
  },
): Pick<InfoConfirmRow, "value" | "emptyText" | "emptyTone"> {
  const text = String(value).trim()

  if (text.length > 0) {
    return {
      value: text,
    }
  }

  if (options?.skipped) {
    return {
      emptyText: options.emptyText || "未填写",
      emptyTone: "warning",
    }
  }

  return {
    emptyText: "未填写",
    emptyTone: "muted",
  }
}

export function maskPlatformFieldValue(value: string | number | boolean, isPassword: boolean): string | number {
  const text = String(value ?? "")
  if (!isPassword) return text
  if (text.length === 0) return ""
  return text.length > 8
    ? text.slice(0, 4) + "••••" + text.slice(-4)
    : "••••••••"
}

export function buildPlatformSummaryRows(
  platformOption: PlatformOption | undefined,
  platformValues: Record<string, string | number | boolean>,
  skipped: boolean,
): InfoConfirmRow[] {
  if (!platformOption) return []

  return platformOption.panelFields.map((field) => {
    const configKey = field.configKey || field.key
    const value = platformValues[configKey] ?? ""
    return {
      label: field.label,
      ...buildValueState(maskPlatformFieldValue(value, field.type === "password"), {
        skipped,
        emptyText: "已跳过，待手动填写",
      }),
    }
  })
}
