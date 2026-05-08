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

### GitHub Actions 手动运行 AniList dry-run

由于 Codex Cloud 环境可能无法直连 AniList，请不要依赖 Codex Cloud 做 AniList live API 测试。项目新增了一个只需手动触发的 GitHub Actions 工作流：`.github/workflows/anilist-dry-run.yml`。

使用方式：

1. 打开 GitHub 仓库页面，进入 **Actions**。
2. 在左侧工作流列表选择 **AniList Dry-run Import**。
3. 点击 **Run workflow**。
4. 在 `queries` 输入框填写要测试的 AniList 搜索标题；支持用 `|`、英文逗号 `,`、分号 `;` 或换行分隔，空白项会被忽略。推荐单行格式是：

   ```text
   Serial Experiments Lain | Neon Genesis Evangelion | Puella Magi Madoka Magica
   ```

   也可以继续使用每行一个标题。默认批量测试列表是：

   ```text
   Serial Experiments Lain | Neon Genesis Evangelion | Puella Magi Madoka Magica
   Made in Abyss | FLCL | Ghost in the Shell: Stand Alone Complex
   Revolutionary Girl Utena | Monogatari Series
   ```

5. 再次点击 **Run workflow** 启动任务。
6. 任务会运行 `npm install`，把 `queries` 按 `|`、英文逗号、分号和换行拆成多个 `--query` 参数，然后执行只读 dry-run，例如：

   ```bash
   npm run update:anime -- --source anilist --query "Serial Experiments Lain" --query "Neon Genesis Evangelion" --dry-run
   ```

7. dry-run 不会自动 commit、不会自动合并、不会执行 write，也不会写入 `data/anime.json`。它只会生成或更新：
   - `data/import/staging-anime.json`
   - `reports/import-report.json`
8. 工作流结束后，在该次运行页面的 **Artifacts** 区域下载 `anilist-dry-run-results`，查看上述两个 dry-run 文件。

这个流程只请求 AniList 的合法公开元数据 API；不要抓盗版资源，不要抓播放链接，不要高频请求，也不要覆盖 `personalFitScore`、`whyForMe`、`risk`、`tags` 等个人判断字段。`summary`、`genres`、`originalTitle` 仍按本地展示字段保护逻辑处理。

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
- `needsReview`：哪些来源匹配置信度不足或需要人工确认
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

### 临时 AniList Vercel 连通性测试接口

项目提供一个临时开发测试接口，用于验证 Vercel 部署环境是否可以访问 AniList live GraphQL API：

```text
/api/test-anilist?query=Serial%20Experiments%20Lain
```

注意：

1. 这是临时测试接口，不是正式爬虫，也不是正式导入功能。
2. 只接受 `query` 查询参数；`query` 为空时返回 `400`。
3. 每次请求只向 AniList GraphQL API 发起一次请求，最多返回 3 条标准化结果。
4. 返回字段只包含 `title`、`originalTitle`、`year`、`episodes`、`status`、`genres`、`sourceRating`、`sourceUrl`。
5. 不抓取播放链接，不抓取盗版资源，不保存任何外部数据。
6. 该接口不会修改 `data/anime.json`、不会写入 `data/import/staging-anime.json`，也不会生成 `reports/import-report.json`。

### AniList adapter

项目现在提供第一个真实公开动漫元数据来源 adapter：AniList GraphQL API。它只请求公开作品元数据，不抓网页、不抓播放地址、不写入盗版资源链接。AniList 返回的数据仍然必须先进入 `data/import/staging-anime.json`，再复用现有 staging、dry-run、write、冲突报告、`manualLockedFields` 和 `trustLevel` 机制处理。

#### 查询方式

可以直接传入一个或多个 `--query`：

```bash
npm run update:anime -- --source anilist --query "Serial Experiments Lain" --dry-run
```

多个标题请重复 `--query`：

```bash
npm run update:anime -- --source anilist --query "Serial Experiments Lain" --query "Mushishi" --dry-run
```

单个 `--query` 值以及 `data/import/search-queries.json` 中的字符串也支持用 `|`、英文逗号 `,`、分号 `;` 或换行分隔。推荐单行格式：

```text
Serial Experiments Lain | Neon Genesis Evangelion | Puella Magi Madoka Magica
```

脚本会在内部拆成多个查询；如果没有解析到任何标题，AniList 导入会失败而不是生成空结果。

如果没有传入 `--query`，脚本会读取 `data/import/search-queries.json`。该文件可以是字符串数组，也可以是包含 `queries` 数组的对象。

#### dry-run

AniList dry-run 会请求 AniList、限速处理查询、标准化字段、写入 `data/import/staging-anime.json`、生成 `reports/import-report.json`，但不会修改 `data/anime.json`：

```bash
npm run update:anime -- --source anilist --query "Serial Experiments Lain" --dry-run
```

#### write

只有显式传入 `--write` 才允许把 staging 候选合并进 `data/anime.json`。在非交互环境中还需要 `--yes` 跳过确认提示。合并仍会经过现有去重、疑似重复、冲突检测、`trustLevel` 比较和人工字段保护规则：

```bash
npm run update:anime -- --source anilist --query "Serial Experiments Lain" --write --yes
```

如果 AniList 返回多个相近结果，或者最佳匹配置信度不足，脚本会把候选标记为 `needsReview` 并写入 `reports/import-report.json`，不会自动合并进主数据。


### AniList 批量 discovery 候选发现

除按已知标题逐条 `--query` 导入外，项目现在支持 AniList 官方 GraphQL API 的批量 discovery 模式，用来发现候选作品并写入暂存区。该模式仍然遵守现有安全边界：

- 不改 UI。
- 不抓盗版资源，不抓播放链接。
- 只请求 AniList 官方 GraphQL API 的公开作品元数据。
- 只写入 `data/import/staging-anime.json` 与 `reports/import-report.json`。
- 不直接写入或合并 `data/anime.json`。
- 后续人工确认或单独 write 导入时，继续复用现有去重、疑似重复、冲突检测、local display fields 保护与 manual lock 规则。

本地 dry-run 示例：

```bash
npm run discover:anilist -- --mode trending --limit 25 --maxEpisodes 26
```

也可以直接使用底层脚本：

```bash
npm run update:anime -- --source anilist --discover --mode popular --limit 50 --yearFrom 2024 --yearTo 2026 --maxEpisodes 26 --dry-run
```

支持的 discovery 条件：

| 参数 | 说明 |
| --- | --- |
| `--mode` | `trending`、`popular`、`genre`、`tag`、`year`。 |
| `--genres` | AniList genre 列表，支持用 `|`、英文逗号、分号或换行分隔。 |
| `--tags` | AniList tag 列表，支持用 `|`、英文逗号、分号或换行分隔。 |
| `--yearFrom` / `--yearTo` | 开播年份范围。 |
| `--format` | 可选 AniList format 过滤，例如 `TV`、`MOVIE`、`ONA`、`OVA`。即使设置该项，默认仍排除 `MUSIC`、`SPECIAL`。 |
| `--status` | 可选 AniList status 过滤，例如 `FINISHED`、`RELEASING`、`NOT_YET_RELEASED`。 |
| `--minEpisodes` / `--maxEpisodes` | 集数范围过滤；超出范围会计入 `excludedByEpisodeCount`。 |
| `--limit` | 每次最多暂存候选数，限制在 1-100；GitHub workflow 提供 25 / 50 / 100。 |

默认排除规则：

- 排除 AniList `format` 为 `MUSIC` 或 `SPECIAL` 的条目。
- 排除标题、format 或标签中明显属于 `trailer`、`OP`、`ED`、`PV`、`CM`、commercial / preview 等短宣传素材的条目。
- 如果设置了集数范围，超出范围的条目会跳过。

Discovery 生成的 staging 候选会包含初步客观字段：`title`、`originalTitle`、`year`、`episodes`、`status`、`genres`、`sourceRating`、`sourceName`、`sourceUrl`、`sourceId`、`aliases`、`externalSummary`。`personalFitScore`、`whyForMe`、`risk` 和 `tags` 不会伪造确定推荐理由；候选会在报告的 `needsReview` 中提示人工补充这些个人判断字段。

`reports/import-report.json` 会额外展示 discovery 相关计数：

- `discovered`
- `addedCandidates`
- `updatedCandidates`
- `skipped`
- `needsReview`
- `possibleDuplicates`
- `excludedByFormat`
- `excludedByEpisodeCount`

### GitHub Actions 手动 AniList discovery PR

项目新增手动 workflow：`.github/workflows/anilist-discover-pr.yml`。它会运行 AniList discovery、提交 staging/report 变更并创建 PR，但不会提交 `data/anime.json`。

运行方式：

1. 打开 GitHub 仓库的 **Actions** 页面。
2. 选择 **AniList Discovery Candidate PR**。
3. 点击 **Run workflow**。
4. 设置输入：
   - `mode`：`trending` / `popular` / `genre` / `tag` / `year`。
   - `genres`：可选，genre 列表。
   - `tags`：可选，tag 列表。
   - `yearFrom` / `yearTo`：可选年份范围。
   - `maxEpisodes`：可选最大集数。
   - `limit`：25、50 或 100。
5. workflow 会执行类似下面的命令：

   ```bash
   npm run update:anime -- --source anilist --discover --mode trending --limit 25 --maxEpisodes 26 --dry-run
   ```

6. PR 只包含：
   - `data/import/staging-anime.json`
   - `reports/import-report.json`

请先人工检查 staging 与 report，再决定是否通过现有 write import 流程把候选合并进主数据。

### GitHub Actions 手动 AniList write PR

项目提供手动工作流 `.github/workflows/anilist-write-pr.yml`，用于在 GitHub Actions 中执行 AniList write 导入，并把结果提交到一个新的 Pull Request。这个 workflow 不会自动合并，也不会直接写入 `main`。

运行方式：

1. 打开 GitHub 仓库的 **Actions** 页面。
2. 选择 **AniList Write Import PR** workflow。
3. 点击 **Run workflow**。
4. 在 `queries` 输入框中填写要导入的 AniList 查询标题；支持用 `|`、英文逗号 `,`、分号 `;` 或换行分隔，空白项会被忽略。推荐格式：

   ```text
   Serial Experiments Lain | Neon Genesis Evangelion | Puella Magi Madoka Magica
   ```

5. 启动后，workflow 会运行：

```bash
npm run update:anime -- --source anilist --query "标题" --write --yes
```

workflow 会先把输入按 `|`、英文逗号、分号和换行拆分；如果没有解析到任何 query，会直接失败并且不会创建空 PR。解析成功后，每个标题都会转换为独立的 `--query` 参数，并在 write 模式下生成 / 更新：

- `data/anime.json`
- `data/import/staging-anime.json`
- `reports/import-report.json`

随后 workflow 只会把上述三个文件的改动提交到新分支，并自动创建标题为 **Update anime data from AniList** 的 Pull Request。PR 描述会汇总新增、更新、跳过、`needsReview`、`conflicts` 和 `manual locks preserved` 数量；如果报告中存在 `needsReview`，PR 描述会提醒先人工检查 `reports/import-report.json`，但不会自动合并。

导入合并仍复用现有保护规则：`personalFitScore`、`whyForMe`、`risk` 和非空 `tags` 不会被 AniList 覆盖；本地非空 `summary`、`genres`、`originalTitle` 也会被保留，只有这些字段为空时才接受外部值。

#### AniList 字段映射

AniList adapter 会把 GraphQL 返回的公开元数据标准化为当前 `anime.json` 字段：

| 当前字段 | AniList 字段 | 规则 |
| --- | --- | --- |
| `title` | `title.english` / `title.romaji` | 优先英文标题，没有则用罗马音标题。 |
| `originalTitle` | `title.native` | 使用原生标题；缺失时回退到 `title`。 |
| `year` | `startDate.year` | 使用开播年份。 |
| `episodes` | `episodes` | 缺失时暂存为 `0`，避免伪造集数。 |
| `status` | `status` | `FINISHED` / `CANCELLED` 映射为 `完结`，`RELEASING` 映射为 `连载中`，其他映射为 `未开播`。 |
| `genres` | `genres` | 原样去重导入。 |
| `tags` | `tags` | 去除剧透标签，按 rank 取最多 8 个；已有主数据 `tags` 非空时不会被覆盖。 |
| `summary` | `description(asHtml: false)` | 去 HTML/实体并压缩为简短简介。 |
| `sourceRating` | `averageScore` / `meanScore` | 优先 `averageScore`，其次 `meanScore`；缺失时使用 `null`，不写 `0`。 |
| `sourceName` | 固定值 | 写入 `AniList`。 |
| `sourceUrl` | `siteUrl` | 只保留合法 HTTP(S) 元数据页面链接；不会导入播放或下载链接。 |

`personalFitScore`、`whyForMe`、`risk` 和已有非空 `tags` 继续作为人工字段被保护；外部来源只能在这些字段为空时补齐，不能覆盖现有人工判断。
