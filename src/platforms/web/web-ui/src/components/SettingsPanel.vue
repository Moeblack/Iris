<template>
  <div
    class="overlay"
    @pointerdown.self="handleOverlayPointerDown"
    @pointerup.self="handleOverlayPointerUp"
    @pointercancel.self="resetOverlayCloseIntent"
  >
    <div class="settings-panel" @pointerdown="resetOverlayCloseIntent">
      <div class="settings-header">
        <div class="settings-title-group">
          <span class="settings-kicker">Control Center</span>
          <h2>设置中心</h2>
          <p>配置模型连接、系统策略与工具能力，打造你的 AI 工作台。</p>
          <p v-if="managementEnabled" class="field-hint" style="margin-top:6px">
            管理接口已启用令牌保护。当前状态：
            <strong :style="{ color: managementReady ? 'var(--success)' : 'var(--error)' }">{{ managementReady ? '已解锁' : '未解锁' }}</strong>
          </p>
        </div>
        <button class="btn-close" type="button" aria-label="关闭设置" @click="requestClose">
          <AppIcon :name="ICONS.common.close" />
        </button>
      </div>

      <div class="settings-body">
        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>模型与凭证</h3>
              <p>配置模型池，使用模型名称作为键，默认模型决定启动时的活动模型。</p>
            </div>
            <span class="settings-pill">LLM</span>
          </div>

          <div class="settings-grid two-columns" style="margin-bottom:16px">
            <div class="form-group">
              <label>默认模型</label>
              <select v-model="defaultModelName" :disabled="defaultModelOptions.length === 0">
                <option v-if="defaultModelOptions.length === 0" value="">请先填写模型名称</option>
                <option v-for="option in defaultModelOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <p class="field-hint">启动时默认使用这个模型名称。`/model` 也使用这个名称切换。</p>
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;justify-content:flex-end">
              <button class="btn-save" type="button" @click="addModelEntry">新增模型</button>
            </div>
          </div>

          <div v-for="(entry, index) in modelEntries" :key="entry.uid" class="tier-block">
            <div class="tier-header" @click="entry.open = !entry.open">
              <span class="tier-arrow" :class="{ open: entry.open }">▶</span>
              <span class="tier-label">{{ entry.modelName || `未命名模型 ${index + 1}` }}</span>
              <span class="tier-desc">{{ providerLabel(entry.provider) }} · {{ entry.modelId || '未填写模型 ID' }}</span>
              <span v-if="defaultModelName === entry.modelName && entry.modelName" class="settings-pill" style="margin-left:auto">默认</span>
              <button
                class="btn-inline-action"
                type="button"
                style="margin-left:8px"
                :disabled="modelEntries.length <= 1"
                @click.stop="removeModelEntry(index)"
              >
                删除
              </button>
            </div>
            <div v-show="entry.open" class="tier-body">
              <div class="settings-grid two-columns">
                <div class="form-group">
                  <label>模型名称</label>
                  <input type="text" v-model="entry.modelName" placeholder="例如：gemini_flash" />
                  <p class="field-hint">作为 llm.models 下的键，也作为 `/model` 的切换名称。</p>
                </div>
                <div class="form-group">
                  <label>LLM 提供商</label>
                  <select v-model="entry.provider" @change="handleModelProviderChange(entry)">
                    <option value="gemini">Gemini</option>
                    <option value="openai-compatible">OpenAI 兼容</option>
                    <option value="openai-responses">OpenAI Responses</option>
                    <option value="claude">Claude</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>模型 ID</label>
                  <div class="inline-field-actions">
                    <input type="text" v-model="entry.modelId" placeholder="例如：gpt-4o 或 gemini-2.0-flash" />
                    <button class="btn-inline-action" type="button"
                            :disabled="entry.modelCatalog.loading || (managementEnabled && !managementReady)"
                            @click="fetchModelOptions(index)">
                      {{ entry.modelCatalog.loading ? '拉取中...' : '拉取列表' }}
                    </button>
                  </div>
                  <select v-if="entry.modelCatalog.options.length > 0" v-model="entry.modelId" class="model-list-select">
                    <option value="">选择已发现的模型（也可继续手动输入）</option>
                    <option v-for="option in entry.modelCatalog.options" :key="option.id" :value="option.id">{{ option.label }}</option>
                  </select>
                  <p class="field-hint" :class="{ 'model-fetch-error': !!entry.modelCatalog.error }">{{ modelCatalogHint(entry) }}</p>
                </div>
                <div class="form-group full-width">
                  <label>API Key</label>
                  <input type="password" v-model="entry.apiKey" placeholder="输入或保留已有密钥" />
                  <p class="field-hint">{{ modelKeyHint(entry) }}</p>
                </div>
                <div class="form-group full-width">
                  <label>API 地址</label>
                  <input type="text" v-model="entry.baseUrl" placeholder="模型服务请求地址" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>系统行为</h3>
              <p>调节提示词、工具轮次与回复方式。</p>
            </div>
            <span class="settings-pill">System</span>
          </div>

          <div class="settings-grid two-columns">
            <div class="form-group full-width">
              <label>系统提示词</label>
              <textarea
                v-model="config.systemPrompt"
                rows="5"
                placeholder="输入系统提示词，定义你的默认协作风格"
              ></textarea>
            </div>

            <div class="form-group">
              <label>工具最大轮次</label>
              <input
                type="number"
                :value="maxToolRoundsInput"
                min="1"
                max="50"
                @input="handleMaxToolRoundsInput"
                @blur="syncMaxToolRoundsInput"
              />
            </div>

            <div class="settings-switch-row">
              <div>
                <span class="switch-label">流式输出</span>
                <p class="field-hint">{{ streamHint }}</p>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" v-model="config.stream" />
                <span class="toggle-switch-ui"></span>
              </label>
            </div>

            <div class="settings-switch-row">
              <div>
                <span class="switch-label">界面主题</span>
                <p class="field-hint">{{ themeHint }}</p>
              </div>
              <div class="theme-selector">
                <button
                  v-for="opt in themeOptions"
                  :key="opt.value"
                  class="theme-option"
                  :class="{ active: currentTheme === opt.value }"
                  type="button"
                  @click="setTheme(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>MCP 服务器</h3>
              <p>连接外部 MCP 服务器，自动将其工具注入 LLM 工具列表。</p>
            </div>
            <span class="settings-pill">{{ mcpServers.length }} 个服务器</span>
          </div>

          <div v-for="(server, idx) in mcpServers" :key="idx" class="tier-block">
            <div class="tier-header" @click="server.open = !server.open">
              <span class="tier-arrow" :class="{ open: server.open }">▶</span>
              <span class="tier-label">{{ server.name || '未命名' }}</span>
              <span class="tier-desc">{{ server.transport === 'stdio' ? '本地进程' : 'HTTP' }}</span>
              <label class="toggle-switch tier-toggle" @click.stop>
                <input type="checkbox" v-model="server.enabled" />
                <span class="toggle-switch-ui"></span>
              </label>
              <button class="btn-mcp-remove" type="button" @click.stop="removeMcpServer(idx)" title="删除服务器">
                <AppIcon :name="ICONS.common.close" />
              </button>
            </div>
            <div v-show="server.open" class="tier-body">
              <div class="settings-grid two-columns">
                <div class="form-group">
                  <label>服务器名称</label>
                  <input type="text" v-model="server.name" placeholder="仅字母、数字、下划线"
                         @input="sanitizeMcpName(server)" />
                </div>
                <div class="form-group">
                  <label>传输方式</label>
                  <select v-model="server.transport">
                    <option value="stdio">stdio（本地进程）</option>
                    <option value="http">HTTP（远程服务器）</option>
                  </select>
                </div>

                <template v-if="server.transport === 'stdio'">
                  <div class="form-group">
                    <label>命令</label>
                    <input type="text" v-model="server.command" placeholder="例如：npx" />
                  </div>
                  <div class="form-group">
                    <label>工作目录</label>
                    <input type="text" v-model="server.cwd" placeholder="可选" />
                  </div>
                  <div class="form-group full-width">
                    <label>参数（每行一个）</label>
                    <textarea v-model="server.args" rows="3"
                              placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/dir"></textarea>
                  </div>
                </template>

                <template v-if="server.transport === 'http'">
                  <div class="form-group full-width">
                    <label>URL</label>
                    <input type="text" v-model="server.url" placeholder="https://mcp.example.com/mcp" />
                  </div>
                  <div class="form-group full-width">
                    <label>Authorization</label>
                    <input type="password" v-model="server.authHeader" placeholder="Bearer your-token（可选）" />
                    <p v-if="server.authHeader.startsWith('****')" class="field-hint">已读取已保存值，保持不变则不会覆盖。</p>
                  </div>
                </template>

                <div class="form-group">
                  <label>超时（毫秒）</label>
                  <input
                    type="number"
                    :value="server.timeoutInput"
                    min="1000"
                    max="120000"
                    @input="handleMcpTimeoutInput(server, $event)"
                    @blur="syncMcpTimeoutInput(server)"
                  />
                </div>
              </div>
            </div>
          </div>

          <button class="btn-mcp-add" type="button" @click="addMcpServer">+ 添加 MCP 服务器</button>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>工具状态</h3>
              <p>当前挂载到模型上下文中的可用能力。</p>
            </div>
            <span class="settings-pill">{{ tools.length }} 个工具</span>
          </div>

          <div class="tools-list">
            <span v-for="tool in tools" :key="tool" class="tool-tag">{{ tool }}</span>
            <span v-if="tools.length === 0" class="text-muted">无已注册工具</span>
          </div>
        </section>

        <!-- Cloudflare 管理 -->
        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>Cloudflare 管理</h3>
              <p>{{ cf.connected ? '管理 DNS 记录与 SSL 配置。' : '连接 Cloudflare 以管理域名和安全策略。请先在「部署生成器」页完成 Nginx 配置。' }}</p>
              <p v-if="cf.tokenSource" class="field-hint" style="margin-top:6px">
                Token 来源：{{ cf.tokenSource === 'env' ? '环境变量' : (cf.tokenSource === 'file' ? '文件' : '配置文件明文') }}
              </p>
            </div>
            <span class="settings-pill" :style="{ background: cf.connected ? 'var(--success)' : undefined }">
              {{ cf.connected ? '已连接' : '未连接' }}
            </span>
          </div>

          <!-- 未配置：引导输入 token -->
          <div v-if="!cf.connected" class="settings-grid two-columns">
            <div class="form-group full-width cf-guide-steps">
              <p class="field-hint" style="line-height:1.8">
                <strong style="color:var(--text-secondary)">快速开始：</strong><br/>
                1. 打开
                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener"
                   style="color:var(--accent-cyan, var(--accent));text-decoration:underline">
                  Cloudflare API Tokens 页面
                </a>，点击 "Create Token"<br/>
                2. 选择 "Edit zone DNS" 模板，或自定义权限：<br/>
                <span style="padding-left:1.2em;display:inline-block">
                  Zone &gt; Zone &gt; Read，Zone &gt; DNS &gt; Edit，Zone &gt; Zone Settings &gt; Edit
                </span><br/>
                3. 将生成的 Token 粘贴到下方
              </p>
            </div>
            <div class="form-group full-width">
              <label>API Token</label>
              <input type="password" v-model="cf.tokenInput" placeholder="以 Bearer token 格式，例如 xyzABC123..." />
            </div>
            <div class="form-group full-width" style="display:flex;align-items:center;gap:12px">
              <button class="btn-save" type="button" :disabled="cf.loading" @click="handleCfSetup">
                {{ cf.loading ? '验证中...' : '连接' }}
              </button>
              <span v-if="cf.error" class="settings-status error">{{ cf.error }}</span>
            </div>
          </div>

          <!-- 已配置：zone 信息 + SSL + DNS -->
          <template v-if="cf.connected">
            <!-- 多 zone 选择器 -->
            <div v-if="cf.zones.length > 1" class="form-group">
              <label>选择域名</label>
              <select v-model="cf.activeZoneId" :disabled="cf.sslSaving" @change="handleZoneChange">
                <option v-for="zone in cf.zones" :key="zone.id" :value="zone.id">
                  {{ zone.name }} ({{ zone.status }})
                </option>
              </select>
            </div>

            <!-- 单 zone 卡片 -->
            <div v-else class="cf-zone-card" v-for="zone in cf.zones" :key="zone.id">
              <span class="cf-zone-name">{{ zone.name }}</span>
              <span class="cf-zone-status" :class="{ active: zone.status === 'active' }">
                {{ zone.status }}
              </span>
            </div>

            <!-- SSL 模式 -->
            <div class="settings-grid two-columns" style="margin-top:12px">
              <div class="form-group">
                <label>SSL 模式</label>
                <select v-model="cf.sslMode" :disabled="cf.sslLoading || cf.sslSaving" @change="handleSslChange">
                  <option value="unknown" disabled>Unknown — 无法读取当前状态</option>
                  <option value="off">Off — 不加密</option>
                  <option value="flexible">Flexible — 浏览器到 CF 加密</option>
                  <option value="full">Full — 全程加密（不验证源站证书）</option>
                  <option value="strict">Full (Strict) — 全程加密 + 验证源站证书</option>
                </select>
                <p class="field-hint">{{ cf.sslSaving ? '正在保存 SSL 模式...' : (cf.sslLoading ? '正在读取当前 SSL 模式...' : (sslHints[cf.sslMode] || '')) }}</p>
                <p v-if="!cf.sslLoading && (cf.sslMode === 'full' || cf.sslMode === 'strict')" class="field-hint" style="margin-top:4px;color:var(--accent-cyan, var(--accent))">
                  需要 Nginx 开启 HTTPS（443 端口 + SSL 证书），否则 CF 到源站连接会失败（521/525）。
                </p>
                <p v-if="!cf.sslLoading && cf.sslMode === 'flexible'" class="field-hint" style="margin-top:4px;color:var(--accent-cyan, var(--accent))">
                  Nginx 只需监听 80 端口即可，无需配置 SSL 证书。
                </p>
              </div>
              <div class="form-group" style="display:flex;align-items:flex-end">
                <span v-if="cf.sslMsg" class="settings-status" :class="{ error: cf.sslError }">{{ cf.sslMsg }}</span>
              </div>
            </div>

            <!-- DNS 记录 -->
            <div style="margin-top:16px">
              <label style="display:block;margin-bottom:8px;font-size:0.85rem;color:var(--text-secondary)">DNS 记录</label>
              <div class="cf-dns-table">
                <div class="cf-dns-header">
                  <span>类型</span><span>名称</span><span>内容</span><span>代理</span><span></span>
                </div>
                <div v-if="cf.dnsLoading" class="text-muted" style="padding:8px">加载中...</div>
                <div v-else-if="cf.dnsRecords.length === 0" class="text-muted" style="padding:8px">暂无记录</div>
                <div v-for="rec in cf.dnsRecords" :key="rec.id" class="cf-dns-row">
                  <span class="cf-dns-type">{{ rec.type }}</span>
                  <span class="cf-dns-name" :title="rec.name">{{ rec.name }}</span>
                  <span class="cf-dns-content" :title="rec.content">{{ rec.content }}</span>
                  <span>{{ rec.proxied ? 'ON' : 'OFF' }}</span>
                  <button class="btn-dns-delete" type="button" :disabled="cf.dnsSaving || cf.dnsDeletingId === rec.id" @click="confirmDnsDelete(rec)" title="删除" aria-label="删除 DNS 记录">
                    <AppIcon :name="ICONS.common.close" />
                  </button>
                </div>
              </div>

              <!-- 添加 DNS 记录 -->
              <div class="cf-dns-add">
                <select v-model="cf.newDns.type" class="cf-dns-add-type">
                  <option value="A">A</option>
                  <option value="AAAA">AAAA</option>
                  <option value="CNAME">CNAME</option>
                  <option value="MX">MX</option>
                  <option value="TXT">TXT</option>
                </select>
                <input type="text" v-model="cf.newDns.name" :placeholder="dnsNamePlaceholder" class="cf-dns-add-input" />
                <input type="text" v-model="cf.newDns.content" :placeholder="dnsContentPlaceholder" class="cf-dns-add-input" />
                <label class="cf-dns-add-proxied" :title="'开启后流量经过 Cloudflare CDN 代理，获得 DDoS 防护和缓存加速'">
                  <input type="checkbox" v-model="cf.newDns.proxied" :disabled="!dnsProxySupported" /> CDN 代理
                </label>
                <button class="btn-save" type="button" :disabled="cf.dnsSaving || !!cf.dnsDeletingId || cf.dnsLoading" style="padding:6px 14px;font-size:0.8rem" @click="handleDnsAdd">
                  添加
                </button>
              </div>
              <span v-if="cf.dnsMsg" class="settings-status" :class="{ error: cf.dnsError }" style="display:block;margin-top:6px">
                {{ cf.dnsMsg }}
              </span>
            </div>
          </template>
        </section>

        <div class="form-actions">
          <span v-if="saving" class="settings-status">自动保存中...</span>
          <span v-else-if="statusText" class="settings-status" :class="{ error: statusError }">
            {{ statusText }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { ICONS } from '../constants/icons'
import { useSettingsPanel } from '../features/settings/useSettingsPanel'

const emit = defineEmits<{ close: [] }>()

const {
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
} = useSettingsPanel({
  onClose: () => emit('close'),
})
</script>
