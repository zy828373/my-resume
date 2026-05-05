# CS2 饰品交易监控台

一个本地可运行的 CS2 饰品监控平台，重点针对：

- 建仓预计
- 跑路预警
- BUFF / 悠悠有品价格对比
- KDJ / MACD / 成交量 / 冷却期价格带

## 运行

```bash
npm install
npm run dev
```

开发环境：

- 前端: `http://localhost:5173`
- 后端: `http://localhost:8787`

生产预览：

```bash
npm run build
npm run start
```

## 数据接入

当前版本使用 `CSQAQ` 作为聚合数据源。

首次使用时：

1. 登录 `CSQAQ`
2. 在个人头像处复制 `ApiToken`
3. 打开页面右上角 `数据源设置`
4. 粘贴 `ApiToken`
5. 点击 `保存并绑定 IP`

系统会把 Token 保存到本地 `data/runtime-config.json`，并把历史快照写入 `data/snapshots.json`。

## 当前能力

- 单页监控台
- 监控池搜索与增删
- 市场指数概览
- 单饰品量价主图
- MACD / KDJ
- 建仓评分 / 跑路风险评分
- 7 天冷却期卖出带
- Top 持仓排行
- 本地历史快照累积，支持后续识别持仓松动/建仓增强

## 注意

- `CSQAQ` 官方文档写明其开放 API 以学习交流为主，不应直接视为商用最终合规数据方案。
- 如果某些饰品首次访问时持仓变化为空，通常是因为本地历史快照还不够，需要后续继续刷新积累。
