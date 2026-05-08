# Anime Radar

Anime Radar 是一个 **个人动漫情报收集与推荐网页工具** MVP。它不是普通排行榜，而是根据个人口味规则给作品打 `personalFitScore`，帮助筛选更值得深入观看、拆镜头、分析音乐/美术/角色关系与主题结构的作品。

第一版严格使用本地 mock 数据：

- 不做真实爬虫
- 不抓盗版资源
- 不抓播放链接
- 不使用数据库
- 页面只读取 `data/anime.json`

## 技术栈

- Next.js App Router
- React
- Tailwind CSS
- TypeScript
- 本地 JSON 数据

## 本地运行

```bash
npm install
npm run dev
```

打开 <http://localhost:3000> 查看页面。

生产构建：

```bash
npm run build
npm run start
```

类型检查：

```bash
npm run typecheck
```

## 项目结构

```text
app/
  components/anime-radar.tsx  # 首页交互、筛选、弹窗、收藏、导出
  globals.css                 # Tailwind 与暗色终端风格
  layout.tsx                  # 页面元数据与全局布局
  page.tsx                    # 从 data/anime.json 读取数据
data/
  anime.json                  # 本地 mock 动漫数据
  sources.json                # 合规数据源配置
  import/staging-anime.json   # 外部导入暂存区，先清洗/去重/冲突检查
scripts/
  update-anime.ts             # 数据导入/更新脚本框架，默认 dry-run
  import-anime.ts             # 兼容旧命令的入口，转到 update-anime.ts
```

## 功能

- 首页卡片展示动漫推荐列表
- 展示标题、原名、年份、集数、状态、类型、标签、来源评分、个人适配度、推荐理由、风险提醒与来源链接
- 支持按年份、类型、集数范围、状态、标签和最低适配度筛选
- 点击作品卡片或“详情”打开详情弹窗
- 详情弹窗展示简介、适合原因、不适合原因、来源名称与来源链接
- 收藏功能使用浏览器 `localStorage`
- “不感兴趣”会标记并隐藏作品，同样使用 `localStorage`
- 支持导出当前筛选结果为 JSON 或 CSV
- 暗色资料库 / 情报终端 / 作品档案馆视觉风格
- 移动端适配

## 如何添加数据

编辑 `data/anime.json`，追加对象即可。每条记录必须包含：

```json
{
  "title": "作品标题",
  "originalTitle": "Original Title",
  "year": 2026,
  "episodes": 12,
  "status": "完结",
  "genres": ["科幻", "悬疑"],
  "tags": ["世界观密度高", "音乐叙事"],
  "summary": "简介",
  "sourceRating": 8.5,
  "personalFitScore": 90,
  "whyForMe": "为什么适合我",
  "risk": "可能不适合我的原因",
  "sourceName": "来源名称",
  "sourceUrl": "https://example.com/source"
}
```

建议：

1. `personalFitScore` 使用 0-100。
2. `genres` 适合做大类筛选，例如“科幻”“悬疑”“奇幻”。
3. `tags` 适合记录分析视角，例如“世界观密度高”“音乐叙事”“作者性”。
4. `sourceUrl` 只放合法元数据页面，不放盗版资源或播放链接。

## 如何修改评分规则

当前评分是数据字段，不在前端自动计算。你可以按下面规则手动维护 `personalFitScore` 与 `whyForMe`：

高权重：

- 世界观密度高
- 视听语言强，镜头、音乐、美术能参与叙事
- 有明显作者性或风格化表达
- 剧情有结构，不只是堆设定
- 有分析价值，适合拆镜头、音乐、角色关系和主题
- 音乐和画面结合强
- 情绪表达不是单纯煽情，而是有结构支撑

低权重或排除：

- 纯厕纸爽文
- 公式化异世界
- 只有热度没有表达
- 后宫卖角色但叙事贫血
- 过长且水分高
- 只有设定但缺少演出
- 推荐理由只写“评分高”“很多人喜欢”的作品

如果想让脚本自动计算分数，可以在 `scripts/update-anime.ts` 中新增一个评分函数，例如基于标签权重、集数惩罚、状态风险和人工修正值生成 `personalFitScore`。

## 数据导入 / 更新框架

第一版只提供稳定、可审查的导入框架，默认不进行任何真实网络请求。外部数据必须先进入 staging，再由脚本统一清洗、去重、冲突检测和生成报告，最后才允许在 write 模式写回 `data/anime.json`。请继续遵守：

- 不抓盗版资源
- 不抓播放链接
- 不高频请求网站
- 尊重 `robots.txt`、API 服务条款和网站规则
- 只导入公开、合法、非盗版的作品元数据

### staging-anime.json 的用途

`data/import/staging-anime.json` 是导入暂存文件。无论未来数据来自人工整理、公开 API，还是合规爬虫 adapter，都应该先写入这个文件或同等 staging 流程，不要直接改写 `data/anime.json`。

staging 的好处是：

1. 先把外部字段标准化为项目字段，避免每个来源各自覆盖主数据。
2. 先按标题、原名、别名和年份去重，避免重复作品进入页面数据。
3. 先生成 `reports/import-report.json`，把新增、更新、跳过、冲突、manual lock 保留和疑似重复全部列出来。
4. dry-run 不会修改主数据，只有显式 write 才会写入 `data/anime.json`。

示例：

```json
[
  {
    "title": "纸月观测站",
    "originalTitle": "Paper Moon Observatory",
    "year": 2026,
    "episodes": 12,
    "status": "未开播",
    "genres": ["科幻", "青春"],
    "tags": ["天文意象", "成长"],
    "summary": "简介",
    "sourceRating": null,
    "sourceName": "Manual Import Example",
    "sourceUrl": "https://example.com/legal-metadata/paper-moon-observatory"
  }
]
```

如果来源没有评分，`sourceRating` 使用 `null`，不要用 `0` 伪造评分。Wikipedia 可以作为标题、年份、集数、简介等元数据来源，但不要从 Wikipedia 编造 `sourceRating`。

### 字段类型与覆盖规则

脚本明确区分三类字段：

1. 客观来源字段：`title`、`originalTitle`、`year`、`episodes`、`status`、`genres`、`summary`、`sourceRating`、`sourceName`、`sourceUrl`。这些字段允许外部来源更新，但发生冲突时按来源可信度处理。
2. 个人判断字段：`personalFitScore`、`whyForMe`、`risk`、`tags`。这些字段默认被保护，不允许外部来源覆盖已有非空值。
3. 系统辅助字段：`id`、`aliases`、`sources`、`lastUpdated`、`confidence`、`manualLockedFields`。这些字段可由脚本新增，用于追踪别名、来源、更新时间、置信度和人工锁定。

### `data/sources.json` 配置与 trustLevel

`data/sources.json` 是数据源清单。每个来源建议包含 `trustLevel`（或后续等价的 `priority`）：

```json
{
  "id": "staging-import",
  "name": "Staging JSON Import",
  "enabled": true,
  "type": "manual-json",
  "description": "从 data/import/staging-anime.json 导入暂存的合法元数据；不抓取网页、不包含播放链接。",
  "path": "data/import/staging-anime.json",
  "trustLevel": 60
}
```

字段说明：

1. `id`：稳定唯一标识，用来定位 adapter。
2. `name`：导入报告中展示的人类可读名称。
3. `enabled`：是否启用该来源。当前脚本固定读取 staging；后续多 adapter 可用它控制来源。
4. `type`：当前支持 `manual-json`；`api-placeholder` 仅占位，不会联网。
5. `path`：`manual-json` 的输入文件路径，相对项目根目录。
6. `trustLevel`：来源可信度。客观字段冲突时，较高 `trustLevel` 优先；相同可信度时保留 `data/anime.json` 既有值，并在报告里记录冲突。
7. `baseUrl`：后续 API adapter 可使用的入口地址；当前不会请求。

### 去重与疑似重复

导入时优先按“标准化标题 + 年份”去重。标准化会忽略大小写、空格、标点和符号差异，并同时检查：

- `title`
- `originalTitle`
- `aliases`

如果标题、原名或别名与年份能明确匹配，脚本会自动合并。如果只是相似但无法确认，脚本不会自动合并，而是跳过导入项并写入 `reports/import-report.json` 的 `possibleDuplicates`，等待人工检查。

### manualLockedFields 如何使用

`manualLockedFields` 可以放在 `data/anime.json` 的单条作品对象中，用来声明绝不能被导入覆盖的字段，例如：

```json
{
  "title": "某作品",
  "year": 2026,
  "manualLockedFields": ["personalFitScore", "whyForMe", "risk", "tags"]
}
```

默认情况下，脚本已经保护 `personalFitScore`、`whyForMe`、`risk`、`tags` 这四个个人判断字段：已有非空值会被保留；只有主数据里对应字段为空时，才允许从 staging 补齐。若某字段显式写入 `manualLockedFields`，导入时会在报告中记录该字段被保留，避免人工判断被外部元数据覆盖。

### Dry-run 预览

默认就是 dry-run，只读取 `data/import/staging-anime.json`、生成预览和 `reports/import-report.json`，不会写入 `data/anime.json`：

```bash
npm run update:anime
```

也可以显式传入：

```bash
npm run update:anime -- --dry-run
```

兼容旧命令：

```bash
npm run import:anime
```

### 查看 import-report.json

每次 dry-run 或 write 都会生成 `reports/import-report.json`。重点查看：

- `added`：将新增哪些作品
- `updated`：将更新哪些作品，以及字段列表
- `skipped`：跳过哪些作品和原因
- `conflicts`：哪些客观字段冲突、双方值、双方 `trustLevel` 和处理结果
- `manualLocksPreserved`：哪些个人判断字段因为默认锁或 `manualLockedFields` 被保留
- `possibleDuplicates`：哪些疑似重复需要人工检查

命令行查看示例：

```bash
cat reports/import-report.json
```

### 正式写入

写入模式必须显式确认。交互式终端中运行：

```bash
npm run update:anime -- --write
```

非交互环境或 CI 中运行：

```bash
npm run update:anime -- --write --yes
```

脚本只会在确认后把合并结果写回 `data/anime.json`。建议写入前先执行 dry-run 并检查 `reports/import-report.json`。

### 后续如何添加真实 API 或爬虫 adapter

1. 优先选择官方或公开授权的元数据 API，不接入盗版站。
2. 真实 API / 爬虫 adapter 先把外部记录写入 staging 或返回 staging 等价结构，不直接写 `data/anime.json`。
3. 在 `data/sources.json` 新增来源，设置 `trustLevel`，并使用新的 `type`，例如 `public-api`。
4. 在 `scripts/update-anime.ts` 中为该 `type` 增加 adapter，但仍复用标准化、去重、manual lock、trustLevel 冲突处理和报告生成逻辑。
5. adapter 必须限速、缓存、设置合理 User-Agent，并尊重 `robots.txt`、API rate limit 和服务条款。
6. 只读取标题、年份、集数、状态、类型、简介、评分、合法元数据页面等信息；不要读取播放地址、下载地址或绕过访问限制。
7. 先经过 staging 和 conflict report，可以让不同来源的数据在进入主数据前被统一审查，避免 A 来源刚写入的个人判断、合法来源链接或高可信元数据被 B 来源静默覆盖。

## 部署到 Vercel

1. 将项目推送到 GitHub/GitLab/Bitbucket。
2. 在 Vercel 中导入仓库。
3. Framework Preset 选择 **Next.js**。
4. Build Command 使用默认 `next build`。
5. Output Directory 保持默认。
6. 部署完成后即可访问。

因为数据来自本地 JSON 文件，所以不需要额外数据库或环境变量。
