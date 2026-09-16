/**
 * api.js — 服务接口层 v2（模拟实现）
 * 所有方法返回 Promise，模拟 200~400ms 网络延迟。
 * ★ 接真实后端：将每个方法改为 fetch('/api/...')，页面代码不用动。
 */
(function () {
  const delay = (ms = 250) => new Promise(r => setTimeout(r, ms));
  const db = () => MockDB.load();
  const persist = (d) => MockDB.save(d);
  const S = () => localStorage.getItem(MockDB.SESSION_KEY);

  const validPhone = (s) => /^1\d{10}$/.test(s);
  const validIdCard = (s) => /^\d{17}[\dXx]$/.test(s);

  const Api = {
    // ================= 客户登录 =================
    /** 发验证码（模拟：直接返回验证码供演示） */
    async sendCode(phone) {
      await delay(400);
      if (!validPhone(phone)) return { ok: false, msg: '手机号格式不正确' };
      const d = db();
      const code = String(Math.floor(1000 + Math.random() * 9000));
      d.codes = (d.codes || []).filter(c => c.expireAt > Date.now());
      d.codes.push({ phone, code, expireAt: Date.now() + 5 * 60 * 1000 });
      persist(d);
      return { ok: true, demoCode: code }; // 真实后端：短信下发，不返回明文
    },

    /** 登录/注册 */
    async login(phone, code) {
      await delay(400);
      const d = db();
      const rec = (d.codes || []).find(c => c.phone === phone && c.expireAt > Date.now());
      if (!rec) return { ok: false, msg: '验证码已过期，请重新获取' };
      if (rec.code !== code) return { ok: false, msg: '验证码不正确' };
      d.codes = d.codes.filter(c => c !== rec);
      persist(d);
      localStorage.setItem(MockDB.SESSION_KEY, phone);
      return { ok: true };
    },

    logout() { localStorage.removeItem(MockDB.SESSION_KEY); },

    /** 当前登录用户档案（从历史预约合成姓名/身份证） */
    async me() {
      await delay(120);
      const phone = S();
      if (!phone) return null;
      const d = db();
      const last = [...d.reservations].reverse().find(r => r.phone === phone);
      return { phone, name: last?.name || '', idCard: last?.idCard || '' };
    },

    // ================= 客户预约 =================
    async listTrips() {
      await delay();
      const d = db();
      return d.trips.map(t => {
        const pax = new Set(d.reservations.filter(r => r.tripId === t.id).map(r => r.phone));
        return { ...t, takenSeats: pax.size, leftSeats: Math.max(0, t.seats - pax.size) };
      });
    },

    /** 开放中项目 + 指定班期名额占用 */
    async listProjects(tripId) {
      await delay();
      const d = db();
      return d.projects.filter(p => p.active).map(p => {
        const taken = d.reservations.filter(r => r.tripId === tripId && r.projectId === p.id);
        return { ...p, taken: taken.length, left: Math.max(0, p.quota - taken.length) };
      });
    },

    /**
     * 预约（须已登录）。同一手机号同一班期只占1座。
     * payload: { tripId, projectIds[], name, idCard? }
     */
    async reserve(payload) {
      await delay(500);
      const phone = S();
      if (!phone) return { ok: false, msg: '请先登录' };
      const d = db();
      const trip = d.trips.find(t => t.id === payload.tripId && t.status === 'open');
      if (!trip) return { ok: false, msg: '班期已关闭或不存在' };

      const { name, projectIds = [] } = payload;
      if (!name?.trim()) return { ok: false, msg: '请填写姓名' };
      if (!projectIds.length) return { ok: false, msg: '请至少选择 1 个项目' };

      const onBus = d.reservations.some(r => r.tripId === trip.id && r.phone === phone);
      if (!onBus) {
        const pax = new Set(d.reservations.filter(r => r.tripId === trip.id).map(r => r.phone));
        if (pax.size >= trip.seats) return { ok: false, msg: '该班车座位已满，请选择其他班期' };
      }

      for (const pid of projectIds) {
        const p = d.projects.find(x => x.id === pid && x.active);
        if (!p) return { ok: false, msg: '项目不存在或已下架' };
        const mine = d.reservations.some(r => r.tripId === trip.id && r.projectId === pid && r.phone === phone);
        if (mine) continue;
        const taken = d.reservations.filter(r => r.tripId === trip.id && r.projectId === pid).length;
        if (taken >= p.quota) return { ok: false, msg: `「${p.name}」名额已满` };
        if (p.needId && !validIdCard(payload.idCard)) return { ok: false, msg: `「${p.name}」需登记有效身份证号` };
      }

      const now = Date.now();
      for (const pid of projectIds) {
        if (d.reservations.some(r => r.tripId === trip.id && r.projectId === pid && r.phone === phone)) continue;
        d.reservations.push({ id: 'R' + now + pid, tripId: trip.id, projectId: pid, name: name.trim(), phone, idCard: payload.idCard || '', createdAt: now });
      }
      persist(d);
      return { ok: true, tripId: trip.id };
    },

    /** 我的预约（登录态） */
    async myReservations() {
      await delay();
      const phone = S();
      if (!phone) return [];
      const d = db();
      const rs = d.reservations.filter(r => r.phone === phone);
      const byTrip = {};
      rs.forEach(r => { (byTrip[r.tripId] = byTrip[r.tripId] || []).push(r); });
      return Object.entries(byTrip).map(([tripId, rows]) => {
        const t = d.trips.find(x => x.id === tripId);
        return {
          tripId,
          trip: t ? { ...t, label: `${t.date} ${t.time} · ${t.meetup}` } : null,
          status: t ? t.status : 'deleted',
          items: rows.map(r => {
            const p = d.projects.find(x => x.id === r.projectId);
            return {
              id: r.id, projectId: r.projectId,
              name: p?.name || '项目已删除',
              note: p?.note || '', price: p?.price || 0,
              mall: p?.mall || null, needId: !!p?.needId,
              createdAt: r.createdAt, idCard: r.idCard, person: r.name,
            };
          }),
          createdAt: Math.max(...rows.map(r => r.createdAt)),
        };
      }).sort((a, b) => b.createdAt - a.createdAt);
    },

    /** 取消某班期某项目的预约 */
    async cancelReservation(tripId, projectId) {
      await delay(300);
      const phone = S();
      const d = db();
      const before = d.reservations.length;
      d.reservations = d.reservations.filter(r => !(r.phone === phone && r.tripId === tripId && r.projectId === projectId));
      persist(d);
      return { ok: d.reservations.length < before };
    },

    // ================= 代理人端 =================
    async agentLogin(code) {
      await delay();
      const a = db().agents.find(x => x.code === code);
      return a ? { ok: true, agent: a } : { ok: false, msg: '邀请码不正确' };
    },

    async createTrip({ date, time, meetup, seats = 40 }) {
      await delay(350);
      const d = db();
      if (d.trips.some(t => t.date === date)) return { ok: false, msg: '同一天已有班期' };
      const dt = new Date(date);
      const day = (dt.getDay() + 6) % 7;
      const mon = new Date(dt); mon.setDate(dt.getDate() - day);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const fmt = x => x.toISOString().slice(0, 10);
      const weekCount = d.trips.filter(t => t.date >= fmt(mon) && t.date <= fmt(sun)).length;
      if (weekCount >= 2) return { ok: false, msg: '本周已排满 2 班（每周最多 1~2 次）' };
      const id = 'T' + date.replace(/-/g, '').slice(2) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
      d.trips.push({ id, date, time: time || '08:30', meetup: meetup || '国贸集合点 · 大巴车', seats, status: 'open' });
      persist(d);
      return { ok: true, id };
    },

    async closeTrip(tripId) {
      await delay(200);
      const d = db();
      const t = d.trips.find(x => x.id === tripId);
      if (t) { t.status = t.status === 'open' ? 'closed' : 'open'; persist(d); }
      return { ok: true };
    },

    /** 代理人：项目全量管理视图（含各班期占用） */
    async adminProjects() {
      await delay();
      const d = db();
      return d.projects.map(p => {
        const taken = d.reservations.filter(r => r.projectId === p.id).length;
        const takers = [...new Set(d.reservations.filter(r => r.projectId === p.id).map(r => r.phone))].length;
        return { ...p, takenTotal: taken, takers };
      });
    },

    /** 新增/编辑项目 */
    async saveProject(p) {
      await delay(350);
      const d = db();
      if (!p.name?.trim()) return { ok: false, msg: '请填写项目名称' };
      const quota = Number(p.quota);
      if (!(quota >= 1)) return { ok: false, msg: '名额须为正整数' };
      if (p.id) {
        const old = d.projects.find(x => x.id === p.id);
        if (!old) return { ok: false, msg: '项目不存在' };
        const used = d.reservations.filter(r => r.projectId === p.id).length;
        if (quota < used) return { ok: false, msg: `已有 ${used} 人预约，名额不能小于已约人数` };
        Object.assign(old, { name: p.name.trim(), group: p.group || 'A', desc: p.desc || '', quota, price: Number(p.price) || 0, note: p.note || '', needId: !!p.needId, queue: !!p.queue, mall: p.mall || null });
      } else {
        d.projects.push({
          id: 'P' + (Date.now() % 100000), name: p.name.trim(), group: p.group || 'A',
          desc: p.desc || '', quota, price: Number(p.price) || 0, note: p.note || '',
          needId: !!p.needId, queue: !!p.queue, mall: p.mall || null, active: true,
        });
      }
      persist(d);
      return { ok: true };
    },

    /** 项目 上架/下架 */
    async toggleProject(projectId) {
      await delay(200);
      const d = db();
      const p = d.projects.find(x => x.id === projectId);
      if (p) { p.active = !p.active; persist(d); }
      return { ok: true, active: p?.active };
    },

    /** 班期详情：名单 + 每人项目 + 项目统计 */
    async tripDetail(tripId) {
      await delay();
      const d = db();
      const t = d.trips.find(x => x.id === tripId);
      if (!t) return null;
      const rs = d.reservations.filter(r => r.tripId === tripId);
      const pax = [];
      rs.forEach(r => {
        let person = pax.find(x => x.phone === r.phone);
        if (!person) { person = { name: r.name, phone: r.phone, idCard: r.idCard, items: [] }; pax.push(person); }
        const p = d.projects.find(x => x.id === r.projectId);
        if (p) person.items.push({ id: p.id, name: p.name, note: p.note });
      });
      const stats = d.projects.map(p => ({
        id: p.id, name: p.name, quota: p.quota, active: p.active,
        taken: rs.filter(r => r.projectId === p.id).length,
        who: rs.filter(r => r.projectId === p.id).map(r => r.name),
      }));
      return { trip: t, pax, stats };
    },
  };

  window.Api = Api;
})();
