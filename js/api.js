/**
 * api.js — 服务接口层 v3（模拟实现）
 * 三角色：admin 管理员(账户维护+全部权限) / agent 代理人(班车+项目) / customer 客户(登录预约)
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

  /** 当前登录的代理人/管理员 */
  function currentAgent() {
    const id = localStorage.getItem(MockDB.AGENT_KEY);
    return db().agents.find(a => a.id === id) || null;
  }
  /** 管理员守卫 */
  const requireAdmin = () => {
    const a = currentAgent();
    return a && a.role === 'admin' ? a : null;
  };

  const Api = {
    // ================= 客户登录 =================
    async sendCode(phone) {
      await delay(400);
      if (!validPhone(phone)) return { ok: false, msg: '手机号格式不正确' };
      const d = db();
      d.codes = (d.codes || []).filter(c => c.expireAt > Date.now());
      d.codes.push({ phone, code: String(Math.floor(100000 + Math.random() * 900000)), expireAt: Date.now() + 5 * 60 * 1000 });
      persist(d);
      return { ok: true };
    },

    async login(phone, code) {
      await delay(400);
      if (!validPhone(phone)) return { ok: false, msg: '手机号格式不正确' };
      // 演示环境：任意6位数字验证码即可登录（真实后端替换为短信校验）
      if (!/^\d{6}$/.test(code || '')) return { ok: false, msg: '请输入6位验证码' };
      const d = db();
      const asAgent = d.agents.find(a => a.phone === phone);
      if (asAgent) return { ok: false, msg: '该手机号为代理人账号，请从代理人端登录' };
      if (!d.users.find(u => u.phone === phone)) d.users.push({ phone, name: '', idCard: '', role: 'customer', createdAt: Date.now() });
      persist(d);
      localStorage.setItem(MockDB.SESSION_KEY, phone);
      return { ok: true };
    },

    logout() { localStorage.removeItem(MockDB.SESSION_KEY); },

    async me() {
      await delay(120);
      const phone = S();
      if (!phone) return null;
      const d = db();
      const u = d.users.find(x => x.phone === phone);
      const last = [...d.reservations].reverse().find(r => r.phone === phone);
      return { phone, name: u?.name || last?.name || '', idCard: u?.idCard || last?.idCard || '' };
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

    async listProjects(tripId) {
      await delay();
      const d = db();
      return d.projects.filter(p => p.active).map(p => {
        const taken = d.reservations.filter(r => r.tripId === tripId && r.projectId === p.id);
        return { ...p, taken: taken.length, left: Math.max(0, p.quota - taken.length) };
      });
    },

    /** 预约（须客户登录）。同一手机号同一班期只占1座。 */
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
      // 同步用户档案
      const u = d.users.find(x => x.phone === phone);
      if (u) { u.name = name.trim(); if (payload.idCard) u.idCard = payload.idCard; }
      persist(d);
      return { ok: true, tripId: trip.id };
    },

    /** 我的预约（按班期分组） */
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

    async cancelReservation(tripId, projectId) {
      await delay(300);
      const phone = S();
      const d = db();
      const before = d.reservations.length;
      d.reservations = d.reservations.filter(r => !(r.phone === phone && r.tripId === tripId && r.projectId === projectId));
      persist(d);
      return { ok: d.reservations.length < before };
    },

    // ================= 代理人/管理员端 =================
    async agentLogin(code) {
      await delay();
      const a = db().agents.find(x => x.code === code);
      return a ? { ok: true, agent: a } : { ok: false, msg: '邀请码不正确' };
    },

    /** 当前登录的代理人/管理员信息（自动登录用） */
    async whoAmI() {
      await delay(120);
      const a = currentAgent();
      return a ? { ok: true, agent: a } : { ok: false };
    },

    async createTrip({ date, time, meetup, seats = 40 }) {
      await delay(350);
      if (!currentAgent()) return { ok: false, msg: '请先登录' };
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
      if (!currentAgent()) return { ok: false, msg: '请先登录' };
      const d = db();
      const t = d.trips.find(x => x.id === tripId);
      if (t) { t.status = t.status === 'open' ? 'closed' : 'open'; persist(d); }
      return { ok: true };
    },

    async adminProjects() {
      await delay();
      if (!currentAgent()) return [];
      const d = db();
      return d.projects.map(p => {
        const taken = d.reservations.filter(r => r.projectId === p.id).length;
        const takers = new Set(d.reservations.filter(r => r.projectId === p.id).map(r => r.phone));
        return { ...p, takenTotal: taken, takers: takers.size };
      });
    },

    async saveProject(p) {
      await delay(350);
      if (!currentAgent()) return { ok: false, msg: '请先登录' };
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

    async toggleProject(projectId) {
      await delay(200);
      if (!currentAgent()) return { ok: false, msg: '请先登录' };
      const d = db();
      const p = d.projects.find(x => x.id === projectId);
      if (p) { p.active = !p.active; persist(d); }
      return { ok: true, active: p?.active };
    },

    async tripDetail(tripId) {
      await delay();
      if (!currentAgent()) return null;
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

    // ================= 账户管理（仅管理员） =================
    /** 账户全景：代理人/管理员 + 客户 */
    async listAccounts() {
      await delay();
      const me = requireAdmin();
      if (!me) return { ok: false, msg: '仅管理员可查看账户' };
      const d = db();
      const customers = d.users.map(u => {
        const rs = d.reservations.filter(r => r.phone === u.phone);
        return {
          ...u,
          resvCount: rs.length,
          lastActive: rs.length ? Math.max(...rs.map(r => r.createdAt)) : u.createdAt,
          asAgent: d.agents.find(a => a.phone === u.phone)?.id || null,
        };
      }).sort((a, b) => b.lastActive - a.lastActive);
      return { ok: true, agents: d.agents.map(a => ({ ...a })), customers, meId: me.id };
    },

    /** 新增/编辑 代理人或管理员账户 */
    async saveAgentAccount({ id, name, code, role, phone }) {
      await delay(350);
      if (!requireAdmin()) return { ok: false, msg: '仅管理员可维护账户' };
      const d = db();
      if (!name?.trim()) return { ok: false, msg: '请填写姓名' };
      if (!/^\d{4,8}$/.test(code || '')) return { ok: false, msg: '邀请码须为4~8位数字' };
      if (phone && !validPhone(phone)) return { ok: false, msg: '手机号格式不正确' };
      if (d.agents.some(a => a.code === code && a.id !== id)) return { ok: false, msg: '该邀请码已被占用' };
      if (phone && d.agents.some(a => a.phone === phone && a.id !== id)) return { ok: false, msg: '该手机号已是代理人' };
      if (id) {
        const a = d.agents.find(x => x.id === id);
        if (!a) return { ok: false, msg: '账户不存在' };
        // 不能取消自己的管理员身份（保证至少一个管理员）
        if (a.id === currentAgent().id && a.role === 'admin' && role !== 'admin') {
          return { ok: false, msg: '不能降级自己的管理员身份' };
        }
        Object.assign(a, { name: name.trim(), code, role: role || a.role, phone: phone || '' });
      } else {
        d.agents.push({ id: 'AG' + String(Date.now()).slice(-6), name: name.trim(), code, role: role || 'agent', phone: phone || '' });
      }
      persist(d);
      return { ok: true };
    },

    /** 移除代理人（降回客户；不能移除自己） */
    async removeAgent(id) {
      await delay(300);
      const me = requireAdmin();
      if (!me) return { ok: false, msg: '仅管理员可维护账户' };
      if (id === me.id) return { ok: false, msg: '不能移除自己的账户' };
      const d = db();
      const a = d.agents.find(x => x.id === id);
      if (!a) return { ok: false, msg: '账户不存在' };
      // 保底：至少保留一个管理员
      if (a.role === 'admin' && d.agents.filter(x => x.role === 'admin').length <= 1) {
        return { ok: false, msg: '系统至少需保留一个管理员' };
      }
      d.agents = d.agents.filter(x => x.id !== id);
      if (a.phone && !d.users.find(u => u.phone === a.phone)) {
        d.users.push({ phone: a.phone, name: a.name, idCard: '', role: 'customer', createdAt: Date.now() });
      }
      persist(d);
      return { ok: true };
    },

    /** 提升客户为代理人（自动生成邀请码） */
    async promoteCustomer(phone) {
      await delay(350);
      if (!requireAdmin()) return { ok: false, msg: '仅管理员可维护账户' };
      const d = db();
      const u = d.users.find(x => x.phone === phone);
      if (!u) return { ok: false, msg: '客户不存在' };
      if (d.agents.some(a => a.phone === phone)) return { ok: false, msg: '该手机号已是代理人' };
      let code;
      do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (d.agents.some(a => a.code === code));
      d.agents.push({ id: 'AG' + String(Date.now()).slice(-6), name: u.name || '代理人' + phone.slice(-4), code, role: 'agent', phone });
      u.role = 'agent';
      persist(d);
      return { ok: true, code, name: u.name || phone };
    },

    /** 编辑客户档案（姓名/身份证） */
    async updateCustomer({ phone, name, idCard }) {
      await delay(300);
      if (!requireAdmin()) return { ok: false, msg: '仅管理员可维护账户' };
      const d = db();
      const u = d.users.find(x => x.phone === phone);
      if (!u) return { ok: false, msg: '客户不存在' };
      if (name?.trim()) u.name = name.trim();
      if (idCard !== undefined) {
        if (idCard && !validIdCard(idCard)) return { ok: false, msg: '身份证号格式不正确' };
        u.idCard = idCard || '';
      }
      persist(d);
      return { ok: true };
    },
  };

  window.Api = Api;
})();
