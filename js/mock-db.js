/**
 * mock-db.js — 模拟数据层（localStorage 持久化）
 * 后续接真实后端时，只需替换 api.js，本文件可整体删除。
 */
(function () {
  const DB_KEY = 'bybus_db_v1';

  const seed = () => ({
    // ===== 班车（团期）===== 先约车：40座/班，每周1-2班
    trips: [
      { id: 'T260917A', date: '2026-09-17', time: '08:30', meetup: '国贸集合点 · 大巴车', seats: 40, status: 'open' },
      { id: 'T260919A', date: '2026-09-19', time: '08:30', meetup: '国贸集合点 · 大巴车', seats: 40, status: 'open' },
      { id: 'T260924A', date: '2026-09-24', time: '08:30', meetup: '国贸集合点 · 大巴车', seats: 40, status: 'open' },
    ],

    // ===== 医疗项目（分组，上车后预约）=====
    projects: [
      {
        id: 'P1', name: '疼痛治疗 · 黄金雷针', group: 'A',
        desc: '针对颈肩腰腿慢性疼痛的针刀治疗，免挂号，首次免费体验，现场排队。',
        needId: true, needPhone: true, firstFree: true, queue: true,
        quota: 30, price: 0, note: '首次免费 · 免挂号 · 凭身份证+手机号登记 · 现场排队',
        mall: { name: '黄金雷针月卡 · 8次', price: '价格待定', appid: 'wxxxx-p1', path: '/pages/p1/p1' },
      },
      {
        id: 'P2', name: '全科问诊 · 体检报告解读', group: 'B',
        desc: '全科医生一对一面诊，免费解读体检报告。医保结算走线下。',
        quota: 30, price: 0, note: '免费 · 4个诊室同时开诊 · 医保结算走线下',
      },
      {
        id: 'P3', name: '心肺功能测试', group: 'B',
        desc: '心肺运动试验，评估心肺储备功能。医保结算走线下。',
        quota: 20, price: 0, note: '医保结算走线下',
      },
      {
        id: 'P4', name: '美容皮肤检测', group: 'C',
        desc: '专业皮肤检测仪深度分析肤质，免费体验。',
        quota: 10, price: 0, note: '免费 · 每班限10个名额',
        mall: { name: '美容年卡 · 4次', price: '¥4500', appid: 'wxxxx-p4', path: '/pages/p4/p4' },
      },
      {
        id: 'P5', name: '中医坐诊', group: 'C',
        desc: '中医师面诊，辨证施治。挂号费现场线下支付。',
        quota: 15, price: 200, note: '挂号费 ¥200 · 走线下支付',
      },
      {
        id: 'P6', name: '到院参观', group: 'D',
        desc: '参观北大国际医院重点科室与健康管理中心，了解就医绿通服务。',
        quota: 10, price: 0, note: '免费 · 每班限10个名额',
      },
    ],

    // ===== 预约记录 =====
    // { id, tripId, projectId, phone, name, idCard, createdAt }
    reservations: [],

    // ===== 代理人 =====
    agents: [{ id: 'AG001', name: '王代理', code: '8888' }],
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const db = seed();
    save(db);
    return db;
  };
  const save = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));

  window.MockDB = { load, save, seed, DB_KEY };
})();
