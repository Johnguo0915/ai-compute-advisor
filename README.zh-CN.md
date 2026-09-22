# AI Compute Advisor：运行与部署说明

AI Compute Advisor 是一个纯静态 Web App。它不需要后端、数据库、登录系统或运行时 Server API，构建结果是标准的 `dist/` 静态目录，可部署到 Vercel、Netlify、GitHub Pages、对象存储或任意静态 Web Server。

在线计算器：[https://johnguo0915.github.io/ai-compute-advisor/](https://johnguo0915.github.io/ai-compute-advisor/)

英文产品与维护说明见 [README.md](README.md)。

## 1. 环境要求

- Node.js `22.13.0` 或更高版本
- npm

检查本机版本：

```bash
node --version
npm --version
```

项目不要求 `.env` 文件，也没有必须配置的 API Key。

## 2. 本地运行 Demo

进入项目目录后执行：

```bash
npm install
npm run dev
```

打开终端显示的地址，通常是：

```text
http://localhost:5173/
```

如需让同一可信局域网内的其他设备访问：

```bash
npm run dev -- --host 0.0.0.0
```

然后使用终端显示的 Network 地址访问。开发服务不应直接暴露到公网。

## 3. 生成生产版本

部署前建议先执行完整检查：

```bash
npm run check
```

该命令会依次完成 TypeScript 检查、Vitest 测试和生产构建。也可以只执行构建：

```bash
npm run build
```

构建结果位于：

```text
dist/
```

在本机通过 HTTP 预览生产版本（通常为 `http://localhost:4173/`）：

```bash
npm run preview
```

不要直接双击 `dist/index.html`。浏览器通过 `file://` 打开时会限制 ES Module 和 JSON 请求；必须通过 HTTP/HTTPS 静态服务访问。

## 4. 部署到 Vercel

仓库已包含 `vercel.json`：

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

推荐步骤：

1. 将项目推送到 GitHub、GitLab 或 Bitbucket。
2. 在 Vercel 选择 **Add New → Project** 并导入仓库。
3. Framework Preset 选择或自动识别为 **Vite**。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. Node.js 版本选择 `22.x`。
7. 不需要添加环境变量，直接部署。

以后向默认分支推送代码，Vercel 会自动重新构建和发布。

## 5. 部署到 Netlify

仓库已包含 `netlify.toml`：

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22.13.0"
```

推荐步骤：

1. 在 Netlify 选择 **Add new site → Import an existing project**。
2. 连接代码仓库。
3. Netlify 会自动读取 `netlify.toml`。
4. 确认 Build command 为 `npm run build`，Publish directory 为 `dist`。
5. 不需要环境变量，执行部署。

也可以先在本机执行 `npm run build`，再把 `dist/` 上传到 Netlify Drop。持续维护时更推荐连接代码仓库。

## 6. 部署到 GitHub Pages

仓库已包含 `.github/workflows/deploy-pages.yml`。工作流会在推送到 `main` 分支时：

1. 安装 Node.js `22.13.0`。
2. 使用 `npm ci` 安装锁定依赖。
3. 运行测试。
4. 构建 `dist/`。
5. 发布到 GitHub Pages。

首次启用：

1. 将仓库推送到 GitHub，并确认默认分支是 `main`。
2. 打开仓库 **Settings → Pages**。
3. 在 Build and deployment 中将 Source 选择为 **GitHub Actions**。
4. 推送一次 `main`，或手动运行 **Deploy to GitHub Pages** workflow。

如果默认分支不是 `main`，请同步修改 `.github/workflows/deploy-pages.yml` 中的触发分支。

Vite 已配置 `base: "./"`，资源使用相对路径，因此可以部署在 `https://用户名.github.io/仓库名/` 这样的子目录下。访问子目录时建议保留末尾 `/`。应用当前只有单页根路径，并使用查询参数保存场景，因此不需要 SPA 路由重写。如果以后增加 `/compare/...` 等 History API 深路径，需要分别为各平台增加并测试 rewrite / fallback；当前配置不支持直接刷新这类深路径。

## 7. 部署到其他静态平台

Cloudflare Pages、AWS S3 + CloudFront、Azure Static Web Apps、Nginx、Apache 或企业内部静态服务器都可以使用同一构建结果。

通用配置：

| 配置项 | 值 |
|---|---|
| Install command | `npm ci` |
| Build command | `npm run build` |
| Publish / Output directory | `dist` |
| Node.js | `22.13.0` 或更高 |
| Required environment variables | 无 |

如果平台只接收静态文件，先运行 `npm run build`，再将 `dist/` 内的全部内容上传到站点根目录。必须发布完整目录，不能只上传 `index.html`；`public/data/manifest.json` 会构建为 `dist/data/manifest.json`，其他目录 JSON 也必须保持文件名大小写与相对目录结构。

## 8. 数据如何随部署发布

团队共享的产品与计算数据位于 `public/data/`：

```text
public/data/manifest.json
public/data/models.json
public/data/model-benchmarks.json
public/data/gpus.json
public/data/inference-profiles.json
public/data/cloud-pricing.json
public/data/assumptions.json
public/data/presets.json
public/data/systems.json
public/data/exchange-rates.json
```

当前内置版本为 `2026.09-sample.15`，属于方向性示例数据，并非实时市场行情。九类目录需要成套发布。建议原子替换整份 `dist/`；如果使用 CDN 缓存，要确保 manifest 和各目录文件来自同一次构建，避免新 manifest 与旧缓存数据混用。

修改这些文件后必须重新运行：

```bash
npm run check
```

然后重新部署新的 `dist/`。

所有 JSON 都会在浏览器中经过 Zod 校验和跨目录关系校验。模型、GPU、整机、价格或性能记录之间的 ID 引用错误会阻止无效数据静默进入计算。

## 9. 浏览器本地数据不会自动跟随部署

页面内保存的自定义模型、自定义整机、场景和导入数据存放在当前浏览器的 localStorage 中：

- 不会上传到服务器。
- 不会自动同步到其他电脑或浏览器。
- localStorage 按协议、域名、端口和浏览器 Profile 隔离。`localhost`、Vercel Preview、生产域名和自定义域名互不共享。
- 重新部署同一个域名通常不会清除本地数据，但不能把 localStorage 当作唯一备份。
- 无痕模式、清理站点数据、浏览器策略、换设备或写满浏览器配额都可能使保存不可用。

迁移域名、清理浏览器或交付给销售前，应在 **Data Status / 数据状态** 中分别导出：

- **Full Data Pack**：团队共享的完整目录与假设。
- **Browser Library**：本地新增的模型、整机和 Artificial Analysis 对比快照。

在新站点中重新导入这两个文件即可恢复相应数据。场景分享 URL 只保存计算输入；如果 URL 引用了浏览器本地模型或整机，接收方还需要导入对应的 Browser Library。

Full Data Pack、Browser Library 和 Artificial Analysis 快照的单文件导入上限目前均为 4 MiB。该限制不代表浏览器一定提供足够的 localStorage 配额，因此重要资料仍应显式导出 JSON 备份。

## 10. 外部数据与安全边界

- 汇率：浏览器可以刷新 USD 基准的每日参考汇率；请求失败时使用 Data Pack 内的静态回退值，不会阻止计算器启动。
- Artificial Analysis：前端不会接收或保存 API Key。不要把 Key 配置成 `VITE_*` 或打包进浏览器。应在可信服务端、CI 或构建环境中取得官方 JSON 快照，再从模型对比面板导入。
- 云端价格：内部计算统一使用 USD / 100 万 Tokens，显示货币转换只发生在输入和展示边界。
- 隐私、能力和延迟等级：这些是 `assumptions.json` 中可配置的售前规划策略，不是法律结论或行业统一等级。
- GPU 目录：`supportedCounts` 表示整机可提供的物理显卡数量；只有 `supportsTensorParallel` 为 `true` 时，单个模型才会合并多卡显存。可选的 `peakAiTops` 必须写明精度口径，并附带含日期和 HTTP(S) 来源的规格证据；该值不会换算成 LLM TPS。
- ThinkCentre 默认项：X Ultra 与 X Tower 当前按用户提供的预发布资料加入，属于方向性数据。X Tower 的负载值来自 TCX 34L Thermal Matrix 中 U9/U7 组合的 `Calculated power`，是设计计算值而非墙上实测功耗；空载功耗和整机价格仍为暂无数据，因此不会计算本地/混合成本或盈亏平衡。双卡配置不会在缺少模型分片证据时自动合并显存，也不会由 TOPS、TGP、电源额定功率或兼容性文案推导 TPS。

### 使用频率不是固定的“高中低”

Daily、Heavy、Always-on 等名称只代表当前 Data Pack 的起始模板，不是行业统一定义。页面会把每个选项量化为：每用户每工作日请求数、每日活跃小时、每月工作日，以及推导出的每用户每月请求数。选择模板后，这些数字仍可直接修改，以客户真实用量为准。

### 模型目录与智能评分

内置目录当前提供 22 个有代表性的本地/开放权重模型；其中 Qwen3.6 35B、Gemma 4 26B 与 Ornith 1.5 35B 各有一条 AI Fusion Turbo 选项（K8/Q3 KV，约 5GB 到内存、约 1GB KV 到 SSD、安全余量 5%）。它是可扩充的起始集合，不代表穷举市场全部模型。Artificial Analysis 的开放模型目录只用于发现主流模型家族，参数、上下文、许可与部署说明以模型发布方的模型卡为准。它提供的云端价格、速度、延迟或智能评分不会被静默当成本地 TPS 或硬件适配证据。用户仍可通过 Full Data Pack 或 Browser Library 新增、修改和删除模型。

选择“智能”对比指标时，页面会解释当前 Artificial Analysis Intelligence Index v4.1.1：共 9 项评测，Agents 34%、Coding 24%、Scientific Reasoning 24%、General 18%，通常采用英文文本与 pass@1 类条件。它是相对综合分，不代表模型一定能在某张显卡上运行，也不代表 TPS、客户任务适配度或生产可用性。导入的记录只会在同一接口和同一指数版本内对比；内置方向性示例分数会明确显示为另一套数据口径。

## 11. 上线后的验收清单

部署完成后至少检查：

- 首页可正常打开，页面没有空白或 404。
- Data Status 显示正确的数据版本，目录 JSON 都加载成功。
- 中英文切换正常。
- 修改场景后刷新页面，状态可以恢复。
- 复制分享 URL 后在新标签页打开，结果一致。
- 自定义模型和整机可以保存、编辑、删除并导出 Browser Library。
- 一个无效 Data Pack 会显示错误，但不会替换当前有效数据。
- 断开网络或汇率请求失败时，页面仍能用静态汇率启动。
- 在约 390px 宽度的手机页面上没有整页横向溢出。

## 12. 常见问题

### 部署后白屏或资源 404

确认发布目录是 `dist`，并且上传的是 `dist/` 的完整内容。不要把项目源码目录直接当作静态站点目录，也不要通过 `file://` 打开。

### 构建平台提示 Node 版本过低

将平台 Node.js 版本设置为 `22.13.0` 或更高。项目的 `package.json`、Netlify 配置和 GitHub Actions 已声明该版本要求。

### 新部署看不到我本机保存的模型或整机

这些记录属于当前域名下的浏览器本地资料库。请从旧站点导出 Browser Library，再在新站点导入。

### 是否需要服务器保存数据

不需要。当前产品原则是 Portable、Static、Configurable、Data-driven。需要团队共享的内容应进入 Full Data Pack 或随代码发布的 `public/data/`，个人草稿保存在 Browser Library。

## 13. 日常更新流程

```bash
npm ci
npm run check
```

检查通过后提交代码并推送；连接了代码仓库的 Vercel、Netlify 或 GitHub Pages 会自动发布。上线前建议先导出浏览器本地资料库，并保留上一个可用构建作为回滚版本。
