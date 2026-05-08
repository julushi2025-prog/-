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
  sources.json                # 后续合规数据源配置
scripts/
  import-anime.ts             # 未来导入脚本框架，MVP 不联网导入
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

如果想让脚本自动计算分数，可以在 `scripts/import-anime.ts` 中新增一个评分函数，例如基于标签权重、集数惩罚、状态风险和人工修正值生成 `personalFitScore`。

## 以后如何替换为真实数据源

1. 在 `data/sources.json` 中添加合规数据源配置。
2. 在 `scripts/import-anime.ts` 中实现对应 adapter。
3. 只导入公开、合法、非盗版的元数据。
4. 不抓播放链接、不绕过访问限制、不抓盗版站。
5. 导入后仍输出到 `data/anime.json`，前端无需改数据库连接。

运行预留导入脚本：

```bash
npm run import:anime
```

当前脚本只读取配置并重新格式化本地数据，不执行网络请求。

## 部署到 Vercel

1. 将项目推送到 GitHub/GitLab/Bitbucket。
2. 在 Vercel 中导入仓库。
3. Framework Preset 选择 **Next.js**。
4. Build Command 使用默认 `next build`。
5. Output Directory 保持默认。
6. 部署完成后即可访问。

因为数据来自本地 JSON 文件，所以不需要额外数据库或环境变量。
