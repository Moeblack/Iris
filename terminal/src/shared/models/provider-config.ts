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
