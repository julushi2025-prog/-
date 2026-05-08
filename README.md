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
  import/manual-anime.json    # manual-import 示例输入文件
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

第一版只提供稳定、可审查的导入框架，默认不进行任何真实网络请求。请继续遵守：

- 不抓盗版资源
- 不抓播放链接
- 不高频请求网站
- 尊重 `robots.txt`、API 服务条款和网站规则
- 只导入公开、合法、非盗版的作品元数据

### `data/sources.json` 配置

`data/sources.json` 是数据源清单。每个来源建议包含：

```json
{
  "id": "manual-import",
  "name": "Manual JSON Import",
  "enabled": true,
  "type": "manual-json",
  "description": "从 data/import/manual-anime.json 导入人工整理的合法元数据；不抓取网页、不包含播放链接。",
  "path": "data/import/manual-anime.json"
}
```

字段说明：

1. `id`：稳定唯一标识，用来定位 adapter。
2. `name`：导入报告中展示的人类可读名称。
3. `enabled`：是否启用该来源。关闭后脚本会忽略。
4. `type`：当前支持 `manual-json`；`api-placeholder` 仅占位，不会联网。
5. `path`：`manual-json` 的输入文件路径，相对项目根目录。
6. `baseUrl`：后续 API adapter 可使用的入口地址；当前不会请求。

### manual-import 示例

`manual-import` 默认读取 `data/import/manual-anime.json`。这个文件可以是外部合规元数据的暂存区，例如：

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
    "sourceRating": 0,
    "sourceName": "Manual Import Example",
    "sourceUrl": "https://example.com/legal-metadata/paper-moon-observatory"
  }
]
```

脚本会把外部字段标准化为 `data/anime.json` 当前使用的结构，并按 `title + year` 去重。对于已存在的作品，脚本会保留人工维护字段：

- `personalFitScore`
- `whyForMe`
- `risk`
- `tags`

只有导入内容明显更完整时，`whyForMe` / `risk` 才会被替换；`tags` 会合并去重，避免覆盖已有人工标签。

### Dry-run 预览

默认就是 dry-run，只展示将要新增、更新或跳过的记录，不写入 `data/anime.json`：

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

### 正式写入

写入模式必须显式确认。交互式终端中运行：

```bash
npm run update:anime -- --write
```

非交互环境或 CI 中运行：

```bash
npm run update:anime -- --write --yes
```

脚本只会在确认后把合并结果写回 `data/anime.json`。建议写入前先执行 dry-run 并检查预览结果。

### 后续如何添加真实 API 或爬虫 adapter

1. 优先选择官方或公开授权的元数据 API，不接入盗版站。
2. 在 `data/sources.json` 新增来源，使用新的 `type`，例如 `public-api`。
3. 在 `scripts/update-anime.ts` 的 `loadSource` 中为该 `type` 增加 adapter。
4. adapter 必须限速、缓存、设置合理 User-Agent，并尊重 `robots.txt`、API rate limit 和服务条款。
5. 只读取标题、年份、集数、状态、类型、简介、评分、合法元数据页面等信息；不要读取播放地址、下载地址或绕过访问限制。
6. adapter 返回外部记录后，继续复用脚本里的字段标准化、去重和人工字段保留逻辑，最终仍输出到 `data/anime.json`，前端无需接数据库。

## 部署到 Vercel

1. 将项目推送到 GitHub/GitLab/Bitbucket。
2. 在 Vercel 中导入仓库。
3. Framework Preset 选择 **Next.js**。
4. Build Command 使用默认 `next build`。
5. Output Directory 保持默认。
6. 部署完成后即可访问。

因为数据来自本地 JSON 文件，所以不需要额外数据库或环境变量。
