/**
 * Connector hub — Client half.
 *
 * 左侧栏「连接器」入口 + 主列页面：卡片列出这份部署的外部服务（MCP / RESTful API），
 * 支持新增 / 编辑 / 删除，MCP 连接器可以「测试连接」并读出工具清单（名字 + 说明）。
 *
 * 读写都走 Host 半边的私有路由 `/api/connector-hub`（`snapshot` / `probe` / `save` / `reset`）。
 * 只允许用 `React.createElement` 手写渲染：插件包不能 import Harness 的 Client 包，
 * 样式一律走 `--dsw-alias-*` 主题变量。
 */
window.__ModuleLoader__.load({
  id: 'my-dsh-connector-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 本插件独占的文案命名空间。 */
    const NS = 'connectorHub'
    /** 侧栏入口与主面板共用的 id。 */
    const PANEL_ID = 'connectors'
    /** Host 路由。 */
    const ROUTE = 'api/connector-hub'
    /** Client 构建标记，页脚显示。 */
    const UI_REVISION = '2026-11-16.1'

    const zh = {
      panel: '连接器',
      title: '连接器',
      intro: '这份部署的外部服务；MCP 连接器可测试连接并读取工具清单。',
      refresh: '刷新',
      refreshing: '刷新中…',
      add: '新增连接器',
      edit: '编辑',
      remove: '删除',
      reset: '恢复默认',
      confirmRemove: '确认删除',
      save: '保存',
      cancel: '取消',
      empty: '还没有配置连接器。',
      emptyHint: '点「新增连接器」填地址即可；配置保存在本机数据目录。',
      kind: '连接类型',
      kindMcp: 'MCP',
      kindRest: 'RESTful API',
      transport: '传输方式',
      transportHttp: '流式 HTTP（streamable-http）',
      transportStdio: '本地进程（stdio）',
      transportHttpTag: 'HTTP',
      transportStdioTag: 'stdio',
      command: '命令',
      args: '参数',
      argsHint: '一行一个参数，按顺序传给命令',
      env: '环境变量',
      envHint: '一行一个，形如 KEY=VALUE；留空则沿用系统环境',
      cwd: '工作目录',
      cwdHint: '留空则用进程当前目录',
      serverName: '服务名',
      displayName: '显示名',
      url: '地址',
      urlMcp: 'MCP 服务地址',
      urlRest: 'API 基地址',
      headers: '请求头',
      headersHint: '一行一个，形如 X-API-Key: xxx；留空即不认证',
      headersCount: '{count} 项',
      noHeaders: '无',
      enabled: '启用',
      builtinTag: '内置',
      disabledTag: '已停用',
      test: '测试连接',
      testing: '测试中…',
      reachable: '可连通',
      unreachable: '不可达',
      tools: '{count} 个工具',
      noTools: '0 个工具',
      toolsTitle: '工具清单（{count}）',
      noDescription: '（无说明）',
      httpStatus: 'HTTP {status}',
      loadFailed: '读取连接器失败：{message}',
      saveFailed: '保存失败：{message}',
      footer: '连接器 v{ui} · Host {host}',
      count: '共 {count} 个连接器',
      nameHint: '小写字母、数字、短横线；作为工具名前缀 mcp__<名称>__',
      nameHintRest: '小写字母、数字、短横线',
      titleHint: '不填则显示服务名',
    }

    const en = {
      panel: 'Connectors',
      title: 'Connectors',
      intro: 'External services of this deployment. MCP connectors can be tested and list their tools.',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      add: 'Add connector',
      edit: 'Edit',
      remove: 'Delete',
      reset: 'Reset to default',
      confirmRemove: 'Delete',
      save: 'Save',
      cancel: 'Cancel',
      empty: 'No connector configured yet.',
      emptyHint: 'Use “Add connector” and fill in the URL. The list is stored in the local data directory.',
      kind: 'Type',
      kindMcp: 'MCP',
      kindRest: 'RESTful API',
      transport: 'Transport',
      transportHttp: 'Streamable HTTP',
      transportStdio: 'Local process (stdio)',
      transportHttpTag: 'HTTP',
      transportStdioTag: 'stdio',
      command: 'Command',
      args: 'Arguments',
      argsHint: 'One argument per line, passed in order',
      env: 'Environment',
      envHint: 'One per line, KEY=VALUE. Leave empty to inherit the environment.',
      cwd: 'Working directory',
      cwdHint: 'Leave empty to use the process cwd',
      serverName: 'Server name',
      displayName: 'Display name',
      url: 'URL',
      urlMcp: 'MCP endpoint',
      urlRest: 'API base URL',
      headers: 'Headers',
      headersHint: 'One per line, e.g. X-API-Key: xxx. Leave empty for no auth.',
      headersCount: '{count}',
      noHeaders: 'none',
      enabled: 'Enabled',
      builtinTag: 'Built-in',
      disabledTag: 'Disabled',
      test: 'Test connection',
      testing: 'Testing…',
      reachable: 'Reachable',
      unreachable: 'Unreachable',
      tools: '{count} tools',
      noTools: '0 tools',
      toolsTitle: 'Tools ({count})',
      noDescription: '(no description)',
      httpStatus: 'HTTP {status}',
      loadFailed: 'Failed to read connectors: {message}',
      saveFailed: 'Save failed: {message}',
      footer: 'Connectors v{ui} · Host {host}',
      count: '{count} connector(s)',
      nameHint: 'Lowercase letters, digits and dashes; used as the mcp__<name>__ tool prefix',
      nameHintRest: 'Lowercase letters, digits and dashes',
      titleHint: 'Falls back to the server name',
    }

    /**
     * 页面文案：优先用宿主注入的 t。
     * @param {string} key - 文案键。
     * @param {Record<string, unknown>} [params] - 插值参数。
     * @returns {string} 文案。
     */
    function fallbackTranslate(key, params) {
      const dict = document.documentElement.lang.startsWith('zh') ? zh : en
      const template = dict[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
    }

    /** Host 请求封装。 */
    function createRequest() {
      return async function request(op, payload) {
        const response = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, payload: payload ?? {} }),
        })
        const result = await response.json().catch(() => null)
        if (result === null || result.ok !== true) {
          const failure = new Error(result?.error?.message ?? `HTTP ${String(response.status)}`)
          failure.code = result?.error?.code ?? 'connector-hub/transport'
          throw failure
        }
        return result.value
      }
    }

    const CSS = `
.ch-page{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}
.ch-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.ch-inner{box-sizing:border-box;max-width:none;margin:0 auto;padding:28px 48px 48px}
.ch-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:6px}
.ch-title{margin:0;font-size:20px;line-height:28px;font-weight:500}
.ch-intro{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.ch-toolbar{display:flex;align-items:center;gap:8px;flex:none}
.ch-btn{appearance:none;border:0.5px solid var(--dsw-alias-border-l4);background:transparent;color:var(--dsw-alias-label-primary);border-radius:999px;padding:5px 14px;font-size:13px;line-height:20px;cursor:pointer}
.ch-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ch-btn:disabled{opacity:.5;cursor:default}
.ch-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}
@media(hover:hover){.ch-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}}
.ch-btn-danger{color:var(--dsw-alias-state-error-primary)}
.ch-section{margin-top:22px}
.ch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px;margin-top:12px}
.ch-card{border:0.5px solid var(--dsw-alias-border-l4);border-radius:14px;background:var(--dsw-alias-bg-base);padding:16px 18px;display:flex;flex-direction:column;gap:10px;min-width:0}
.ch-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ch-card-title{font-size:15px;line-height:24px;font-weight:600}
.ch-card-actions{margin-left:auto;display:flex;gap:6px}
.ch-badge{font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-caption);white-space:nowrap}
.ch-badge-kind{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary-bluish)}
.ch-badge-warn{background:var(--dsw-alias-state-warning-tertiary);color:var(--dsw-alias-state-warning-primary)}
.ch-kv{display:grid;grid-template-columns:76px minmax(0,1fr);gap:6px 10px;font-size:13px}
.ch-k{color:var(--dsw-alias-label-caption);white-space:nowrap}
.ch-v{min-width:0;overflow-wrap:anywhere}
.ch-mono{font-family:var(--ds-font-family-code);font-size:12px}
.ch-card-foot{display:flex;align-items:center;gap:10px;margin-top:2px;flex-wrap:wrap}
.ch-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-caption);min-width:0}
.ch-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-dimmed);flex:none}
.ch-dot-ok{background:var(--dsw-alias-state-success-primary)}
.ch-dot-bad{background:var(--dsw-alias-state-error-primary)}
.ch-tip-wrap{position:relative;display:inline-flex;align-items:center;cursor:default}
.ch-tip{position:absolute;top:calc(100% + 6px);left:0;z-index:40;width:min(420px,70vw);max-height:280px;overflow:auto;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px rgba(0,0,0,.18);text-align:left}
.ch-tip{display:block}
.ch-tip-title{font-size:11px;color:var(--dsw-alias-label-caption);margin-bottom:6px}
.ch-tip-item{margin:0 0 6px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-caption);overflow-wrap:anywhere;transition:color .12s ease}
.ch-tip-item:hover{color:var(--dsw-alias-label-primary)}
.ch-tip-item:hover .ch-tip-name,.ch-tip-item:hover .ch-tip-desc{color:var(--dsw-alias-label-primary)}
.ch-tip-name{font-family:var(--ds-font-family-code);font-size:11px;color:var(--dsw-alias-label-secondary);margin-right:4px}
.ch-tip-desc{color:var(--dsw-alias-label-caption)}
.ch-empty{border:0.5px dashed var(--dsw-alias-border-l4);border-radius:14px;padding:28px 20px;text-align:center;color:var(--dsw-alias-label-caption)}
.ch-hint{margin-top:6px;font-size:12px}
.ch-form .ch-field ~ .ch-hint{margin:0 0 0 106px}
.ch-error{margin-top:12px;padding:10px 14px;border-radius:10px;background:var(--dsw-alias-state-error-tertiary);color:var(--dsw-alias-state-error-primary);font-size:13px}
.ch-form{margin-top:16px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:14px;padding:16px 18px;display:grid;gap:12px}
.ch-form-title{font-size:15px;font-weight:600}
.ch-field{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;align-items:start}
.ch-label{color:var(--dsw-alias-label-caption);font-size:13px;padding-top:5px}
.ch-input{box-sizing:border-box;width:100%;min-height:32px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;padding:5px 10px}
.ch-input:focus{outline:none;border-color:var(--dsw-alias-label-caption)}
.ch-input:disabled{opacity:.6;cursor:default}
.ch-textarea{min-height:64px;resize:vertical;font-family:var(--ds-font-family-code)}
.ch-select{position:relative;min-width:0}
.ch-select-btn{box-sizing:border-box;width:100%;min-height:32px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 10px;text-align:left;cursor:pointer}
.ch-select-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.ch-select-btn:disabled{opacity:.6;cursor:default}
.ch-select-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ch-select-chevron{flex:none;font-size:10px;line-height:1;color:var(--dsw-alias-label-caption);transform:translateY(1px)}
.ch-select-menu{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;display:flex;flex-direction:column;gap:2px;padding:4px;max-height:260px;overflow:auto;border-radius:10px;background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l4);box-shadow:0 12px 32px rgba(0,0,0,.18)}
.ch-select-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.ch-select-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ch-select-item.is-active{font-weight:500}
.ch-select-check{color:var(--dsw-alias-label-caption);font-size:11px}
.ch-form-actions{display:flex;justify-content:flex-end;gap:8px}
.ch-foot{margin-top:26px;display:flex;justify-content:space-between;gap:12px;color:var(--dsw-alias-label-caption);font-size:12px}
`

    /** headers 对象 <-> 文本。 */
    const headersToText = (headers) => Object.entries(headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')
    /** 环境变量：KEY=VALUE 一行一个。 */
    const envToText = (env) => Object.entries(env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')
    const textToEnv = (text) => {
      const out = {}
      for (const line of String(text ?? '').split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed === '') continue
        const index = trimmed.indexOf('=')
        if (index <= 0) continue
        out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
      }
      return out
    }

    const textToHeaders = (text) => {
      const out = {}
      for (const line of String(text ?? '').split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed === '') continue
        const index = trimmed.indexOf(':')
        if (index <= 0) continue
        out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
      }
      return out
    }

    /** 工具数量的悬浮清单。 */
    function ToolsTip({ probe, tr, children }) {
      const tools = Array.isArray(probe?.tools) ? probe.tools : []
      const [open, setOpen] = React.useState(false)
      const timer = React.useRef(0)
      const enter = () => {
        window.clearTimeout(timer.current)
        setOpen(true)
      }
      const leave = () => {
        window.clearTimeout(timer.current)
        // 留一点时间让鼠标跨过"数量"和浮层之间的空隙
        timer.current = window.setTimeout(() => setOpen(false), 200)
      }
      React.useEffect(() => () => window.clearTimeout(timer.current), [])
      if (tools.length === 0) return h('span', null, children)
      return h('span', { className: 'ch-tip-wrap', onMouseEnter: enter, onMouseLeave: leave }, [
        h('span', { key: 'label' }, children),
        open ? h('div', { key: 'tip', className: 'ch-tip', role: 'tooltip', onMouseEnter: enter, onMouseLeave: leave }, [
          h('div', { key: 'title', className: 'ch-tip-title' }, tr('toolsTitle', { count: probe.toolCount ?? tools.length })),
          ...tools.map((tool, index) => h('div', { key: `t${String(index)}`, className: 'ch-tip-item' }, [
            h('span', { key: 'n', className: 'ch-tip-name' }, tool.name || '—'),
            h('span', { key: 'd', className: 'ch-tip-desc' }, tool.description || tr('noDescription')),
          ])),
        ]) : null,
      ])
    }

    /**
     * 轻量下拉：按钮 + 浮层列表。
     * 不用原生 <select>：Electron 里原生下拉的弹层是窗口级的，点开有明显延迟，
     * 而且样式无法与页面统一。这里用按钮 + 绝对定位浮层，点击即时显示。
     */
    function ChSelect({ value, options, onChange, disabled, label }) {
      const [open, setOpen] = React.useState(false)
      const ref = React.useRef(null)
      React.useEffect(() => {
        if (!open) return undefined
        const onPointer = (event) => {
          const host = ref.current
          if (host !== null && !host.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onPointer)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onPointer)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])
      const current = options.find(option => option.value === value) ?? options[0]
      return h('div', { className: 'ch-select', ref }, [
        h('button', {
          key: 'btn', type: 'button', className: 'ch-select-btn', disabled,
          'aria-haspopup': 'listbox',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': label,
          onClick: () => setOpen(previous => !previous),
          onKeyDown: (event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen(true)
            }
          },
        }, [
          h('span', { key: 'l', className: 'ch-select-value' }, current?.label ?? ''),
          h('span', { key: 'c', className: 'ch-select-chevron' }, '▾'),
        ]),
        open
          ? h('div', { key: 'menu', className: 'ch-select-menu', role: 'listbox' },
            options.map(option => h('button', {
              key: option.value,
              type: 'button',
              role: 'option',
              'aria-selected': option.value === value ? 'true' : 'false',
              className: `ch-select-item${option.value === value ? ' is-active' : ''}`,
              onClick: () => {
                onChange(option.value)
                setOpen(false)
              },
            }, [
              h('span', { key: 'l' }, option.label),
              option.value === value ? h('span', { key: 'k', className: 'ch-select-check' }, '✓') : null,
            ])))
          : null,
      ])
    }

    /** 编辑 / 新增表单。 */
    function ConnectorForm({ initial, tr, onCancel, onSubmit }) {
      const locked = initial?.builtin === true
      const [draft, setDraft] = React.useState(() => ({
        name: initial?.name ?? '',
        title: initial?.title ?? '',
        kind: initial?.kind ?? 'mcp',
        transport: initial?.transport === 'stdio' ? 'stdio' : 'streamable-http',
        url: initial?.url ?? '',
        headersText: headersToText(initial?.headers),
        command: initial?.command ?? '',
        argsText: Array.isArray(initial?.args) ? initial.args.join('\n') : '',
        envText: envToText(initial?.env),
        cwd: initial?.cwd ?? '',
        enabled: initial?.enabled !== false,
      }))
      const [busy, setBusy] = React.useState(false)
      const set = (patch) => setDraft(current => ({ ...current, ...patch }))
      const submit = async () => {
        setBusy(true)
        try {
          const stdio = draft.kind === 'mcp' && draft.transport === 'stdio'
          await onSubmit({
            name: draft.name,
            title: draft.title,
            kind: draft.kind,
            transport: stdio ? 'stdio' : 'streamable-http',
            url: draft.url,
            headers: textToHeaders(draft.headersText),
            command: stdio ? draft.command : '',
            args: stdio ? draft.argsText.split('\n').map(line => line.trim()).filter(Boolean) : [],
            env: stdio ? textToEnv(draft.envText) : {},
            cwd: stdio ? draft.cwd : '',
            enabled: draft.enabled,
          })
        } finally {
          setBusy(false)
        }
      }
      return h('div', { className: 'ch-form' }, [
        h('div', { key: 't', className: 'ch-form-title' }, initial ? `${tr('edit')} · ${initial.title || initial.name}` : tr('add')),
        h('div', { key: 'k', className: 'ch-field' }, [
          h('span', { key: 'l', className: 'ch-label' }, tr('kind')),
          h(ChSelect, {
            key: 'i', value: draft.kind, disabled: locked, label: tr('kind'),
            options: [
              { value: 'mcp', label: tr('kindMcp') },
              { value: 'rest', label: tr('kindRest') },
            ],
            onChange: value => set({ kind: value }),
          }),
        ]),
        draft.kind === 'mcp'
          ? h('div', { key: 'tr', className: 'ch-field' }, [
            h('span', { key: 'l', className: 'ch-label' }, tr('transport')),
            h(ChSelect, {
              key: 'i', value: draft.transport, disabled: locked, label: tr('transport'),
              options: [
                { value: 'streamable-http', label: tr('transportHttp') },
                { value: 'stdio', label: tr('transportStdio') },
              ],
              onChange: value => set({ transport: value }),
            }),
          ])
          : null,
        h('div', { key: 'n', className: 'ch-field' }, [
          h('span', { key: 'l', className: 'ch-label' }, tr('serverName')),
          h('input', {
            key: 'i', className: 'ch-input', value: draft.name, placeholder: 'my-mcp',
            disabled: locked,
            onChange: event => set({ name: event.target.value }),
          }),
        ]),
        locked
          ? null
          : h('div', { key: 'nh', className: 'ch-hint' }, tr(draft.kind === 'rest' ? 'nameHintRest' : 'nameHint')),
        h('div', { key: 'ti', className: 'ch-field' }, [
          h('span', { key: 'l', className: 'ch-label' }, tr('displayName')),
          h('input', {
            key: 'i', className: 'ch-input', value: draft.title, placeholder: tr('titleHint'),
            onChange: event => set({ title: event.target.value }),
          }),
        ]),
        draft.kind === 'mcp' && draft.transport === 'stdio'
          ? h('div', { key: 'cmd', className: 'ch-field' }, [
            h('span', { key: 'l', className: 'ch-label' }, tr('command')),
            h('input', {
              key: 'i', className: 'ch-input ch-mono', value: draft.command,
              placeholder: 'npx',
              onChange: event => set({ command: event.target.value }),
            }),
          ])
          : null,
        draft.kind === 'mcp' && draft.transport === 'stdio'
          ? h('div', { key: 'args', className: 'ch-field' }, [
            h('span', { key: 'l', className: 'ch-label' }, tr('args')),
            h('textarea', {
              key: 'i', className: 'ch-input ch-textarea', value: draft.argsText,
              placeholder: tr('argsHint'),
              onChange: event => set({ argsText: event.target.value }),
            }),
          ])
          : null,
        draft.kind === 'mcp' && draft.transport === 'stdio'
          ? h('div', { key: 'env', className: 'ch-field' }, [
            h('span', { key: 'l', className: 'ch-label' }, tr('env')),
            h('textarea', {
              key: 'i', className: 'ch-input ch-textarea', value: draft.envText,
              placeholder: tr('envHint'),
              onChange: event => set({ envText: event.target.value }),
            }),
          ])
          : null,
        draft.kind === 'mcp' && draft.transport === 'stdio'
          ? h('div', { key: 'cwd', className: 'ch-field' }, [
            h('span', { key: 'l', className: 'ch-label' }, tr('cwd')),
            h('input', {
              key: 'i', className: 'ch-input ch-mono', value: draft.cwd,
              placeholder: tr('cwdHint'),
              onChange: event => set({ cwd: event.target.value }),
            }),
          ])
          : null,
        draft.kind === 'mcp' && draft.transport === 'stdio'
          ? null
          : h('div', { key: 'u', className: 'ch-field' }, [
            h('span', { key: 'l', className: 'ch-label' }, tr('url')),
            h('input', {
              key: 'i', className: 'ch-input ch-mono', value: draft.url,
              placeholder: draft.kind === 'rest' ? 'http://localhost:8081/api' : 'http://localhost:8080/api/mcp',
              onChange: event => set({ url: event.target.value }),
            }),
          ]),
        draft.kind === 'mcp' && draft.transport === 'stdio'
          ? null
          : h('div', { key: 'h', className: 'ch-field' }, [
            h('span', { key: 'l', className: 'ch-label' }, tr('headers')),
            h('textarea', {
              key: 'i', className: 'ch-input ch-textarea', value: draft.headersText,
              placeholder: tr('headersHint'),
              onChange: event => set({ headersText: event.target.value }),
            }),
          ]),
        h('div', { key: 'a', className: 'ch-form-actions' }, [
          h('button', { key: 'c', type: 'button', className: 'ch-btn', disabled: busy, onClick: onCancel }, tr('cancel')),
          h('button', { key: 's', type: 'button', className: 'ch-btn ch-btn-primary', disabled: busy || draft.name.trim() === '' || (draft.kind === 'mcp' && draft.transport === 'stdio' ? draft.command.trim() === '' : draft.url.trim() === ''), onClick: () => { void submit() } }, busy ? '…' : tr('save')),
        ]),
      ])
    }

    /** 一张连接器卡片。 */
    function ConnectorCard({ connector, tr, onProbe, onEdit, onRemove, onReset, confirming }) {
      const [busy, setBusy] = React.useState(false)
      const probe = connector.probe
      const status = connector.status ?? {}
      const isMcp = connector.kind !== 'rest'

      const probeText = probe === null ? null : probe.ok
        ? [
          tr('reachable'),
          isMcp
            ? (probe.toolCount !== undefined ? tr('tools', { count: probe.toolCount }) : tr('noTools'))
            : '',
          probe.serverName || '',
        ].filter(Boolean).join(' · ')
        : `${tr('unreachable')}${probe.error ? ` · ${probe.error}` : ''}`

      // MCP 才有管理器状态；REST 只登记地址，没探测过就什么都不显示
      // 管理器状态翻译成中文；未做测试时 connected 也显示「可连通」
      const stateLabel = status.state === 'connected'
        ? tr('reachable')
        : status.state === 'failed'
          ? tr('unreachable')
          : (typeof status.state === 'string' ? status.state : null)
      const stateText = probeText ?? (isMcp && typeof status.state === 'string'
        ? `${stateLabel ?? status.state}${status.reason ? ` · ${status.reason}` : ''}`
        : null)
      const dotClass = probe !== null
        ? (probe.ok ? 'ch-dot-ok' : 'ch-dot-bad')
        : (status.state === 'connected' ? 'ch-dot-ok' : status.state === 'failed' ? 'ch-dot-bad' : '')

      const run = async () => {
        setBusy(true)
        try {
          await onProbe(connector.name)
        } finally {
          setBusy(false)
        }
      }

      const statusNode = stateText === null ? null : h('span', { key: 'status', className: 'ch-status' }, [
        h('span', { key: 'dot', className: `ch-dot ${dotClass}` }),
        isMcp && probe?.ok && Array.isArray(probe.tools) && probe.tools.length > 0
          ? h('span', { key: 'text' }, [
            h('span', { key: 'r' }, `${tr('reachable')} · `),
            h(ToolsTip, { key: 'tip', probe, tr }, tr('tools', { count: probe.toolCount ?? probe.tools.length })),
            probe.serverName ? h('span', { key: 's' }, ` · ${probe.serverName}`) : null,
          ])
          : h('span', { key: 'text' }, stateText),
      ])

      return h('div', { className: 'ch-card' }, [
        h('div', { key: 'head', className: 'ch-card-head' }, [
          h('span', { key: 't', className: 'ch-card-title' }, connector.title || connector.name),
          h('span', { key: 'kind', className: 'ch-badge ch-badge-kind' }, isMcp ? tr('kindMcp') : tr('kindRest')),
          isMcp
            ? h('span', { key: 'tr', className: 'ch-badge' }, connector.transport === 'stdio' ? tr('transportStdioTag') : tr('transportHttpTag'))
            : null,
          connector.builtin ? h('span', { key: 'bl', className: 'ch-badge' }, tr('builtinTag')) : null,
          connector.enabled ? null : h('span', { key: 'off', className: 'ch-badge ch-badge-warn' }, tr('disabledTag')),
          h('span', { key: 'act', className: 'ch-card-actions' }, [
            connector.builtin && connector.dirty
              ? h('button', { key: 'd', type: 'button', className: 'ch-btn', onClick: () => onReset(connector.name) }, tr('reset'))
              : null,
            h('button', { key: 'e', type: 'button', className: 'ch-btn', onClick: () => onEdit(connector) }, tr('edit')),
            connector.builtin ? null : h('button', { key: 'r', type: 'button', className: 'ch-btn ch-btn-danger', onClick: () => onRemove(connector) }, confirming ? tr('confirmRemove') : tr('remove')),
          ]),
        ]),
        h('div', { key: 'kv', className: 'ch-kv' }, [
          h('span', { key: 'k1', className: 'ch-k' }, tr('serverName')),
          h('span', { key: 'v1', className: 'ch-v ch-mono' }, connector.name),
          h('span', { key: 'k2', className: 'ch-k' }, isMcp && connector.transport === 'stdio' ? tr('command') : tr('url')),
          h('span', { key: 'v2', className: 'ch-v ch-mono' }, isMcp && connector.transport === 'stdio'
            ? ([connector.command, ...(connector.args ?? [])].filter(Boolean).join(' ') || '—')
            : (connector.url || '—')),
          h('span', { key: 'k3', className: 'ch-k' }, tr('headers')),
          h('span', { key: 'v3', className: 'ch-v' }, connector.headerCount > 0 ? tr('headersCount', { count: connector.headerCount }) : tr('noHeaders')),
        ]),
        h('div', { key: 'foot', className: 'ch-card-foot' }, [
          h('button', {
            key: 'test', type: 'button', className: 'ch-btn',
            disabled: busy || (isMcp && connector.transport === 'stdio' ? !connector.command : !connector.url),
            onClick: run,
          },
            busy ? tr('testing') : tr('test')),
          statusNode,
        ]),
      ])
    }

    /** 连接器页。 */
    function ConnectorPage(props) {
      const requestRef = React.useRef(props.requestConnectorHub)
      requestRef.current = props.requestConnectorHub
      const tr = React.useCallback(
        (key, params) => (typeof props.t === 'function' ? props.t(key, params) : fallbackTranslate(key, params)),
        [props.t],
      )
      const [snapshot, setSnapshot] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState(null)
      const [editing, setEditing] = React.useState(null)
      const [confirming, setConfirming] = React.useState(null)

      const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
          setSnapshot(await requestRef.current('snapshot'))
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setLoading(false)
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const connectors = snapshot?.connectors ?? []

      const persist = async (next) => {
        try {
          setSnapshot(await requestRef.current('save', { connectors: next }))
          setEditing(null)
          setError(null)
          return true
        } catch (failure) {
          setError(tr('saveFailed', { message: failure instanceof Error ? failure.message : String(failure) }))
          return false
        }
      }

      const submit = async (form) => {
        const next = connectors.map(c => ({ ...c }))
        const index = next.findIndex(c => c.name === (editing?.name ?? form.name))
        const merged = { ...form, name: form.name.trim() }
        if (index >= 0) next[index] = merged
        else next.push(merged)
        await persist(next)
      }

      const remove = async (connector) => {
        if (confirming !== connector.name) {
          setConfirming(connector.name)
          return
        }
        setConfirming(null)
        await persist(connectors.filter(c => c.name !== connector.name))
      }

      const resetOne = async (name) => {
        try {
          setSnapshot(await requestRef.current('reset', { name }))
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      const probeOne = async (name) => {
        try {
          const result = await requestRef.current('probe', { name })
          setSnapshot(current => current === null ? current : {
            ...current,
            connectors: current.connectors.map(c => (c.name === name ? { ...c, probe: result } : c)),
          })
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      const body = [
        h('div', { key: 'head', className: 'ch-head' }, [
          h('div', { key: 'title' }, [
            h('h1', { key: 'h', className: 'ch-title' }, tr('title')),
            h('p', { key: 'p', className: 'ch-intro' }, tr('intro')),
          ]),
          editing !== null ? null : h('div', { key: 'tools', className: 'ch-toolbar' }, [
            h('button', { key: 'refresh', type: 'button', className: 'ch-btn', disabled: loading, onClick: () => { void load() } },
              loading ? tr('refreshing') : tr('refresh')),
            h('button', { key: 'add', type: 'button', className: 'ch-btn ch-btn-primary', onClick: () => { setEditing({}); setConfirming(null) } }, tr('add')),
          ]),
        ]),
      ]

      if (error !== null) body.push(h('div', { key: 'err', className: 'ch-error' }, error))

      if (editing !== null) {
        body.push(h(ConnectorForm, {
          key: 'form',
          initial: editing.name === undefined ? undefined : editing,
          tr,
          onCancel: () => { setEditing(null) },
          onSubmit: submit,
        }))
      } else if (!loading && connectors.length === 0) {
        body.push(h('div', { key: 'empty', className: 'ch-section' }, [
          h('div', { key: 'box', className: 'ch-empty' }, [
            h('div', { key: 't' }, tr('empty')),
            h('div', { key: 'h', className: 'ch-hint' }, tr('emptyHint')),
          ]),
        ]))
      } else if (connectors.length > 0) {
        body.push(h('div', { key: 'list', className: 'ch-section' }, [
          h('div', { key: 'count', className: 'ch-status' }, tr('count', { count: connectors.length })),
          h('div', { key: 'grid', className: 'ch-grid' },
            connectors.map(connector => h(ConnectorCard, {
              key: connector.name,
              connector,
              tr,
              onProbe: probeOne,
              onEdit: (target) => { setEditing(target); setConfirming(null) },
              onRemove: remove,
              onReset: resetOne,
              confirming: confirming === connector.name,
            }))),
        ]))
      }

      body.push(h('div', { key: 'foot', className: 'ch-foot' }, [
        h('span', { key: 'rev' }, tr('footer', { ui: UI_REVISION, host: snapshot?.revision ?? '—' })),
      ]))

      return h('div', { className: 'ch-page' }, [
        h('style', { key: 'css' }, CSS),
        h('div', { key: 'scroll', className: 'ch-scroll' }, h('div', { className: 'ch-inner' }, body)),
      ])
    }

    /** 侧栏图标：插头。 */
    function ConnectorIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 20
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', focusable: 'false',
      }, [
        h('path', { key: 'a', d: 'M9 3v5' }),
        h('path', { key: 'b', d: 'M15 3v5' }),
        h('path', { key: 'c', d: 'M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6z' }),
        h('path', { key: 'd', d: 'M12 17v4' }),
      ])
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'connector-hub: dictionaries')
        const t = ctx.locale.bind(NS)
        const request = createRequest()
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ requestConnectorHub: request }),
        }, ConnectorPage))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: -10,
          locale: NS,
          label: () => t('panel'),
        }, ConnectorIcon))
      },
    }
  },
})
