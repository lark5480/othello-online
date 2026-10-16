# 文档索引

本目录是 `othello-online` 的文档中心。**新增文档时请在下表登记。**

## 文档状态约定

每篇文档的状态见下方各表；其中**快照类**文档另在标题下方就地标注「文档状态：快照（日期）」。三种状态含义如下：

| 状态 | 含义 | 维护要求 |
|------|------|----------|
| **现状** | 描述当前代码的事实 | 改代码后必须同步，过时即缺陷 |
| **快照** | 某时点的记录（带核验日期） | 不追随后续改动；引用其行号 / 数字前须复核 |
| **规划** | 目标或初始设计 | 不代表当前实现 |

## 仓库根文档

| 文档 | 状态 | 内容 |
|------|------|------|
| [README.md](../README.md) | 现状 | 项目总览、功能、快速开始；**项目结构树的唯一出处** |
| [AGENTS.md](../AGENTS.md) | 现状 | 给 AI 编码代理的架构约束与验证清单 |
| [CHANGELOG.md](../CHANGELOG.md) | 现状 | 版本变更记录（Keep a Changelog） |

## 产品与部署

| 文档 | 状态 | 内容 |
|------|------|------|
| [prd.md](prd.md) | 规划 + 现状 | 产品需求（§10.1 结构为初始规划，现状见 README） |
| [deployment.md](deployment.md) | 现状 | EdgeOne Makers 部署指南 |
| [ai-mode.md](ai-mode.md) | 现状 | 人机对战接口与集成说明 |
| [competitive-analysis.md](competitive-analysis.md) | 快照（2026-09-03） | 竞品生态简报 + 调研方法附录 |

## 架构（`docs/architecture/`）

| 文档 | 状态 | 内容 |
|------|------|------|
| [architecture.md](architecture/architecture.md) | 快照（2026-10-12） | 反向梳理的现状架构 + 风险清单 |
| [performance-budget.md](architecture/performance-budget.md) | 快照 | 性能预算与实测值 |
| [asset-audit.md](architecture/asset-audit.md) | 快照 | 依赖与资产审计 |
| [adr/](architecture/adr/) | 现状 | 架构决策记录 ADR-0001 ~ ADR-0006 |

## 发布（`docs/release/`）

| 文档 | 状态 | 内容 |
|------|------|------|
| [go-live-checklist.md](release/go-live-checklist.md) | 现状 | 上线检查清单（含**判据**） |
| [versioning.md](release/versioning.md) | 现状 | 版本号规范 |
| [asset-cache-strategy.md](release/asset-cache-strategy.md) | 现状 | 前端产物缓存策略 |
| [localization-audit.md](release/localization-audit.md) | 现状 | 本地化覆盖审计 |

## 试玩材料

见仓库根 [`tests/playtest/`](../tests/playtest/)：试玩手册、5 分钟冒烟清单、观察记录表、缺陷报告模板、质量门结案报告。

---

> **维护约定**：「现状」类文档随代码改动同步；「快照」类文档不追改，但引用其数据前须复核（见 `AGENTS.md` 验证清单的「外部事实必须核验后入档」）。
