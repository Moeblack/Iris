/**
 * OCR 配置解析
 */

export interface OCRConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  [key: string]: unknown;
}

export const OCR_DEFAULTS: Omit<OCRConfig, 'provider' | 'apiKey'> = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};

export function parseOCRConfig(raw: any): OCRConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }

  const provider = String(raw.provider ?? 'openai-compatible');

  return {
    ...raw,
    provider,
    apiKey: raw.apiKey ?? '',
    baseUrl: raw.baseUrl || OCR_DEFAULTS.baseUrl,
    model: raw.model || OCR_DEFAULTS.model,
  };
}
