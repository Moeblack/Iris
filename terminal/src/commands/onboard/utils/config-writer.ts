/**
 * 配置文件生成器
 * 将用户在 onboard 中的选择写入运行时数据目录中的 configs/*.yaml。
 *
 * 模板文件从安装目录的 data/configs.example/ 读取，
 * 目标目录与主程序保持一致：IRIS_DATA_DIR/configs 或 ~/.iris/configs。
 *
 * 采用合并模式：读取已有配置，追加/更新字段，不丢失用户手动添加的内容。
 *
 * 跳过策略：
 * - LLM 三步（provider / apiKey / model）是一个整体，任何一步跳过则整个模型条目不写入 llm.yaml
 * - platform 跳过则不修改 platform.yaml 的 type 和平台子配置
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parse, stringify } from "yaml"
import { resolveOnboardPlatformOption } from "./platform-catalog.js"
import { resolveRuntimeConfigDir } from "./runtime-paths.js"

export interface OnboardConfig {
  provider: "gemini" | "openai-compatible" | "openai-responses" | "claude"
  apiKey: string
  model: string
  baseUrl: string
  modelName: string
  platform: string
  platformValues: Record<string, string | number | boolean>
}

export type SkippedSteps = Record<"provider" | "apiKey" | "model" | "platform", boolean>

export const PROVIDER_DEFAULTS: Record<
  string,
  { model: string; baseUrl: string; contextWindow: number }
> = {
  gemini: {
    model: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    contextWindow: 1048576,
  },
  "openai-compatible": {
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    contextWindow: 128000,
  },
  "openai-responses": {
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    contextWindow: 128000,
  },
  claude: {
    model: "claude-sonnet-4-20250514",
    baseUrl: "https://api.anthropic.com/v1",
    contextWindow: 200000,
  },
}

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  "openai-compatible": "OpenAI Compatible",
  "openai-responses": "OpenAI Responses",
  claude: "Anthropic Claude",
}

function readYamlSafe(filepath: string): Record<string, unknown> {
  try {
    if (!existsSync(filepath)) return {}
    const content = readFileSync(filepath, "utf-8")
    const parsed = parse(content)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function writeConfigs(installDir: string, config: OnboardConfig, skippedSteps: SkippedSteps): void {
  const configDir = resolveRuntimeConfigDir()
  const exampleDir = join(installDir, "data", "configs.example")

  mkdirSync(configDir, { recursive: true })

  if (existsSync(exampleDir)) {
    const exampleFiles = readdirSync(exampleDir).filter((file) => file.endsWith(".yaml"))
    for (const file of exampleFiles) {
      const target = join(configDir, file)
      if (!existsSync(target)) {
        copyFileSync(join(exampleDir, file), target)
      }
    }
  }

  const llmSkipped = skippedSteps.provider || skippedSteps.apiKey || skippedSteps.model
  if (!llmSkipped) {
    const llmPath = join(configDir, "llm.yaml")
    const existingLlm = readYamlSafe(llmPath)
    const modelKey = config.modelName || config.provider.replace(/-/g, "_")
    const existingModels = (existingLlm.models && typeof existingLlm.models === "object")
      ? existingLlm.models as Record<string, unknown>
      : {}

    const llmConfig = {
      ...existingLlm,
      defaultModel: modelKey,
      models: {
        ...existingModels,
        [modelKey]: {
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
        },
      },
    }
    writeYaml(llmPath, llmConfig, "LLM 配置（模型池）")
  }

  if (!skippedSteps.platform) {
    const platformPath = join(configDir, "platform.yaml")
    const existingPlatform = readYamlSafe(platformPath)
    const platformOption = resolveOnboardPlatformOption(installDir, config.platform)
    const existingSection = (existingPlatform[config.platform] && typeof existingPlatform[config.platform] === "object")
      ? existingPlatform[config.platform] as Record<string, unknown>
      : {}

    const mergedPlatformValues: Record<string, unknown> = {
      ...existingSection,
      ...config.platformValues,
    }

    const platformConfig: Record<string, unknown> = {
      ...existingPlatform,
      type: config.platform,
    }

    if (config.platform === "web") {
      platformConfig.web = {
        ...mergedPlatformValues,
        host: "0.0.0.0",
      }
    } else if (
      Object.keys(mergedPlatformValues).length > 0
      || (platformOption?.panelFields.length ?? 0) > 0
      || Object.keys(existingSection).length > 0
    ) {
      platformConfig[config.platform] = mergedPlatformValues
    }

    writeYaml(platformPath, platformConfig, "平台配置")
  }

  if (!existsSync(join(configDir, "system.yaml"))) {
    writeYaml(join(configDir, "system.yaml"), {
      systemPrompt: "",
      maxToolRounds: 200,
      stream: true,
    }, "系统配置")
  }

  if (!existsSync(join(configDir, "storage.yaml"))) {
    writeYaml(join(configDir, "storage.yaml"), {
      type: "json-file",
      dir: "./data/sessions",
    }, "存储配置")
  }
}

function writeYaml(filepath: string, data: unknown, header: string): void {
  const content = `# ${header}\n\n${stringify(data, { indent: 2 })}`
  writeFileSync(filepath, content, "utf-8")
}
