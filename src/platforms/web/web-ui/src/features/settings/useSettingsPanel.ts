import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import {
  getConfig,
  updateConfig,
  getStatus,
  fetchConfigModels,
  cfGetStatus,
  cfSetup,
  cfListDns,
  cfAddDns,
  cfRemoveDns,
  cfGetSsl,
  cfSetSsl,
} from '../../api/client'
import type { CfDnsRecord, ConfigModelOption, CloudflareSslMode } from '../../api/types'
import { useTheme, type ThemeMode } from '../../composables/useTheme'
import { loadManagementToken, subscribeManagementTokenChange } from '../../utils/managementToken'

interface UseSettingsPanelOptions {
  onClose: () => void
}

export function useSettingsPanel(options: UseSettingsPanelOptions) {
  const managementEnabled = ref(false)
  const managementReady = ref(false)

  let unsubscribeManagementToken: (() => void) | null = null

  function refreshManagementState() {
    const token = loadManagementToken().trim()
    managementReady.value = !!token
  }

  // ============ 主题 ============
  const { theme: currentTheme, setTheme } = useTheme()

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'dark', label: '暗色' },
    { value: 'light', label: '浅色' },
    { value: 'system', label: '跟随系统' },
  ]

  const themeHint = computed(() => {
    const hints: Record<ThemeMode, string> = {
      dark: '使用深色背景，适合夜间和低光环境。',
      light: '使用浅色背景，适合日间和明亮环境。',
      system: '自动跟随操作系统的主题偏好设置。',
    }
    return hints[currentTheme.value]
  })

  const config = reactive({
    systemPrompt: '',
    maxToolRounds: 10,
    stream: true,
  })

  const maxToolRoundsInput = ref(String(config.maxToolRounds))

  interface ModelCatalogState {
    loading: boolean
    error: string
    options: ConfigModelOption[]
    baseUrl: string
    usedStoredApiKey: boolean
  }

  interface ModelEntry {
    uid: number
    open: boolean
    originalModelName: string
    provider: string
    apiKey: string
    modelName: string
    modelId: string
    baseUrl: string
    modelCatalog: ModelCatalogState
    modelCatalogRequestVersion: number
    lastProvider: string
  }

  let nextModelEntryUid = 1

  /** Provider 默认值，与 src/config/llm.ts DEFAULTS 保持一致 */
  const PROVIDER_DEFAULTS: Record<string, { model: string; baseUrl: string }> = {
    gemini: { model: 'gemini-2.0-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    'openai-compatible': { model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
    'openai-responses': { model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
    claude: { model: 'claude-sonnet-4-6', baseUrl: 'https://api.anthropic.com/v1' },
  }

  function createModelCatalogState(): ModelCatalogState {
    return {
      loading: false,
      error: '',
      options: [],
      baseUrl: '',
      usedStoredApiKey: false,
    }
  }

  function createModelEntry(provider = 'gemini', data: Partial<ModelEntry> = {}): ModelEntry {
    const defaults = PROVIDER_DEFAULTS[provider] ?? { model: '', baseUrl: '' }
    return {
      uid: nextModelEntryUid++,
      open: data.open ?? true,
      originalModelName: data.originalModelName ?? '',
      provider,
      apiKey: data.apiKey ?? '',
      modelName: data.modelName ?? '',
      modelId: data.modelId ?? defaults.model,
      baseUrl: data.baseUrl ?? defaults.baseUrl,
      modelCatalog: createModelCatalogState(),
      modelCatalogRequestVersion: 0,
      lastProvider: provider,
    }
  }

  function clampInteger(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.trunc(value)))
  }

  function syncMaxToolRoundsInput() {
    maxToolRoundsInput.value = String(config.maxToolRounds)
  }

  function handleMaxToolRoundsInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    maxToolRoundsInput.value = value

    if (!value.trim()) return

    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      config.maxToolRounds = clampInteger(parsed, 1, 50)
    }
  }

  const modelEntries = reactive<ModelEntry[]>([createModelEntry()])
  const defaultModelName = ref('')
  const modelOriginalNames = ref<string[]>([])

  /** 初始加载完成前抑制 provider watcher 的副作用 */
  let configLoaded = false

  function providerLabel(provider: string): string {
    const map: Record<string, string> = {
      gemini: 'Gemini',
      'openai-compatible': 'OpenAI 兼容',
      'openai-responses': 'OpenAI Responses',
      claude: 'Claude',
    }
    return map[provider] || provider
  }

  const defaultModelOptions = computed(() => {
    return modelEntries
      .map((entry, index) => {
        const value = entry.modelName.trim()
        return {
          value,
          label: value || `未命名模型 ${index + 1}`,
        }
      })
      .filter(option => !!option.value)
  })

  function syncDefaultModelName(newNames: string[], oldNames: string[] = []) {
    const normalizedNewNames = newNames.map(name => name.trim())
    if (normalizedNewNames.every(name => !name)) {
      defaultModelName.value = ''
      return
    }

    const current = defaultModelName.value.trim()
    if (current && normalizedNewNames.includes(current)) {
      defaultModelName.value = current
      return
    }

    const renamedIndex = oldNames.findIndex(name => name === current)
    if (renamedIndex >= 0 && normalizedNewNames[renamedIndex]) {
      defaultModelName.value = normalizedNewNames[renamedIndex]
      return
    }

    defaultModelName.value = normalizedNewNames.find(Boolean) || ''
  }

  watch(
    () => modelEntries.map(entry => entry.modelName.trim()),
    (newNames, oldNames) => {
      syncDefaultModelName(newNames, oldNames ?? [])
    },
  )

  function addModelEntry() {
    modelEntries.push(createModelEntry())
  }

  function removeModelEntry(index: number) {
    if (modelEntries.length <= 1) return
    const [removed] = modelEntries.splice(index, 1)
    if (removed && defaultModelName.value === removed.modelName.trim()) {
      syncDefaultModelName(modelEntries.map(entry => entry.modelName.trim()))
    }
  }

  function resetModelCatalog(entry: ModelEntry) {
    entry.modelCatalogRequestVersion += 1
    Object.assign(entry.modelCatalog, createModelCatalogState())
  }

  function handleModelProviderChange(entry: ModelEntry) {
    const oldDefaults = PROVIDER_DEFAULTS[entry.lastProvider] ?? { model: '', baseUrl: '' }
    const newDefaults = PROVIDER_DEFAULTS[entry.provider] ?? { model: '', baseUrl: '' }
    if (!entry.modelId || entry.modelId === oldDefaults.model) entry.modelId = newDefaults.model
    if (!entry.baseUrl || entry.baseUrl === oldDefaults.baseUrl) entry.baseUrl = newDefaults.baseUrl
    if (entry.apiKey.startsWith('****')) entry.apiKey = ''
    entry.lastProvider = entry.provider
    resetModelCatalog(entry)
  }

  function modelKeyHint(entry: ModelEntry): string {
    if (!entry.apiKey) return '未配置 API Key。'
    if (entry.apiKey.startsWith('****')) return '已读取已保存密钥，保持不变则不会覆盖。'
    return '将使用当前输入的密钥保存配置。'
  }

  function modelCatalogHint(entry: ModelEntry): string {
    const state = entry.modelCatalog
    if (state.error) return state.error
    if (managementEnabled.value && !managementReady.value) return '管理令牌未解锁，暂时无法拉取模型列表。'
    if (state.options.length > 0) {
      return `已从 ${state.baseUrl} 拉取 ${state.options.length} 个模型${state.usedStoredApiKey ? '（使用已保存 API Key）' : ''}。也可继续手动输入。`
    }
    return '填写 API 地址与 Key 后，可拉取模型列表，也可继续手动输入模型 ID。'
  }

  function normalizeApiKeyForLookup(apiKey: string): string | undefined {
    const trimmed = apiKey.trim()
    if (!trimmed || trimmed.startsWith('****')) return undefined
    return trimmed
  }

  async function fetchModelOptions(index: number) {
    const entry = modelEntries[index]
    if (!entry) return
    const state = entry.modelCatalog
    const requestVersion = ++entry.modelCatalogRequestVersion

    state.loading = true
    state.error = ''

    try {
      const result = await fetchConfigModels({
        modelName: entry.modelName.trim() || undefined,
        provider: entry.provider,
        baseUrl: entry.baseUrl,
        apiKey: normalizeApiKeyForLookup(entry.apiKey),
      })

      if (requestVersion !== entry.modelCatalogRequestVersion) return

      state.options = result.models
      state.baseUrl = result.baseUrl
      state.usedStoredApiKey = result.usedStoredApiKey

      if (result.models.length === 0) {
        state.error = '接口已连接，但没有返回可用模型。你仍可手动输入模型 ID。'
        return
      }

      if (!entry.modelId) {
        entry.modelId = result.models[0].id
      }
    } catch (err: any) {
      if (requestVersion !== entry.modelCatalogRequestVersion) return
      state.error = '拉取失败：' + (err?.message || '未知错误')
    } finally {
      if (requestVersion === entry.modelCatalogRequestVersion) {
        state.loading = false
      }
    }
  }

  watch(() => JSON.stringify(modelEntries.map(entry => ({ provider: entry.provider, baseUrl: entry.baseUrl, apiKey: entry.apiKey, modelName: entry.modelName }))), () => {
    if (!configLoaded) return
    modelEntries.forEach(entry => resetModelCatalog(entry))
  })

  const tools = ref<string[]>([])
  const statusText = ref('')
  const statusError = ref(false)
  const saving = ref(false)
  const dirty = ref(false)

  // ============ MCP ============
  interface MCPServerEntry {
    name: string
    transport: 'stdio' | 'http'
    command: string
    args: string // 每行一个参数，保存时转为 string[]
    cwd: string
    url: string
    authHeader: string // Authorization header 值
    timeout: number
    timeoutInput: string
    enabled: boolean
    open: boolean // UI 展开状态
  }

  const mcpServers = reactive<MCPServerEntry[]>([])
  /** 加载时记录的原始服务器名，用于保存时识别被删除的服务器 */
  const mcpOriginalNames = ref<string[]>([])

  function addMcpServer() {
    mcpServers.push({
      name: '', transport: 'stdio', command: '', args: '', cwd: '',
      url: '', authHeader: '', timeout: 30000, timeoutInput: '30000', enabled: true, open: true,
    })
  }

  function removeMcpServer(idx: number) {
    mcpServers.splice(idx, 1)
  }

  function syncMcpTimeoutInput(server: MCPServerEntry) {
    server.timeoutInput = String(server.timeout)
  }

  function handleMcpTimeoutInput(server: MCPServerEntry, event: Event) {
    const value = (event.target as HTMLInputElement).value
    server.timeoutInput = value

    if (!value.trim()) return

    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      server.timeout = clampInteger(parsed, 1000, 120000)
    }
  }

  function sanitizeMcpName(server: MCPServerEntry) {
    server.name = server.name.replace(/[^a-zA-Z0-9_]/g, '_')
  }

  function findDuplicateMcpNames(): string[] {
    const seen = new Set<string>()
    const duplicates = new Set<string>()

    for (const server of mcpServers) {
      const normalized = server.name.trim()
      if (!normalized) continue

      if (seen.has(normalized)) {
        duplicates.add(normalized)
        continue
      }

      seen.add(normalized)
    }

    return Array.from(duplicates)
  }

  function buildMCPPayload(): { payload: any; currentNames: string[] } {
    const servers: Record<string, any> = {}
    // 被删除的服务器发送 null（deepMerge 会删除该键）
    for (const name of mcpOriginalNames.value) {
      if (!mcpServers.some(s => s.name === name)) {
        servers[name] = null
      }
    }
    const currentNames: string[] = []
    for (const s of mcpServers) {
      if (!s.name.trim()) continue
      currentNames.push(s.name)
      const entry: any = {
        transport: s.transport,
        enabled: s.enabled,
        timeout: clampInteger(s.timeout || 30000, 1000, 120000),
      }
      if (s.transport === 'stdio') {
        entry.command = s.command
        entry.args = s.args.split('\n').map((a: string) => a.trim()).filter(Boolean)
        entry.cwd = s.cwd || null // 空值发 null 让 deepMerge 删除旧值
        entry.url = null
        entry.headers = null
      } else {
        entry.url = s.url
        entry.command = null
        entry.args = null
        entry.cwd = null
        if (s.authHeader && !s.authHeader.startsWith('****')) {
          entry.headers = { Authorization: s.authHeader }
        } else if (!s.authHeader) {
          entry.headers = null
        }
      }
      servers[s.name] = entry
    }

    return {
      payload: Object.keys(servers).length > 0 ? { servers } : null,
      currentNames,
    }
  }

  // ============ Cloudflare ============
  const cf = reactive({
    connected: false,
    configured: false,
    loading: false,
    tokenInput: '',
    error: '',
    zones: [] as { id: string; name: string; status: string }[],
    activeZoneId: null as string | null,
    tokenSource: null as 'inline' | 'env' | 'file' | null,
    // SSL
    sslMode: 'full' as CloudflareSslMode,
    sslSaving: false,
    sslLoading: false,
    sslMsg: '',
    sslError: false,
    // DNS
    dnsRecords: [] as CfDnsRecord[],
    dnsLoading: false,
    dnsSaving: false,
    dnsDeletingId: null as string | null,
    dnsMsg: '',
    dnsError: false,
    newDns: { type: 'A', name: '', content: '', proxied: true },
  })

  let cfDnsRequestVersion = 0
  let cfSslRequestVersion = 0
  let cfSslMutationVersion = 0

  const streamHint = computed(() => {
    return config.stream
      ? '回复会实时逐字显示，更适合长内容阅读。'
      : '回复会完整生成后一次性返回，更适合稳定复制。'
  })

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      void requestClose()
    }
  }

  const overlayCloseArmed = ref(false)

  function resetOverlayCloseIntent() {
    overlayCloseArmed.value = false
  }

  function handleOverlayPointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      overlayCloseArmed.value = false
      return
    }

    overlayCloseArmed.value = true
  }

  function handleOverlayPointerUp(event: PointerEvent) {
    const shouldClose = event.button === 0 && overlayCloseArmed.value
    overlayCloseArmed.value = false
    if (shouldClose) void requestClose()
  }

  async function requestClose() {
    if (saving.value) return

    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }

    if (dirty.value) {
      await handleSave()
      if (saving.value) return
      if (dirty.value && !saving.value) {
        const confirmedDiscard = window.confirm(
          `${statusText.value || '当前更改尚未成功保存。'}\n\n是否放弃未保存的更改并关闭设置？`,
        )
        if (!confirmedDiscard) return
      }
    }

    options.onClose()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    refreshManagementState()
    unsubscribeManagementToken = subscribeManagementTokenChange(refreshManagementState)
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    unsubscribeManagementToken?.()
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
  })

  // ============ 自动保存 ============
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleAutoSave() {
    if (!configLoaded) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    dirty.value = true
    autoSaveTimer = setTimeout(() => {
      if (saving.value) {
        scheduleAutoSave()
        return
      }
      handleSave()
    }, 1000)
  }

  watch(
    [
      () => config.systemPrompt,
      () => config.maxToolRounds,
      () => config.stream,
      () => defaultModelName.value,
      () => JSON.stringify(modelEntries.map(entry => ({ modelName: entry.modelName, provider: entry.provider, apiKey: entry.apiKey, modelId: entry.modelId, baseUrl: entry.baseUrl }))),
      // 排除 open（纯 UI 状态）
      () => JSON.stringify(mcpServers, (key, value) => (key === 'open' || key === 'timeoutInput') ? undefined : value),
    ],
    scheduleAutoSave,
  )

  function loadModelEntriesFromConfig(llm: any) {
    modelEntries.splice(0, modelEntries.length)
    modelOriginalNames.value = []

    if (llm?.models && typeof llm.models === 'object' && !Array.isArray(llm.models)) {
      for (const [name, cfg] of Object.entries(llm.models) as [string, any][]) {
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
        const provider = typeof cfg.provider === 'string' ? cfg.provider : 'gemini'
        modelEntries.push(createModelEntry(provider, {
          originalModelName: name,
          modelName: name,
          apiKey: cfg.apiKey || '',
          modelId: cfg.model || '',
          baseUrl: cfg.baseUrl || '',
          open: name === llm.defaultModel,
        }))
        modelOriginalNames.value.push(name)
      }
    }

    if (modelEntries.length === 0) {
      modelEntries.push(createModelEntry())
    }

    defaultModelName.value = typeof llm?.defaultModel === 'string' ? llm.defaultModel.trim() : ''
    syncDefaultModelName(modelEntries.map(entry => entry.modelName.trim()))
  }

  onMounted(async () => {
    try {
      refreshManagementState()
      const data = await getConfig()
      loadModelEntriesFromConfig(data.llm || {})

      config.systemPrompt = data.system?.systemPrompt || ''
      config.maxToolRounds = data.system?.maxToolRounds ?? 10
      syncMaxToolRoundsInput()
      config.stream = data.system?.stream ?? true

      // MCP
      if (data.mcp?.servers && typeof data.mcp.servers === 'object') {
        mcpOriginalNames.value = Object.keys(data.mcp.servers)
        for (const [name, cfg] of Object.entries(data.mcp.servers) as [string, any][]) {
          mcpServers.push({
            name,
            transport: cfg.transport || 'stdio',
            command: cfg.command || '',
            args: Array.isArray(cfg.args) ? cfg.args.join('\n') : '',
            cwd: cfg.cwd || '',
            url: cfg.url || '',
            authHeader: cfg.headers?.Authorization || '',
            timeout: cfg.timeout ?? 30000,
            timeoutInput: String(cfg.timeout ?? 30000),
            enabled: cfg.enabled !== false,
            open: false,
          })
        }
      }

      // 等待 provider watcher 的异步回调执行完毕后再启用副作用
      await nextTick()
      configLoaded = true
      dirty.value = false
      syncMaxToolRoundsInput()
    } catch (err: any) {
      configLoaded = true
      statusText.value = '加载配置失败: ' + (err?.message || '未知错误')
      statusError.value = true
      dirty.value = false
    }
    syncMaxToolRoundsInput()

    try {
      const status = await getStatus()
      tools.value = status.tools || []
      managementEnabled.value = !!status.managementProtected
    } catch {
      tools.value = []
    }
  })

  function buildModelEntryPayload(entry: ModelEntry): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      provider: entry.provider,
      model: entry.modelId,
      baseUrl: entry.baseUrl,
    }
    if (entry.apiKey && !entry.apiKey.startsWith('****')) {
      payload.apiKey = entry.apiKey
    }
    return payload
  }

  function validateModelEntries(): string | null {
    if (modelEntries.length === 0) return '至少需要保留一个模型'

    const names = new Set<string>()
    for (const entry of modelEntries) {
      const modelName = entry.modelName.trim()
      if (!modelName) return '模型名称不能为空'
      if (names.has(modelName)) return `模型名称重复：${modelName}`
      if (!entry.modelId.trim()) return `模型「${modelName}」缺少模型 ID`
      names.add(modelName)
    }

    if (!defaultModelName.value.trim()) return '默认模型不能为空'
    if (!names.has(defaultModelName.value.trim())) return `默认模型不存在：${defaultModelName.value}`

    return null
  }

  function buildLLMPayload(): { payload: Record<string, unknown>; currentNames: string[] } {
    const models: Record<string, unknown> = {}

    for (const originalName of modelOriginalNames.value) {
      if (!modelEntries.some(entry => entry.modelName.trim() === originalName)) {
        models[originalName] = null
      }
    }

    const currentNames: string[] = []
    for (const entry of modelEntries) {
      const modelName = entry.modelName.trim()
      if (!modelName) continue
      currentNames.push(modelName)
      if (entry.originalModelName && entry.originalModelName !== modelName) {
        models[entry.originalModelName] = null
      }
      models[modelName] = buildModelEntryPayload(entry)
    }

    return {
      payload: { defaultModel: defaultModelName.value.trim(), models },
      currentNames,
    }
  }

  async function handleSave() {
    if (saving.value) return

    saving.value = true
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }

    statusText.value = ''
    statusError.value = false

    const duplicateMcpNames = findDuplicateMcpNames()
    if (duplicateMcpNames.length > 0) {
      statusText.value = `保存失败: MCP 服务器名称重复（${duplicateMcpNames.join('、')}）`
      statusError.value = true
      saving.value = false
      return
    }

    const modelValidationError = validateModelEntries()
    if (modelValidationError) {
      statusText.value = '保存失败: ' + modelValidationError
      statusError.value = true
      saving.value = false
      return
    }

    try {
      const { payload: llmPayload, currentNames: currentModelNames } = buildLLMPayload()

      const { payload: mcpPayload, currentNames } = buildMCPPayload()
      const payload: Record<string, any> = {
        llm: llmPayload,
        system: {
          systemPrompt: config.systemPrompt,
          maxToolRounds: config.maxToolRounds,
          stream: config.stream,
        },
      }
      if (mcpPayload !== null) {
        payload.mcp = mcpPayload
      }
      const result = await updateConfig(payload)

      if (result.ok) {
        statusText.value = result.restartRequired ? '已保存，需要重启生效' : '已保存并生效'
        statusError.value = false
        modelOriginalNames.value = currentModelNames
        mcpOriginalNames.value = currentNames
        dirty.value = false
        for (const entry of modelEntries) {
          entry.originalModelName = entry.modelName.trim()
        }

        // 热重载后刷新工具列表（MCP 开关会影响工具数量）
        try {
          const st = await getStatus()
          tools.value = st.tools || []
        } catch {
          // 静默
        }
      } else {
        statusText.value = '保存失败: ' + (result.error || '未知错误')
        statusError.value = true
        dirty.value = true
      }
    } catch (err: any) {
      statusText.value = '保存失败: ' + err.message
      statusError.value = true
      dirty.value = true
    } finally {
      saving.value = false
    }
  }

  // ============ Cloudflare 辅助 ============

  const sslHints: Record<string, string> = {
    off: '所有连接均不加密，不推荐使用。',
    flexible: '浏览器到 Cloudflare 加密，Cloudflare 到源站不加密。适合源站无证书时临时使用。',
    full: '全程 HTTPS，但不验证源站证书。适合自签名证书场景。',
    strict: '全程 HTTPS 且验证源站证书合法性。推荐生产环境使用。',
  }

  const dnsNamePlaceholder = computed(() => {
    const m: Record<string, string> = {
      A: '例如：www 或 @ (根域名)',
      AAAA: '例如：www 或 @ (根域名)',
      CNAME: '例如：blog',
      MX: '例如：@ (根域名)',
      TXT: '例如：@ (根域名)',
    }
    return m[cf.newDns.type] || '子域名或 @'
  })

  const dnsContentPlaceholder = computed(() => {
    const m: Record<string, string> = {
      A: '例如：1.2.3.4 (IPv4 地址)',
      AAAA: '例如：2001:db8::1 (IPv6 地址)',
      CNAME: '例如：example.com',
      MX: '例如：mail.example.com',
      TXT: '例如：v=spf1 include:...',
    }
    return m[cf.newDns.type] || '记录值'
  })

  const dnsProxySupported = computed(() => ['A', 'AAAA', 'CNAME'].includes(cf.newDns.type))

  watch(() => cf.newDns.type, (type) => {
    if (!['A', 'AAAA', 'CNAME'].includes(type)) cf.newDns.proxied = false
  })

  // ============ Cloudflare 方法 ============

  async function loadCfStatus() {
    try {
      const status = await cfGetStatus()
      cf.configured = status.configured
      cf.error = status.error || ''
      cf.connected = status.connected
      cf.zones = status.zones || []
      cf.activeZoneId = status.activeZoneId
      cf.tokenSource = status.tokenSource || null

      // 多 zone 且未指定时，自动选第一个
      if (!cf.activeZoneId && cf.zones.length > 0) {
        cf.activeZoneId = cf.zones[0].id
      }

      if (status.connected) {
        await Promise.all([loadCfDns(), loadCfSsl()])
      } else {
        cfDnsRequestVersion += 1
        cfSslRequestVersion += 1
        cfSslMutationVersion += 1
        cf.dnsRecords = []
        cf.dnsSaving = false
        cf.dnsDeletingId = null
        cf.dnsMsg = ''
        cf.dnsError = false
        cf.sslMode = 'unknown'
        cf.sslSaving = false
        committedSslMode = 'unknown'
        cf.sslLoading = false
        cf.sslMsg = ''
        cf.sslError = false
      }
    } catch (err: any) {
      cfDnsRequestVersion += 1
      cfSslRequestVersion += 1
      cfSslMutationVersion += 1
      cf.connected = false
      cf.error = err?.message || '加载 Cloudflare 状态失败'
      cf.dnsRecords = []
      cf.dnsSaving = false
      cf.dnsDeletingId = null
      cf.sslMode = 'unknown'
      cf.sslSaving = false
      committedSslMode = 'unknown'
      cf.sslLoading = false
    }
  }

  async function loadCfDns() {
    const requestVersion = ++cfDnsRequestVersion
    const zoneId = cf.activeZoneId
    cf.dnsMsg = ''
    cf.dnsError = false
    cf.dnsLoading = true
    try {
      const result = await cfListDns(zoneId)
      if (requestVersion !== cfDnsRequestVersion) return
      cf.dnsRecords = result.records || []
    } catch (err: any) {
      if (requestVersion !== cfDnsRequestVersion) return
      cf.dnsRecords = []
      cf.dnsMsg = '加载 DNS 记录失败: ' + err.message
      cf.dnsError = true
    } finally {
      if (requestVersion === cfDnsRequestVersion) {
        cf.dnsLoading = false
      }
    }
  }

  let committedSslMode: CloudflareSslMode = 'full'

  async function loadCfSsl() {
    const requestVersion = ++cfSslRequestVersion
    const zoneId = cf.activeZoneId
    cf.sslLoading = true
    cf.sslMsg = ''
    cf.sslError = false
    try {
      const result = await cfGetSsl(zoneId)
      if (requestVersion !== cfSslRequestVersion) return

      const nextMode = ['off', 'flexible', 'full', 'strict', 'unknown'].includes(result.mode)
        ? (result.mode as CloudflareSslMode)
        : 'full'

      cf.sslMode = nextMode
      committedSslMode = nextMode
    } catch (err: any) {
      if (requestVersion !== cfSslRequestVersion) return
      cf.sslMode = 'unknown'
      committedSslMode = 'unknown'
      cf.sslMsg = '读取当前 SSL 模式失败：' + (err?.message || '未知错误')
      cf.sslError = true
    } finally {
      if (requestVersion === cfSslRequestVersion) {
        cf.sslLoading = false
      }
    }
  }

  async function handleCfSetup() {
    if (!cf.tokenInput.trim()) {
      cf.error = '请输入 Token'
      return
    }
    cf.loading = true
    cf.error = ''
    try {
      const result = await cfSetup(cf.tokenInput.trim())
      if (result.ok) {
        cf.tokenInput = ''
        await loadCfStatus()
      } else {
        cf.error = result.error || '连接失败'
      }
    } catch (err: any) {
      cf.error = err.message
    } finally {
      cf.loading = false
    }
  }

  async function handleSslChange() {
    if (cf.sslMode === 'unknown' || cf.sslLoading || cf.sslSaving) return
    const requestVersion = ++cfSslMutationVersion
    const zoneId = cf.activeZoneId
    const targetMode = cf.sslMode as CloudflareSslMode
    const previousMode = committedSslMode
    cf.sslMsg = ''
    cf.sslError = false
    cf.sslSaving = true
    try {
      await cfSetSsl(targetMode, zoneId)
      if (requestVersion !== cfSslMutationVersion || zoneId !== cf.activeZoneId) return
      committedSslMode = targetMode
      cf.sslMode = targetMode
      cf.sslMsg = 'SSL 模式已更新'
    } catch (err: any) {
      if (requestVersion !== cfSslMutationVersion) return
      committedSslMode = previousMode
      if (zoneId === cf.activeZoneId) {
        cf.sslMode = previousMode
      }
      cf.sslMsg = '更新失败: ' + err.message
      cf.sslError = true
    } finally {
      if (requestVersion === cfSslMutationVersion) cf.sslSaving = false
    }
  }

  async function handleDnsAdd() {
    if (cf.dnsSaving || cf.dnsDeletingId) return
    if (!dnsProxySupported.value) cf.newDns.proxied = false
    if (!cf.newDns.name || !cf.newDns.content) {
      cf.dnsMsg = '名称和内容不能为空'
      cf.dnsError = true
      return
    }
    cf.dnsMsg = ''
    cf.dnsError = false
    cf.dnsSaving = true
    try {
      await cfAddDns({ ...cf.newDns }, cf.activeZoneId)
      cf.newDns.name = ''
      cf.newDns.content = ''
      await loadCfDns()
      if (!cf.dnsError) {
        cf.dnsMsg = '添加成功'
      }
    } catch (err: any) {
      cf.dnsMsg = '添加失败: ' + err.message
      cf.dnsError = true
    } finally {
      cf.dnsSaving = false
    }
  }

  function confirmDnsDelete(rec: CfDnsRecord) {
    if (!confirm(`确认删除 DNS 记录？\n\n${rec.type}  ${rec.name}  →  ${rec.content}`)) return
    handleDnsDelete(rec.id)
  }

  async function handleDnsDelete(id: string) {
    if (cf.dnsSaving || cf.dnsDeletingId) return
    cf.dnsMsg = ''
    cf.dnsError = false
    cf.dnsDeletingId = id
    try {
      await cfRemoveDns(id, cf.activeZoneId)
      cf.dnsRecords = cf.dnsRecords.filter(r => r.id !== id)
      cf.dnsMsg = '已删除'
    } catch (err: any) {
      cf.dnsMsg = '删除失败: ' + err.message
      cf.dnsError = true
    } finally {
      if (cf.dnsDeletingId === id) {
        cf.dnsDeletingId = null
      }
    }
  }

  async function handleZoneChange() {
    // 多 zone 场景下切换 zone 后重新加载 DNS 和 SSL
    cf.dnsMsg = ''
    cf.dnsError = false
    cfSslMutationVersion += 1
    cf.sslSaving = false
    cf.sslMsg = ''
    cf.sslError = false
    await Promise.all([loadCfDns(), loadCfSsl()])
  }

  // 初始化加载 CF 状态
  onMounted(() => loadCfStatus())

  return {
    managementEnabled,
    managementReady,
    currentTheme,
    setTheme,
    themeOptions,
    themeHint,
    config,
    maxToolRoundsInput,
    handleMaxToolRoundsInput,
    syncMaxToolRoundsInput,
    defaultModelName,
    defaultModelOptions,
    modelEntries,
    providerLabel,
    addModelEntry,
    removeModelEntry,
    handleModelProviderChange,
    fetchModelOptions,
    modelCatalogHint,
    modelKeyHint,
    tools,
    statusText,
    statusError,
    saving,
    mcpServers,
    addMcpServer,
    removeMcpServer,
    syncMcpTimeoutInput,
    handleMcpTimeoutInput,
    sanitizeMcpName,
    cf,
    streamHint,
    resetOverlayCloseIntent,
    handleOverlayPointerDown,
    handleOverlayPointerUp,
    requestClose,
    sslHints,
    dnsNamePlaceholder,
    dnsContentPlaceholder,
    dnsProxySupported,
    handleCfSetup,
    handleSslChange,
    handleDnsAdd,
    confirmDnsDelete,
    handleZoneChange,
  }
}
