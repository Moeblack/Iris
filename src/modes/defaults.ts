/**
 * 内置默认模式
 */

import { ModeDefinition } from './types';

/** 默认模式名称 */
export const DEFAULT_MODE_NAME = 'normal';

/** 默认通用模式：不限制工具，不覆盖提示词 */
export const DEFAULT_MODE: ModeDefinition = {
  name: DEFAULT_MODE_NAME,
  description: '通用模式，使用全部工具和默认提示词',
};
