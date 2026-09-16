# healthserver — 北大国际医院 · 大巴到院预约 H5

寿险代理人带客到院场景：代理人发团（大巴 40 座/班，每周 1~2 班），客户扫码进入 H5，先约车、再选医疗项目（分组、名额控制）。

## 页面

| 入口 | 文件 | 说明 |
|---|---|---|
| 客户端 | `index.html` | 扫码直接进入：选班车 → 选项目 → 填信息；底部「我的预约」按手机号查询 |
| 代理人端 | `agent.html` | 邀请码登录（演示码 `8888`）：新建班期（每周≤2班）、乘客名单、项目预约统计、关闭/开启报名 |

## 医疗项目（6 项，分组）

- A 疼痛治疗·黄金雷针 — 首次免费、免挂号、需身份证+手机号、30 名额/班、现场排队；可购月卡 8 次（跳北医商城小程序）
- B 全科问诊·体检报告解读 — 免费、4 个诊室、30 名额/班、医保结算走线下
- B 心肺功能测试 — 医保结算走线下（演示默认 20 名额/班）
- C 美容皮肤检测 — 免费、10 名额/班；可购美容年卡 4 次 ¥4500（跳商城）
- C 中医坐诊 — 挂号费 ¥200 线下支付
- D 到院参观 — 免费、10 名额/班

## 结构

```
index.html   客户端
agent.html   代理人端
css/style.css
js/mock-db.js  模拟数据（localStorage 持久化）
js/api.js      接口层（全部 async，模拟 200~400ms 延迟）
js/client.js   客户端逻辑
js/agent.js    代理人端逻辑
```

**接真实后端**：保持 api.js 的方法签名不变（listTrips / listProjects / reserve / myReservations / agentLogin / createTrip / tripDetail / closeTrip），内部改成 `fetch('/api/...')`，删除 mock-db.js 引用即可，页面代码零改动。

## 部署（GitHub Pages）

```bash
cd healthserver
git init
git add -A
git commit -m "大巴到院预约H5"
git branch -M main
git remote add origin https://github.com/baoweidong/healthserver.git
git push -u origin main
```

然后 GitHub 仓库 → Settings → Pages → Source 选 `main` / root。
上线地址：`https://baoweidong.github.io/healthserver/`

客户预约入口：`https://baoweidong.github.io/healthserver/`（index.html）
代理人入口：`https://baoweidong.github.io/healthserver/agent.html`

## 演示数据

首次打开自动初始化 3 个班期种子数据。要重置：控制台执行
`localStorage.removeItem('bybus_db_v1')` 后刷新。

## 待确认口径

- 黄金雷针月卡 8 次价格（原需求只写了"¥1"，现为"价格待定"，改 `js/mock-db.js` 里 `P1.mall.price`）
- 心肺功能测试单班名额（原需求描述不完整，暂定 20，改 `P3.quota`）
- 中医坐诊名额暂定 15/班（改 `P5.quota`）
