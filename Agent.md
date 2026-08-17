# Agent.md — Into / 兴趣雷达

个人本地优先的"兴趣记录"桌面 App。记录"最近让我心里动了一下的东西"：一句话 + 1~5 的温度，
长期积累后回看"最近的我"。不是 Todo、不是笔记、不是打卡工具。

## 技术栈
- Tauri 2（桌面壳，Rust 后端）
- React 19 + TypeScript + Vite 7
- SQLite（rusqlite `bundled`，数据落在 AppData，纯本地，无系统库依赖）
- 前端通过 `@tauri-apps/api/core` 的 `invoke` 调用 Rust command；前端绝不直接写 SQL
- 窗口外壳（拖拽/缩放/最小化/关闭）用 `@tauri-apps/api/window` 的 `getCurrentWindow()`

## 核心原则（产品）
1. 本地优先、隐私优先：无云端、无账号、无遥测、无第三方分析、不使用外部字体/网络请求。
2. 第一版不依赖任何 AI / 付费 API；AI 只能在"可选、本地"前提下未来考虑。
3. 极低输入成本：想到 → 打分 → 保存。
4. 观察兴趣，而不是管理人生：不做打卡 / 效率 / 完成度。
5. 原始输入是不可动摇的核心数据；分类 / 标签 / 聚类都只是分析结果，不覆盖原始文字。
6. 录入态永远是首页；回顾 / 汇总是"另一个入口"（顶部"写一点 / 看看"切换）。
7. 分数称为"温度"（1~5）；分析用简单、可解释、本地的算法，不引入复杂模型。

## 数据模型
`entries(id, content TEXT, score INTEGER 1~5, created_at INTEGER 毫秒, updated_at INTEGER?)`
- 命令：`add_entry` / `update_entry` / `delete_entry` / `review(start_ms, end_ms, search)`
- `review` 返回 `{ entries, summary }`：列表（时间倒序，最多 500）+ 可解释统计（条数、平均温度、1~5 分布）
- 时间范围语义：半开区间 `start_ms <= created_at < end_ms`
- 搜索：按空白拆分为多关键词，AND 关系（`content LIKE %token%`）

## 窗口定制（无原生标题栏）
- 用 `decorations: false`（tauri.conf.json）去掉 Windows 原生黑框；保留 `shadow: true` + `center: true`。
- 自定义边框：一个 `.resize-frame` 覆盖层（`position: fixed; inset: 0; border: 1px solid var(--line); pointer-events: none`），
  纯视觉、不挡操作，替代丑陋的原生边框。
- 拖拽移动：在 `<header className="topbar">` 上加 `onMouseDown`，调用 `getCurrentWindow().startDragging()`；
  处理函数里若 `e.target.closest("button")` 命中按钮则跳过，保证"写一点 / 看看 / 最小化 / 关闭"仍可点。
  **不要依赖 `data-tauri-drag-region` 属性**——当前 Tauri 2 版本里它不稳定、经常不触发。
- 缩放：8 个透明热区（上 / 下 / 左 / 右 + 四角，`.rh-*`），`onMouseDown` 调 `getCurrentWindow().startResizeDragging(dir)`。
- 不要用 `.drag-spacer` 之类 0 高度的 flex 子项做拖拽区——`align-items: center` 下它会被算成 0 高度，
  点不到；直接让整条顶栏可拖最稳。

## Tauri 2 窗口 API 实际写法（避坑）
- 拖拽：`getCurrentWindow().startDragging(): Promise<void>`
- 缩放：`getCurrentWindow().startResizeDragging(direction: ResizeDirection): Promise<void>`
  - `ResizeDirection` 是 `@tauri-apps/api/window` 里的联合字符串类型
   （`'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West'`），
    **未导出**，前端用等价本地类型即可。
  - 没有 `startResizing` / `Edge`（旧文档常见写法，本版不存在）。
- 权限（capabilities/default.json）需要：`core:window:allow-start-dragging`、
  `core:window:allow-start-resize-dragging`（注意是 `resize-dragging`，不是 `start-resizing`）、
  `core:window:allow-minimize`、`core:window:allow-close`。
- 改 capabilities 后 `cargo check` 会校验权限名合法性（未知权限会直接报错）。

## 开发约定（必须遵守）
- **每次实现 / 修改功能，都要补充丰富的单元测试。**
  - Rust 侧：用 `cargo test`，通过 `Connection::open_in_memory()` 建内存库，覆盖 CRUD、参数校验、
    时间范围过滤、搜索（多关键词 AND）、汇总统计（计数 / 平均 / 分布）、review 组合等。
  - 把 DB 操作下沉为接收 `&Connection` 的纯函数，命令层只负责加锁与状态；纯函数即可单测。
  - 前端：把可测逻辑（时间范围换算、统计聚合等）尽量抽到纯函数并测试；UI 交互以
    类型检查（`npm run build`）为交付底线。
- 改动后用 **`cargo test` 与 `npm run build` 自检通过**再交付。
- 不要一次性堆积未讨论的功能；按"一小步"推进，遇到歧义先和产品讨论，不要自己补全大量需求。
- 前端设计遵循 frontend-design 技能，基调温暖且**避免"记账 / 金融"调性**：
  当前用**暖樱珊瑚**（藕粉底 + 珊瑚主点缀 + 玫瑰反馈），不引入外部资源。
  若用户觉得像别的项目的色调，优先换色相（如樱粉 / 莓果 / 抹茶），而不是套用奶油底 + 赤陶红这套 AI 默认。
- 优先使用最新稳定版技术栈（Tauri 2、最新 SQLite 等）。

## 常用命令
- 开发运行：`npm run tauri dev`
- 构建前端：`npm run build`
- Rust 测试：`cargo test`（在 `src-tauri` 目录）
