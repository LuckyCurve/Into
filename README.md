# Into · 兴趣雷达

个人本地优先的「兴趣记录」桌面 App。记录「最近让我心里动了一下的东西」：一句话 + 1~5 的温度，
长期积累后回看「最近的我」。

不是 Todo、不是笔记、不是打卡工具——只是安静地收集那些让你心里微微一动的小事。

---

## 核心原则

- **本地优先、隐私优先**：无云端、无账号、无遥测、无第三方分析，不使用任何外部字体或网络请求。
  数据全部落在本地 `AppData`，用系统自带的 SQLite（`rusqlite` bundled）存储，不依赖任何系统库。
- **极低输入成本**：想到 → 打分 → 保存，三步结束，不逼自己写长篇。
- **观察兴趣，而不是管理人生**：不做打卡 / 效率 / 完成度。
- **原始输入不可动摇**：你写下的话是核心数据；分类 / 标签 / 聚类都只是分析结果，绝不覆盖原始文字。
- **录入态永远是首页**：回顾 / 汇总是「另一个入口」（顶部「写一点 / 看看」切换），不喧宾夺主。

## 功能

- **写一点**：一句话 + 1~5「温度」即可保存；原始文字永不被改写。
- **看看**：按时间范围回看，支持多关键词搜索（空白拆分、AND 关系），并给出可解释统计
  （条数、平均温度、1~5 分布）。
- **分析面板**：后端用 jieba 分词提取高频关键词，帮你看清自己最近在关心什么。
- **设置内数据操作**：在应用内直接做数据备份 / 清理等维护。
- **开机自启与关闭到托盘**：可设置开机自启；关窗口时收进系统托盘，不打扰也不丢数据。
- **无原生标题栏**：自绘暖色边框与顶栏，支持整条顶栏拖拽移动、八个热区自由缩放。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | [Tauri 2](https://tauri.app/)（Rust 后端） |
| 前端 | React 19 + TypeScript + Vite 7 |
| 存储 | SQLite（`rusqlite` bundled，纯本地） |
| 窗口 | `@tauri-apps/api/window` 自定义无边框 / 拖拽 / 缩放 |

前端通过 `@tauri-apps/api/core` 的 `invoke` 调用 Rust command，**前端绝不直接写 SQL**。

## 数据模型

```
entries(
  id          INTEGER 主键,
  content     TEXT    原始文字,
  score       INTEGER 温度 1~5,
  created_at  INTEGER 毫秒,
  updated_at  INTEGER 毫秒（可选）
)
```

Rust 侧提供的命令：

| 命令 | 说明 |
| --- | --- |
| `add_entry` | 新增一条记录 |
| `update_entry` | 修改已有记录 |
| `delete_entry` | 删除记录 |
| `review(start_ms, end_ms, search)` | 回顾：返回 `{ entries, summary }` |

`review` 的语义：

- 时间范围为半开区间 `start_ms <= created_at < end_ms`；
- 列表按时间倒序，最多返回 500 条；
- 搜索按空白拆成多关键词、AND 关系（`content LIKE %token%`）；
- `summary` 给出条数、平均温度、1~5 分布等可解释统计。

## 开发

```bash
# 安装依赖
npm install

# 以开发模式启动（启动 Rust 后端 + Vite 前端）
npm run tauri dev

# 仅构建前端
npm run build

# 运行前端单元测试（vitest）
npm test

# 运行 Rust 单元测试（在 src-tauri 目录）
cargo test
```

> 第一次构建 Tauri 需要本机安装 Rust 工具链及对应平台的系统依赖
> （如 Linux 的 `libwebkit2gtk-4.1-dev` 等）。详见
> [Tauri 官方「起步」文档](https://tauri.app/start/prerequisites/)。

## 打包与发布

仓库使用 GitHub Actions 自动构建安装包：

- 推送形如 `v*` 的 tag 到 `main` 分支会触发 `release.yml`；
- 流水线先跑前后端测试（任一失败则中止发布），通过后在三个平台
  （Windows / macOS / Linux）构建安装包，并发布为 GitHub Release（draft）。

```bash
# 例如发布 0.2.0
git tag -a v0.2.0 -m "Into v0.2.0"
git push origin v0.2.0
```

当前应用版本号同时维护在 `package.json`、`src-tauri/Cargo.toml` 与
`src-tauri/tauri.conf.json` 中，发版时记得同步更新。

## 设计基调

遵循「避免记账 / 金融调性」的原则，当前采用**暖樱珊瑚**配色（藕粉底 + 珊瑚主点缀 + 玫瑰反馈），
全程不引入任何外部资源。若觉得色调偏移，优先换色相（樱粉 / 莓果 / 抹茶），而非套用奶油底 + 赤陶红这类 AI 默认搭配。
