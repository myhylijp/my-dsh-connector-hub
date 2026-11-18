# my-dsh-connector-hub

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

左侧栏 **连接器** 页：卡片列出这份部署的外部服务，可新增 / 编辑 / 删除；MCP 连接器能「测试连接」
并读出工具清单（名字 + 说明），RESTful API 只登记基地址与请求头，供后续插件读取。

## 两种连接类型

| 类型 | `kind` | 含义 | 生效方式 |
|---|---|---|---|
| MCP | `mcp` | MCP 服务，**两种传输方式**：流式 HTTP（`streamable-http`）/ 本地进程（`stdio`） | 通过 `mcpManager.register(name, entry)` 挂成 MCP 客户端 |
| RESTful API | `rest` | 普通 REST API 基地址（如某个内部服务的接口） | 只登记在清单里，本插件不连接；供后续插件读取配置 |

MCP 选中后，「连接类型」下面会出现「**传输方式**」：

| 传输方式 | `transport` | 表单字段 | 管理器条目 |
|---|---|---|---|
| 流式 HTTP | `streamable-http` | 地址、请求头 | `{ transport, url, headers }` |
| 本地进程 | `stdio` | 命令、参数（一行一个）、环境变量（`KEY=VALUE` 一行一个）、工作目录 | `{ transport, command, args, env, cwd }` |

两种传输的字段是**互斥**的：`mcp-manager` 会拒绝 `stdio` 条目带 `url`/`headers`，
也会拒绝 `streamable-http` 条目带 `command`/`args`/`env`/`cwd`，所以 Host 侧按传输方式裁剪后再注册。
`stdio` 由 MCP SDK 自己 spawn 子进程（沿用 DSH 的凭证清洗规则，`DSH_*` 等敏感环境变量不会传给子进程）。

内置连接器的类型在编辑表单里是只读的（`kind` 不可改），名字也不可改。

## 数据放哪

清单存在 `<dshHome>\connector-hub\connectors.json`（默认 `%USERPROFILE%\.dsh\connector-hub\connectors.json`）：

```json
{
  "version": 2,
  "connectors": [
    { "name": "my-mcp", "title": "示例 MCP 服务", "kind": "mcp",
      "url": "http://localhost:8080/api/mcp", "headers": {}, "enabled": true, "builtin": true }
  ]
}
```

- 本插件**自身不带任何预置连接器**，清单完全由部署方的 `config.defaults` 与页面操作决定。
- 首次运行用本行配置的 `defaults` 播种；之后以文件为准，**升级安装包不会覆盖用户改过的内容**。
- `name` 是 MCP 的 serverName（小写字母/数字/短横线），也是工具名前缀 `mcp__<name>__`。

## 内置连接器

`defaults` 里的条目默认就是**内置**（`builtin: true`，可在 defaults 里写 `builtin: false` 取消）。
内置连接器：

- 卡片上有「内置」标记，**没有删除按钮**；保存接口也会拒绝删除或改名。
- 名字与连接类型在编辑表单里锁死，**地址、显示名、请求头可以改**。
- 改过之后卡片上会出现「**恢复默认**」（只在与 `defaults` 不一致时出现），点一下把类型/标题/地址/请求头/启用状态
  还原成 `defaults` 里的值；Host 侧对应 `reset` 操作，非内置连接器调用会被拒绝。
- JSON 里被手工删掉也没用：启动时会按 `defaults` 补回来（`ensureBuiltins`），并把 `builtin` 钉回 `true`。
- 反过来，**安装包不再提供的旧内置项会自动降级为普通连接器**（`builtin: false`），用户可以自行删除。

## 「测试连接」

- **MCP / 流式 HTTP**：完整握手 `initialize` → `notifications/initialized` → `tools/list`（20 秒超时，兼容 JSON 与 SSE），
  返回 HTTP 状态、`serverInfo.name`、工具数量与**每条工具的名字 + 说明**；页面上的工具数量可 hover
  展开完整清单（最多 200 条，说明各截断 300 字）。
- **MCP / 本地进程（stdio）**：
  - 连接器已启用并在管理器里注册 → 调 `mcpManager.probe(name)`，真实起进程、握手、列工具，结果同上；
  - 还没注册（停用或刚改过）→ 只校验命令能否解析（Windows 用 `where`，其它平台用 `which`），
    并提示「启用后由 MCP 管理器建立连接并加载工具」。
- **RESTful API**：发一个 `GET`（10 秒超时），只回 HTTP 状态与 `content-type`，没有工具概念。

卡片上另一种状态（如 `reconnecting`）来自 `mcpManager.list()`，是管理器自己维护的连接状态；
REST 连接器没有管理器状态，只显示探测结果。

## 配置

```yaml
- id: connector-hub
  name: 'my-dsh-connector-hub'
  config:
    defaults:            # 可选：只在首次运行时播种，同时是「内置」的基准
      - name: my-mcp
        title: 示例 MCP 服务
        kind: mcp
        url: http://localhost:8080/api/mcp
        enabled: true
```

## 边界

- MCP 支持 `streamable-http` 与 `stdio` 两种传输；stdio 子进程的工作目录默认是应用进程的 cwd，
  需要相对路径时请显式填写「工作目录」。
- REST 连接器目前只是登记，不会替你保存任何业务数据；后续插件读取它时自己发请求。
- 连接器工具是否对某个角色可用，取决于作用域：管理器把实例挂在自己的作用域里，工具注册在全局层。
- Host 侧代码不热替换：升级本插件 `host.js` 后需要重启应用。
