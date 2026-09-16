/**
 * mock-db.js — 模拟数据层 v4（localStorage 持久化）
 * 权限：admin 管理员(项目配置+账户维护) / agent 代理人(班车+自己的客户) / customer 客户(登录预约)
 * mall 购买链接支持 type: 'h5'(H5链接) | 'mini'(小程序)
 * 接真实后端时，只需替换 api.js，本文件可整体删除。
 */
(function () {
  const DB_KEY = 'bybus_db_v5';
  const SESSION_KEY = 'bybus_session'; // 客户登录手机号
  const AGENT_KEY = 'bybus_agent';    // 代理人/管理员登录 id

  const seed = () => ({
    // ===== 班车（团期）===== 40座/班，每周1-2班；createdBy 归属代理人 =====
    trips: [
      { id: 'T260919A', date: '2026-09-19', time: '08:30', meetup: '国贸集合点 · 大巴车', seats: 40, status: 'open', createdBy: 'AG001' },
      { id: 'T260924A', date: '2026-09-24', time: '08:30', meetup: '国贸集合点 · 大巴车', seats: 40, status: 'open', createdBy: 'AG001' },
      { id: 'T260926A', date: '2026-09-26', time: '08:30', meetup: '望京集合点 · 大巴车', seats: 40, status: 'open', createdBy: 'AG001' },
    ],

    // ===== 医疗项目（仅管理员可配置）=====
    projects: [
      {
        id: 'P1', name: '疼痛治疗 · 黄金雷针', group: 'A', active: true,
        desc: '针对颈肩腰腿慢性疼痛的针刀治疗，免挂号，首次免费体验，现场排队。',
        needId: true, queue: true, firstFree: true,
        quota: 30, price: 0, note: '首次免费 · 免挂号 · 需身份证+手机号登记',
        mall: { name: '黄金雷针月卡 · 8次', price: '价格待定', type: 'mini', url: '' },
      },
      {
        id: 'P2', name: '全科问诊 · 体检报告解读', group: 'B', active: true,
        desc: '全科医生一对一面诊，免费解读体检报告，解答健康疑问。',
        quota: 30, price: 0, note: '免费 · 4个诊室同时开诊 · 医保结算走线下',
      },
      {
        id: 'P3', name: '心肺功能测试', group: 'B', active: true,
        desc: '心肺运动试验，评估心肺储备功能。医保结算走线下。',
        quota: 20, price: 0, note: '医保结算走线下',
      },
      {
        id: 'P4', name: '美容皮肤检测', group: 'C', active: true,
        desc: '专业皮肤检测仪深度分析肤质，免费体验。',
        quota: 10, price: 0, note: '免费 · 名额有限',
        mall: { name: '美容年卡 · 4次', price: '¥4500', type: 'mini', url: '' },
      },
      {
        id: 'P5', name: '中医坐诊', group: 'C', active: true,
        desc: '中医师面诊，辨证施治。挂号费现场线下支付。',
        quota: 15, price: 200, note: '挂号费 ¥200 · 走线下支付',
      },
      {
        id: 'P6', name: '到院参观', group: 'D', active: true,
        desc: '参观北大国际医院重点科室与健康管理中心，了解就医绿通服务。',
        quota: 10, price: 0, note: '免费 · 名额有限',
      },
    ],

    // ===== 预约记录 =====
    // { id, tripId, projectId, phone, name, idCard, createdAt }
    reservations: [],

    // ===== 登录验证码 ===== { phone, code, expireAt }
    codes: [],

    // ===== 客户账户 =====
    // { phone, name, idCard, role: 'customer'|'agent', createdAt }
    users: [],

    // ===== 代理人 / 管理员账户 ===== 手机号+验证码登录
    // { id, name, phone, role: 'agent'|'admin' }
    agents: [
      { id: 'AG001', name: '王代理', phone: '13900000001', role: 'agent' },
      { id: 'AG002', name: '系统管理员', phone: '13900000002', role: 'admin' },
    ],
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

  window.MockDB = { load, save, seed, DB_KEY, SESSION_KEY, AGENT_KEY };
})();
