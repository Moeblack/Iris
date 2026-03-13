/**
 * 会话管理组合式函数
 *
 * 模块级响应式状态，所有组件共享同一份数据。
 */

import { ref } from 'vue'
import * as api from '../api/client'
import type { SessionSummary } from '../api/types'

/** 会话摘要列表 */
const sessions = ref<SessionSummary[]>([])

/** 当前选中的会话 */
const currentSessionId = ref<string | null>(null)

/** 是否正在加载会话列表 */
const sessionsLoading = ref(false)

/** 会话列表加载错误 */
const sessionsError = ref('')

/** 当前会话列表请求版本号，用于丢弃过期响应 */
let loadVersion = 0

/** 当前进行中的会话列表请求控制器 */
let currentLoadController: AbortController | null = null

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function abortCurrentLoad() {
  if (currentLoadController) {
    currentLoadController.abort()
    currentLoadController = null
  }
}

export function useSessions() {
  async function loadSessions() {
    const version = ++loadVersion
    abortCurrentLoad()

    const controller = new AbortController()
    currentLoadController = controller
    sessionsLoading.value = true
    sessionsError.value = ''

    try {
      const data = await api.getSessions(controller.signal)
      if (version !== loadVersion || controller.signal.aborted) return
      sessions.value = data.sessions || []
    } catch (err) {
      if (version !== loadVersion || isAbortError(err)) return
      sessionsError.value = err instanceof Error ? err.message : '加载会话列表失败'
    } finally {
      if (version === loadVersion) {
        sessionsLoading.value = false
        if (currentLoadController === controller) {
          currentLoadController = null
        }
      }
    }
  }

  function newChat() {
    currentSessionId.value = null
  }

  function switchSession(id: string) {
    currentSessionId.value = id
  }

  async function removeSession(id: string) {
    await api.deleteSession(id)
    if (currentSessionId.value === id) {
      currentSessionId.value = null
    }
    await loadSessions()
  }

  return { sessions, currentSessionId, sessionsLoading, sessionsError, loadSessions, newChat, switchSession, removeSession }
}
