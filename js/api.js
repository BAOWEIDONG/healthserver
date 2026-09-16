/**
 * api.js — 服务接口层（模拟实现）
 * 所有方法返回 Promise，模拟 200~400ms 网络延迟。
 * ★ 接真实后端时：删除 mock-db.js 引用，将每个方法改为 fetch('/api/...') 即可，页面代码不用动。
 */
(function () {
  const delay = (ms = 250) => new Promise(r => setTimeout(r, ms));
  const db = () => MockDB.load();
  const persist = (d) => MockDB.save(d);

  // 身份证校验（18位，末位X）
  const validIdCard = (s) => /^\d{17}[\dXx]$/.test(s);
  const validPhone = (s) => /^1\d{10}$/.test(s);

  const Api = {
    /** 班车列表（含每班已约/剩余） */
    async listTrips() {
      await delay();
      const d = db();
      return d.trips.map(t => {
        const taken = d.reservations.filter(r => r.tripId === t.id);
        const uniquePax = new Set(taken.map(r => r.phone));
        return { ...t, takenSeats: uniquePax.size, leftSeats: Math.max(0, t.seats - uniquePax.size) };
      });
    },

    /** 项目列表 + 指定班期的名额占用 */
    async listProjects(tripId) {
      await delay();
      const d = db();
      return d.projects.map(p => {
        const taken = d.reservations.filter(r => r.tripId === tripId && r.projectId === p.id);
        return { ...p, taken: taken.length, left: Math.max(0, p.quota - taken.length) };
      });
    },

    /**
     * 预约（先约车 = 传入 tripId；同一手机号同一班期只算1个座位）
     * payload: { tripId, projectIds[], name, phone, idCard? }
     */
    async reserve(payload) {
      await delay(400);
      const d = db();
      const trip = d.trips.find(t => t.id === payload.tripId && t.status === 'open');
      if (!trip) return { ok: false, msg: '班期已关闭或不存在' };

      const { name, phone, projectIds = [] } = payload;
      if (!name?.trim()) return { ok: false, msg: '请填写姓名' };
      if (!validPhone(phone)) return { ok: false, msg: '手机号格式不正确' };

      // 车座检查（按手机号去重）
      const alreadyOnBus = d.reservations.some(r => r.tripId === payload.tripId && r.phone === phone);
      if (!alreadyOnBus) {
        const uniquePax = new Set(d.reservations.filter(r => r.tripId === trip.id).map(r => r.phone));
        if (uniquePax.size >= trip.seats) return { ok: false, msg: '该班车座位已满，请选择其他班期' };
      }

      // 项目校验
      if (projectIds.length === 0) return { ok: false, msg: '请至少选择1个项目' };
      for (const pid of projectIds) {
        const p = d.projects.find(x => x.id === pid);
        if (!p) return { ok: false, msg: '项目不存在' };
        const mine = d.reservations.some(r => r.tripId === trip.id && r.projectId === pid && r.phone === phone);
        if (mine) continue; // 幂等：已约过的不重复占名额
        const taken = d.reservations.filter(r => r.tripId === trip.id && r.projectId === pid).length;
        if (taken >= p.quota) return { ok: false, msg: `「${p.name}」名额已满` };
        if (p.needId && !validIdCard(payload.idCard)) {
          return { ok: false, msg: `「${p.name}」需登记有效身份证号` };
        }
      }

      // 写入
      const now = Date.now();
      for (const pid of projectIds) {
        const dup = d.reservations.some(r => r.tripId === trip.id && r.projectId === pid && r.phone === phone);
        if (dup) continue;
        d.reservations.push({ id: 'R' + now + pid, tripId: trip.id, projectId: pid, name: name.trim(), phone, idCard: payload.idCard || '', createdAt: now });
      }
      persist(d);
      return { ok: true, tripId: trip.id };
    },

    /** 我的预约（按手机号查询） */
    async myReservations(phone) {
      await delay();
      const d = db();
      if (!phone) return [];
      return d.reservations.filter(r => r.phone === phone).map(r => {
        const t = d.trips.find(x => x.id === r.tripId);
        const p = d.projects.find(x => x.id === r.projectId);
        return {
          id: r.id, tripId: r.tripId,
          tripLabel: t ? `${t.date} ${t.time} ${t.meetup}` : '班期已删除',
          projectName: p ? p.name : r.projectId,
          projectNote: p?.note || '', mall: p?.mall || null,
          createdAt: r.createdAt,
        };
      });
    },

    // ================= 代理人端 =================
    async agentLogin(code) {
      await delay();
      const d = db();
      const a = d.agents.find(x => x.code === code);
      return a ? { ok: true, agent: a } : { ok: false, msg: '邀请码不正确' };
    },

    /** 代理人建班：每周1-2次 */
    async createTrip({ date, time, meetup, seats = 40 }) {
      await delay(350);
      const d = db();
      const sameDay = d.trips.some(t => t.date === date);
      if (sameDay) return { ok: false, msg: '同一天已有班期，每周最多1~2次（周四/周六各一班）' };
      const weekCount = countWeek(d, date);
      if (weekCount >= 2) return { ok: false, msg: '本周已排满2班，每周最多2次' };
      const id = 'T' + date.replace(/-/g, '').slice(2) + (Math.random().toString(36)[2] || 'A').toUpperCase();
      d.trips.push({ id, date, time: time || '08:30', meetup: meetup || '国贸集合点 · 大巴车', seats, status: 'open' });
      persist(d);
      return { ok: true, id };
    },

    /** 班期名单 + 项目预约统计 */
    async tripDetail(tripId) {
      await delay();
      const d = db();
      const t = d.trips.find(x => x.id === tripId);
      if (!t) return null;
      const rs = d.reservations.filter(r => r.tripId === tripId);
      const pax = [];
      rs.forEach(r => {
        let person = pax.find(x => x.phone === r.phone);
        if (!person) { person = { name: r.name, phone: r.phone, idCard: r.idCard, projectNames: [] }; pax.push(person); }
        const p = d.projects.find(x => x.id === r.projectId);
        if (p) person.projectNames.push(p.name);
      });
      const stats = d.projects.map(p => ({
        id: p.id, name: p.name, quota: p.quota,
        taken: rs.filter(r => r.projectId === p.id).length,
      }));
      return { trip: t, pax, stats };
    },

    async closeTrip(tripId) {
      await delay(200);
      const d = db();
      const t = d.trips.find(x => x.id === tripId);
      if (t) { t.status = t.status === 'open' ? 'closed' : 'open'; persist(d); }
      return { ok: true };
    },
  };

  function countWeek(d, dateStr) {
    const dt = new Date(dateStr);
    const day = (dt.getDay() + 6) % 7; // 周一=0
    const monday = new Date(dt); monday.setDate(dt.getDate() - day);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const fmt = x => x.toISOString().slice(0, 10);
    return d.trips.filter(t => t.date >= fmt(monday) && t.date <= fmt(sunday)).length;
  }

  window.Api = Api;
})();
