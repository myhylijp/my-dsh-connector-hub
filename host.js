/**
 * Connector hub — Host half.
 *
 * 连接器 = 这份部署的外部服务入口，两类：
 *   - `mcp`  : streamable-http 的 MCP 服务，交给 mcpManager 托管（连接/重连/工具注册）
 *   - `rest` : 普通 RESTful API 基地址，只登记地址与请求头，供后续插件（如知识库）读取
 *
 * 清单存在 `<dshHome>/connector-hub/connectors.json`，页面可增删改；每一条 `mcp` 连接器
 * 都会通过 `mcpManager.register()` 挂成 MCP 客户端，改完即时生效、不需要重启。
 *
 * Client 半边通过本插件私有的 `/api/connector-hub` 路由读写：`snapshot`、`probe`、`save`、`reset`。
 *
 * @param {object} ctx - 本行所在的 Cordis 上下文。
 * @param {object} [config] - 本行配置；`defaults` 是首次运行时的初始连接器。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'connector-hub'

/** Client 页面读取的私有路由。 */
const HTTP_PATH = '/api/connector-hub'
/** Host 构建标记，页脚用它确认页面连的是哪份 Host half。 */
const HOST_REVISION = '2026-11-15.1'
/** MCP 探测超时。 */
const PROBE_TIMEOUT_MS = 20000
/** REST 探测超时。 */
const REST_PROBE_TIMEOUT_MS = 10000
/** 探测时最多带回多少条工具（含说明）。 */
const MAX_TOOLS = 200
/** 单条工具说明截断长度。 */
const MAX_TOOL_DESCRIPTION = 300

/**
 * 取一个可选服务：服务缺席不是错误。
 * @param {object} ctx - 插件上下文。
 * @param {string} key - 服务名。
 * @returns {object | undefined} 服务实例。
 */
function readService(ctx, key) {
  try {
    return ctx.get?.(key)
  } catch {
    return undefined
  }
}

/**
 * 描述一个异常。
 * @param {unknown} error - 任意异常。
 * @returns {string} 可读文本。
 */
function describe(error) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}

/**
 * 连接器名字：MCP 的 serverName 只接受小写字母、数字和短横线。
 * @param {unknown} value - 输入。
 * @returns {string} 规范化后的名字。
 */
function normalizeName(value) {
  const raw = typeof value === 'string' ? value : ''
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug === '' ? 'connector' : slug.slice(0, 40)
}

/**
 * 连接类型归一化。
 * @param {unknown} value - 输入。
 * @returns {'mcp' | 'rest'} 类型。
 */
function normalizeKind(value) {
  return value === 'rest' ? 'rest' : 'mcp'
}

export function apply(ctx, config) {
  try {
    start(ctx, config)
  } catch (error) {
    console.error(`connector-hub: 激活失败：${describe(error)}\n${error instanceof Error ? error.stack : ''}`)
    throw error
  }
}

/**
 * 注册路由、维护清单、把启用的 MCP 连接器交给管理器。
 * @param {object} ctx - 插件上下文。
 * @param {object} [config] - 本行配置。
 */
function start(ctx, config) {
  const home = process.env.DSH_HOME && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh')
  const storeDir = path.join(home, 'connector-hub')
  const storeFile = path.join(storeDir, 'connectors.json')

  /** @type {Array<object>} */
  let connectors = []
  /** @type {Map<string, {dispose: Function, signature: string}>} */
  const registered = new Map()
  /** @type {Map<string, any>} */
  const probeCache = new Map()
  const managerRef = { value: undefined }
  const manager = () => managerRef.value

  /** 一条清单项（统一字段）。 */
  const entryOfItem = (item) => ({
    name: normalizeName(item?.name),
    title: typeof item?.title === 'string' ? item.title : '',
    kind: normalizeKind(item?.kind),
    url: typeof item?.url === 'string' ? item.url.trim() : '',
    headers: item?.headers !== null && typeof item?.headers === 'object' ? { ...item.headers } : {},
    enabled: item?.enabled !== false,
  })

  /** 默认清单（首启种子 + 内置基准）。 */
  const defaultsOf = () => {
    const list = Array.isArray(config?.defaults) ? config.defaults : []
    return list.map(item => ({
      ...entryOfItem(item),
      builtin: item?.builtin !== false,
    }))
  }

  /** 按名字索引的默认连接器。 */
  const defaultsByName = () => new Map(defaultsOf().map(item => [item.name, item]))

  /** 与默认值比较：类型/标题/地址/请求头/启用状态任一不同即为被改过。 */
  const isDirty = (connector) => {
    const preset = defaultsByName().get(connector.name)
    if (preset === undefined) return false
    return preset.kind !== connector.kind
      || preset.title !== connector.title
      || preset.url !== connector.url
      || preset.enabled !== connector.enabled
      || JSON.stringify(preset.headers ?? {}) !== JSON.stringify(connector.headers ?? {})
  }

  /** 落盘。 */
  const saveToDisk = () => {
    fs.mkdirSync(storeDir, { recursive: true })
    fs.writeFileSync(storeFile, `${JSON.stringify({ version: 2, connectors }, null, 2)}\n`, 'utf8')
  }

  /** 内置项补齐 + 已下线的内置项降级为普通连接器。 */
  const ensureBuiltins = () => {
    let changed = false
    const defaults = defaultsOf()
    const names = new Set(defaults.filter(item => item.builtin).map(item => item.name))
    for (const preset of defaults) {
      if (!preset.builtin) continue
      const existing = connectors.find(c => c.name === preset.name)
      if (existing === undefined) {
        connectors.push(preset)
        changed = true
      } else if (existing.builtin !== true) {
        existing.builtin = true
        changed = true
      }
    }
    // 安装包不再提供的「内置」项：降级为普通连接器，用户可以自行删除
    for (const connector of connectors) {
      if (connector.builtin === true && !names.has(connector.name)) {
        connector.builtin = false
        changed = true
      }
    }
    if (changed) saveToDisk()
  }

  /** 读盘；文件不存在时用默认清单并落盘。 */
  const load = () => {
    try {
      if (fs.existsSync(storeFile)) {
        const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
        connectors = (Array.isArray(parsed?.connectors) ? parsed.connectors : []).map(item => ({
          ...entryOfItem(item),
          builtin: item?.builtin === true,
        }))
        ensureBuiltins()
        return
      }
    } catch (error) {
      console.error(`connector-hub: 读取清单失败，改用默认值：${describe(error)}`)
    }
    connectors = defaultsOf()
    saveToDisk()
  }

  /** 给 mcpManager 的配置。 */
  const managerEntryOf = (connector) => ({
    transport: 'streamable-http',
    url: connector.url,
    headers: connector.headers,
    enabled: connector.enabled,
    toolCallTimeoutMs: 120000,
    closeTimeoutMs: 10000,
  })

  /** 把清单同步给 MCP 管理器：只有 mcp 类型的启用项才注册。 */
  const reconcile = () => {
    const mgr = manager()
    if (mgr === undefined || typeof mgr.register !== 'function') return
    const wanted = new Map(connectors
      .filter(c => c.enabled && c.kind === 'mcp')
      .map(c => [c.name, c]))
    for (const [name, record] of [...registered]) {
      if (wanted.has(name)) continue
      try {
        record.dispose()
      } catch (error) {
        console.error(`connector-hub: 注销 ${name} 失败：${describe(error)}`)
      }
      registered.delete(name)
      probeCache.delete(name)
    }
    for (const [name, connector] of wanted) {
      const signature = JSON.stringify(managerEntryOf(connector))
      const existing = registered.get(name)
      if (existing !== undefined && existing.signature === signature) continue
      if (existing !== undefined) {
        try {
          existing.dispose()
        } catch (error) {
          console.error(`connector-hub: 重注册前注销 ${name} 失败：${describe(error)}`)
        }
        registered.delete(name)
        probeCache.delete(name)
      }
      try {
        registered.set(name, { dispose: mgr.register(name, managerEntryOf(connector)), signature })
      } catch (error) {
        console.error(`connector-hub: 注册 ${name} 失败：${describe(error)}`)
      }
    }
  }

  /** 管理器里的状态。 */
  const statuses = () => {
    const mgr = manager()
    if (mgr === undefined || typeof mgr.list !== 'function') return {}
    try {
      return Object.fromEntries(mgr.list().map(row => [row.name, row.status]))
    } catch {
      return {}
    }
  }

  /** 页面快照。 */
  const snapshot = () => {
    const status = statuses()
    return {
      revision: HOST_REVISION,
      manager: manager() !== undefined,
      connectors: connectors.map(connector => ({
        name: connector.name,
        title: connector.title,
        kind: connector.kind,
        url: connector.url,
        headers: connector.headers,
        headerCount: Object.keys(connector.headers ?? {}).length,
        enabled: connector.enabled,
        builtin: connector.builtin === true,
        dirty: isDirty(connector),
        status: status[connector.name] ?? { state: 'unknown' },
        probe: probeCache.get(connector.name) ?? null,
      })),
    }
  }

  /**
   * MCP：initialize → notifications/initialized → tools/list。
   * @param {string} url - 目标地址。
   * @param {Record<string,string>} headers - 额外请求头。
   * @returns {Promise<object>} 结果（含工具名与说明）。
   */
  const probeMcp = async (url, headers) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    const call = async (body, sessionId) => {
      const requestHeaders = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      }
      if (sessionId) requestHeaders['mcp-session-id'] = sessionId
      const response = await fetch(url, {
        method: 'POST', headers: requestHeaders, body: JSON.stringify(body), signal: controller.signal,
      })
      const text = await response.text()
      let payload = null
      const jsonLine = text.trim().startsWith('{')
        ? text
        : (text.split(/\r?\n/).filter(line => line.startsWith('data:')).pop() ?? '').slice(5).trim()
      try {
        payload = jsonLine === '' ? null : JSON.parse(jsonLine)
      } catch {
        payload = null
      }
      return { response, payload }
    }
    try {
      const init = await call({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'my-dsh-connector-hub', version: '0.1.0' },
        },
      })
      if (!init.response.ok) return { ok: false, status: init.response.status, error: `initialize HTTP ${init.response.status}` }
      const sessionId = init.response.headers.get('mcp-session-id') ?? undefined
      const serverName = init.payload?.result?.serverInfo?.name ?? ''
      await call({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId).catch(() => undefined)
      const listed = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId)
      const raw = Array.isArray(listed.payload?.result?.tools) ? listed.payload.result.tools : []
      const tools = raw.slice(0, MAX_TOOLS).map(tool => ({
        name: typeof tool?.name === 'string' ? tool.name : '',
        description: typeof tool?.description === 'string'
          ? tool.description.slice(0, MAX_TOOL_DESCRIPTION)
          : '',
      }))
      return {
        ok: true,
        kind: 'mcp',
        status: init.response.status,
        serverName,
        toolCount: raw.length,
        tools,
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      return { ok: false, error: aborted ? `探测超时（${PROBE_TIMEOUT_MS}ms）` : describe(error) }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * RESTful：发一个 GET，证明地址可达并回传 HTTP 状态与内容类型。
   * @param {string} url - 基地址。
   * @param {Record<string,string>} headers - 请求头。
   * @returns {Promise<object>} 结果。
   */
  const probeRest = async (url, headers) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REST_PROBE_TIMEOUT_MS)
    try {
      const response = await fetch(url, { method: 'GET', headers, signal: controller.signal })
      // 「可达」= 服务回了 HTTP 响应；基地址常常没有对应资源（404），不能据此判定不可达。
      // 只有 5xx 视为服务异常，网络错误/超时才算彻底不可达。
      return {
        ok: response.status < 500,
        kind: 'rest',
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      return { ok: false, error: aborted ? `探测超时（${REST_PROBE_TIMEOUT_MS}ms）` : describe(error) }
    } finally {
      clearTimeout(timer)
    }
  }

  /** 按类型探测。 */
  const probe = (connector) => {
    if (connector === undefined) return Promise.resolve({ ok: false, error: '没有可探测的地址' })
    if (typeof connector.url !== 'string' || connector.url === '') {
      return Promise.resolve({ ok: false, error: '没有可探测的地址' })
    }
    return connector.kind === 'rest'
      ? probeRest(connector.url, connector.headers)
      : probeMcp(connector.url, connector.headers)
  }

  /** 保存页面提交的清单。 */
  const save = (payload) => {
    const list = Array.isArray(payload?.connectors) ? payload.connectors : []
    const builtins = connectors.filter(c => c.builtin === true).map(c => c.name)
    const submitted = new Set(list.map(item => normalizeName(item?.name)))
    for (const name of builtins) {
      if (!submitted.has(name)) throw new Error(`「${name}」是内置连接器，不能删除`)
    }
    const next = []
    const seen = new Set()
    for (const item of list) {
      const base = entryOfItem(item)
      if (seen.has(base.name)) throw new Error(`连接器名字重复：${base.name}`)
      seen.add(base.name)
      if (base.url === '') throw new Error(`连接器 ${base.name} 缺少地址`)
      // 内置连接器的类型与名字不允许改
      if (builtins.includes(base.name)) {
        const current = connectors.find(c => c.name === base.name)
        if (current !== undefined) base.kind = current.kind
      }
      next.push({ ...base, builtin: builtins.includes(base.name) })
    }
    connectors = next
    saveToDisk()
    reconcile()
    return snapshot()
  }

  /** 恢复一条内置连接器的配置到 defaults。 */
  const reset = (name) => {
    const target = connectors.find(c => c.name === normalizeName(name))
    if (target === undefined) throw new Error(`没有这个连接器：${name}`)
    if (target.builtin !== true) throw new Error('只有内置连接器可以恢复默认')
    const preset = defaultsByName().get(target.name)
    if (preset === undefined) throw new Error('这条连接器没有默认值')
    target.kind = preset.kind
    target.title = preset.title
    target.url = preset.url
    target.headers = { ...preset.headers }
    target.enabled = preset.enabled
    saveToDisk()
    reconcile()
    return snapshot()
  }

  load()
  reconcile()

  const handleHttp = async (request) => {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } })
    }
    let body
    try {
      body = await request.json()
    } catch {
      return Response.json({ ok: false, error: { code: 'connector-hub/bad-request', message: '请求体不是 JSON' } }, { status: 400 })
    }
    const op = typeof body?.op === 'string' ? body.op : ''
    const payload = body?.payload !== null && typeof body?.payload === 'object' ? body.payload : {}
    try {
      if (op === 'snapshot') return Response.json({ ok: true, value: snapshot() }, { headers: { 'cache-control': 'no-store' } })
      if (op === 'probe') {
        const target = connectors.find(c => c.name === normalizeName(payload.name))
        const result = await probe(target)
        if (target !== undefined) probeCache.set(target.name, result)
        return Response.json({ ok: true, value: result }, { headers: { 'cache-control': 'no-store' } })
      }
      if (op === 'save') return Response.json({ ok: true, value: save(payload) }, { headers: { 'cache-control': 'no-store' } })
      if (op === 'reset') return Response.json({ ok: true, value: reset(payload.name) }, { headers: { 'cache-control': 'no-store' } })
      return Response.json({ ok: false, error: { code: 'connector-hub/unknown-op', message: `未知操作 "${op}"` } }, { status: 400 })
    } catch (error) {
      return Response.json({ ok: false, error: { code: 'connector-hub/failed', message: describe(error) } }, { status: 400 })
    }
  }

  // connection 与 mcpManager 通常晚于本行就绪：用 ctx.inject 等它们出现。
  // 在 apply 里直接 ctx.get 会拿到 undefined（实测表现为页面 HTTP 404）。
  ctx.inject(['connection'], (child) => {
    const connection = readService(child, 'connection')
    if (connection?.fetch?.register === undefined) {
      console.error('connector-hub: connection 服务没有 fetch.register，连接器页面无法读写清单')
      return
    }
    child.effect(
      () => connection.fetch.register({
        path: HTTP_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: handleHttp,
      }),
      'connector-hub: http route',
    )
  })

  ctx.inject(['mcpManager'], (child) => {
    managerRef.value = readService(child, 'mcpManager')
    reconcile()
    child.effect(() => () => {
      for (const record of registered.values()) {
        try {
          record.dispose()
        } catch {
          /* 关闭时忽略 */
        }
      }
      registered.clear()
      managerRef.value = undefined
    }, 'connector-hub: registrations')
  })
}
