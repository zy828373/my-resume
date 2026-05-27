# CS2 项目新需求提问指南

> 本文档面向项目 owner(你)。它**不是** AI 的硬规则 —— AI 的硬规则在 `AGENTS.md` / `engineering-workflow` memory / V5.0 章节 1.3。这里是给你提问时复制开口模板用的参考手册。

---

## 1. 先判断哪一类

### 1.1 四类速查表

| 类型 | 判断条件 | 例子 |
|---|---|---|
| **A 小修复** | 改 < 50 行 **且** 不碰下面 1.3 七项 | "修 X 显示 bug" |
| **B 中改动** | 50-200 行 **且** 单领域 | "加一个 hook 调新接口" |
| **C 1.3 单确认** | 触发任一 1.3 项 → 必走完整流程 | "推荐页大拆"、"加 API 字段"、"推荐池阈值改"、"改 data/ 结构" |
| **D 纯文档** | 只动 `docs/` 下文件 | "更新 architecture.md" |

### 1.2 V5.0 章节 1.3 七项(任一触发 → C 类强制)

1. `server/index.ts` 大规模 route / service 拆分
2. scanner / refresh runtime 服务化
3. `server/analytics.ts` 模块化
4. 推荐池硬规则(阈值 / 降级清单 / 硬排除)
5. 前端 `App.tsx` / `RecommendationsPage` 大规模拆分
6. `shared/types.ts` API 合同
7. `data/` 运行态文件结构(`runtime-config.json` / `snapshots.json`)

### 1.3 其他升 C 信号

- 改动 > 200 行
- 触并发 / 缓存 / 状态机
- 改 envelope 协议
- 跨多个领域

---

## 2. 三种开口模板

**A / D 类:**
```
修 X(现象一句话)。只改 Y。
```

**B 类:**
```
加 X,目标是 Y,可能改 Z。先给我 plan,我 ack 再写。
```

**C 类:**
```
我要做 X,可能触发 1.3 [哪一项]。按 AGENTS.md Task-Type Reading Order
读对应文档,填 docs/templates/01-scenario-alignment.md → grill-me → 我 ack
→ 填 02-technical-contract.md → 我 ack → 才编码。
```

---

## 3. 流程节奏

### 3.1 A / D 类(轻量)

1. 读 4 份必读文档(`AGENTS.md` / `docs/progress.md` / `docs/architecture.md` / `docs/test-cases.md`)
2. 出 plan(影响文件 + 风险 + 验收)
3. 我 ack → 编码
4. 三件套验证:`npm exec tsc -- --noEmit` / `npm test` / `npm run build`
5. 若改了已知模式 → 更新 `docs/progress.md`
6. 我说 `commit` / `push` 才动

### 3.2 B 类(中量)

1. 读 4 份必读 + 任务对应的 `docs/` 文档(前端 → `frontend-patterns.md`;后端 → `api-contract.md` + `backend-patterns.md`;推荐 → `specs/autonomous-pool.md`)
2. 出 plan(章节列表 + `file:line` 引用)
3. 我 ack
4. 编码 → 三件套验证
5. 若改了模式 → 更新 `progress.md`
6. 我说 `review`(可加 "多 agent 并行")
7. 我说 `commit` → 挂 `feat(US-XXX): ...` 或 `fix(no-story): ...`
8. 我说 `push`

### 3.3 C 类(完整流程)

1. 读 4 份必读 + 任务对应的 `docs/` 文档
2. 填 `docs/templates/01-scenario-alignment.md`(场景 / 目标 / 范围 / 不做范围 / 验收 / 未决问题)
3. **grill-me**:AI 反问澄清未决问题(只问关键的)
4. 我 ack scenario
5. 填 `docs/templates/02-technical-contract.md`(数据 / 接口 / 状态 / 集成 / 测试 / 风险)
6. 我 ack contract
7. AI 出实现 plan(章节 + `file:line`)
8. 我 ack plan
9. 小步编码,每步可回滚
10. 三件套验证 + 更新 `progress.md`
11. 我说 `review` → 自查 / 多 agent
12. 我说 `commit` → 挂 `feat(US-XXX): ...`,大子任务可拆多 commit
13. 我说 `push`

---

## 4. 快速短语

| 场景 | 短语 |
|---|---|
| 不确定类型 | `这是 A/B/C/D 哪类?` |
| 让 AI 反问 | `grill-me,只问关键的` |
| 只读调查 | `只读,告诉我现状` |
| 多 agent 评审 | `调用多个子 agent 协同看` |
| 提交 | `commit` |
| 拆 commit | `拆 N 个 commit,每个挂 US-XXX` |
| push | `push` |
| 不提交 | `先别 commit` |
| 改主意(撤回) | `revert 最后一个 commit` |
| 改主意(重做) | `改 X,重新出 plan` |
| 任务太长 | `用 handoff token 交接,新会话继续` |

---

## 5. 红线(永远不做)

- 迁移技术栈(React 19 / Vite 7 / Express 5 / TS)
- 改 `{ ok, data, error }` envelope 协议
- 绕过 `config-store` / `history-store` 直写 `data/`
- 引入 DB / Redis / Queue / 全局状态库
- 写真实 token / snapshot 进仓库
- `force-push` 到 `main`
- 没 ack 就 commit / push
- **C 类不走模板直接编码 = 违规**

---

## 6. 另起会话信号

**触发条件(任一):**

- 对话 > 30-40 轮
- 系统提示 context 接近上限
- AI 重复 / 忘记早期决策
- 跨完全不同领域

**交接模板:** `docs/handoff.md:13-41` In-Session Handoff Token

---

## 7. 一图流

```
新需求 → 判类型
         ├─ A / D? → plan → ack → 编码 → 三件套 → commit → push
         ├─ B?     → plan → ack → 编码 → 三件套 → review → commit → push
         └─ C?     → scenario → grill → contract → plan → 编码 → 三件套 → review → commit → push
```
