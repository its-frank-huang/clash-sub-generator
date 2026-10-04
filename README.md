# Clash 订阅生成器

**👉 在线使用：<https://its-frank-huang.github.io/clash-sub-generator/>**

把**多个机场订阅、自建服务器订阅（3x-ui 等）和单节点链接**合成为一份 Clash Meta / mihomo 配置：四层分组、主流媒体和 AI 分流、出国和**回国**节点都有。

- **网页版**：订阅地址和节点只在你的浏览器里处理，不会上传。
- **命令行版**：`node cli.mjs -c config.json -o config.yaml`，可以放进脚本或定时任务。
- 零依赖，规则集用 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) 的 `.mrs`（2026-10 核对过名称都存在）。

## 分组层级

面板里从上到下：

| 层 | 分组 | 默认选择 | 说明 |
|---|---|---|---|
| 第四层 · 总模式 | 🚀 总模式 | ♻️ 自动选择 | 所有境外流量的默认出口 |
| | 🏮 国内总模式 | DIRECT | 所有国内流量的默认出口；人在境外时切到 🇨🇳 回国 |
| 第三层 · 应用集合 | 🤖 国外 AI、🐼 国内 AI、🌍 国外媒体、🏮 国内媒体、💬 通讯软件、👥 社交媒体、🕹️ 游戏平台、🧰 国外服务、🖥️ 系统服务、🏠 国内网站、🛑 广告拦截（默认关） | 国外类 → 🚀 总模式；国内类 → 🏮 国内总模式；系统服务 → DIRECT | |
| 第二层 · 应用 | ▶️ YouTube、🎬 Netflix、🏰 Disney+、🎞️ HBO Max、📦 Prime Video、🎧 Spotify、🎶 TikTok、🟢 ChatGPT、🟠 Claude、✨ Gemini、📺 哔哩哔哩、🥝 爱奇艺、🎵 QQ音乐、✈️ Telegram … | 所属集合 | 可选：总模式、任一自动组、任一地区、回国、DIRECT |
| 第一层 · 地区 / 节点 | ♻️ 自动选择（全部节点最快）、⚡ 1x 自动选择、💎 3x 自动选择、🇭🇰 香港、🇹🇼 台湾、🇯🇵 日本、🇸🇬 新加坡、🇺🇸 美国 …、🌐 其他地区、🇨🇳 回国、👆 手动选择 | 地区组第一项是该地区自动测速 | 在地区组里点具体节点就固定用它 |

默认值是一条链：**应用 → 集合 → 总模式 → 自动测速**。哪一层手动改了，就从那一层开始生效。例如：

- 全部境外流量换到日本：只改 🚀 总模式 → 🇯🇵 日本。
- 只让 Netflix 走台湾某个节点：🎬 Netflix → 🇹🇼 台湾，再在 🇹🇼 台湾 里点那个节点。
- 人在境外听 QQ 音乐、看 B 站：🏮 国内总模式 → 🇨🇳 回国，🚀 总模式 → DIRECT。

### 倍率

节点名里的 `3x`、`x3`、`×3`、`3倍`、`3.0x`、`倍率:3` 都能识别：

- ⚡ 1x 自动选择：排除倍率 ≥ 2 的节点（阈值可调）
- 💎 3x 自动选择：只要倍率 ≥ 3 的节点（阈值可调）
- 各地区的自动测速默认不选高倍率节点（可关）

### 回国节点

三种来源，可以同时用：

1. 订阅的类型选「回国」：整份订阅都当作回国节点（例如大陆云服务器上的 3x-ui 订阅）。
2. 单节点链接填在「回国节点」框里。
3. 勾选「从机场订阅里识别回国节点」：按关键词（默认 `回国|大陆…`）从机场里挑出来。

回国组的测速地址是 `https://www.baidu.com/`（回国节点访问不了 Google，用默认测速地址会一直显示超时）。

## 使用

### 网页版

直接用上面的在线地址即可。想部署自己的一份：Fork 本仓库 → Settings → Pages → Source 选 **Deploy from a branch**，分支选默认分支、目录选 `/ (root)` → 保存，稍等一两分钟后打开 `https://<你的用户名>.github.io/<仓库名>/`。

本地使用（直接双击 `index.html` 打不开，浏览器不允许 `file://` 加载 ES 模块）：

```bash
node scripts/serve.mjs
```

然后打开 <http://localhost:8080>。填好后点「下载 config.yaml」，在客户端里导入：

- **Clash Verge Rev**：订阅 → 新建 → 类型选 Local → 选择文件
- **Mihomo Party / FlClash**：配置 → 导入本地文件
- **OpenClash**：「用在哪里」选路由器，上传到 `/etc/openclash/config/`

「导出设置 JSON」可以保存这次填写的内容，下次「导入设置 JSON」接着改；这个 JSON 和命令行版的设置文件格式相同。

### 命令行版

```bash
cp examples/config.example.json config.json
node cli.mjs -c config.json -o config.yaml
```

`config.json` 和 `config.yaml` 已在 `.gitignore` 里，不会被提交。

### 想要一个「订阅链接」给手机用

生成的是完整配置文件，里面用 `proxy-providers` 引用你的各个订阅，客户端会按订阅自己的间隔自动更新节点，所以配置文件本身很少需要重新生成。如果想用链接导入，可以把 `config.yaml` 放到**私密** Gist 或自己的服务器上，再把 raw 链接填到客户端。**不要放进公开仓库**：文件里有订阅地址和节点凭据。

## 设置文件字段

| 字段 | 说明 | 默认 |
|---|---|---|
| `subscriptions[]` | `{ name, url, role: "intl" \| "cn", prefix, interval }`；多个订阅时 `prefix` 给节点名加「名称 \| 」前缀 | `[]` |
| `nodes.intl` / `nodes.cn` | 分享链接，每行一个；也可以粘贴整段 base64 订阅内容 | `""` |
| `regions` | 启用的地区 id：`hk tw jp sg us kr gb de fr ca au in tr ar my th vn ph ru nl` | 前 8 个 |
| `otherRegion` | 生成 🌐 其他地区 | `true` |
| `multiplier` | `{ lowBelow: 2, highFrom: 3, regionAutoExcludeHigh: true }` | |
| `cnFromAirports` / `cnFilter` | 从机场识别回国节点 / 关键词正则 | `false` |
| `infoFilter` | 订阅层剔除的信息节点（剩余流量、到期…） | 内置 |
| `collections` | `{ 集合id: true/false }`，如 `{ "ads": true, "games": false }` | 除广告拦截外全开 |
| `apps` | `{ 应用id: true/false }`：是否单独成组；`false` 时规则直接走所属集合 | 见 `src/catalog.js` |
| `mainDefault` | 🚀 总模式默认：`auto` `low` `high` 地区 id `cn` `DIRECT` | `auto` |
| `domesticDefault` | 🏮 国内总模式默认：`DIRECT` / `cn` | `DIRECT` |
| `groupDefaults` | 改某个应用或集合的默认选择，如 `{ "netflix": "tw", "cn-media": "cn" }`；取值同 `mainDefault`，另可用 `main` / `domestic`；不可用时保持原默认并提示。只在 JSON 设置文件里（网页导入导出会保留） | `{}` |
| `profile` | `client`（客户端）/ `openclash`（路由器端口和监听） | `client` |
| `ruleSource` | `github`（经总模式下载）/ `jsdelivr`（直连，大陆可用） | `github` |
| `mlkem` | Reality 节点加 `support-x25519mlkem768: true` | `true` |
| `customRules` | 自定义规则，每行一条，排在最前 | `""` |

集合和应用的 id、规则见 [src/catalog.js](src/catalog.js)，加一个应用只需要在对应集合的 `apps` 里加一行。

## 支持的链接

`vless://`（含 Reality、ws、grpc、h2、xhttp）、`vmess://`、`trojan://`、`ss://`（SIP002 / 旧格式 / 2022、obfs、v2ray-plugin、shadow-tls）、`hysteria2://` / `hy2://`、`tuic://`、`anytls://`、`socks5://`。

## 开发

```bash
npm test     # 零依赖自检：分组引用完整、无循环、规则目标存在、链接解析、YAML 往返
npm start    # 本地预览网页
```

目录：

```
index.html          网页
src/catalog.js      地区、集合、应用、规则（改这里加服务）
src/generate.js     核心：设置 → 配置
src/parse.js        分享链接解析
src/yaml.js         YAML 输出
src/app.js          网页交互
cli.mjs             命令行
```

改完配置后建议用 mihomo 自己校验一遍：

```bash
mihomo -t -f config.yaml
```
