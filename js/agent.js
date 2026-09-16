/* agent.js — v5：三角色工作台（管理员/代理人）
   agent ：班期管理 + 我的客户（仅自己班期的客户，互相独立）
   admin ：班期管理 + 客户总览(全部) + 项目管理 + 账户管理
   交互要点：Tab 切换时惰性刷新对应数据；顶栏 Tab 吸顶；卡片信息分区块展示。 */
(function () {
  const $ = s => document.querySelector(s);
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const fmtDate = ds => { const d = new Date(ds.replace(/-/g, '/')); return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`; };
  const fmtTime = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const fmtClock = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const maskId = id => id ? id.replace(/(\d{4})\d+(\d{4})/, '$1****$2') : '';
  const gCls = g => g === 'B' ? 'g-b' : g === 'C' ? 'g-c' : g === 'D' ? 'g-d' : '';

  let toastTimer;
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2800);
  }

  let myRole = 'agent';
  let editing = null;      // 正在编辑的项目
  let accEditing = null;   // 正在编辑的账户
  let custEditing = null;  // 正在编辑的客户
  const ROLE_TEXT = {
    agent: '班期管理 · 我的客户',
    admin: '项目管理 · 账户维护 · 全量权限',
  };

  // ===== 登录（手机号 + 6位验证码，同客户端交互） =====
  $('#lg-send').onclick = async () => {
    const phone = $('#lg-phone').value.trim();
    const res = await Api.sendCode(phone);
    if (!res.ok) return toast(res.msg);
    toast('验证码已发送，任意6位数字即可登录');
    let t = 60;
    const btn = $('#lg-send'); btn.disabled = true;
    const iv = setInterval(() => {
      btn.textContent = `${--t}s 后重发`;
      if (t <= 0) { clearInterval(iv); btn.disabled = false; btn.textContent = '获取验证码'; }
    }, 1000);
  };
  $('#lg-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lg-btn').click(); });
  $('#lg-btn').onclick = async () => {
    const btn = $('#lg-btn');
    btn.disabled = true; btn.textContent = '登录中…';
    const res = await Api.agentLogin($('#lg-phone').value.trim(), $('#lg-code').value.trim());
    btn.disabled = false; btn.textContent = '进入工作台';
    if (!res.ok) return toast(res.msg);
    localStorage.setItem(MockDB.AGENT_KEY, res.agent.id);
    $('#lg-code').value = '';
    enter(res.agent);
    toast(`欢迎，${res.agent.name}`);
  };
  $('#btn-logout').onclick = () => { localStorage.removeItem(MockDB.AGENT_KEY); location.reload(); };

  function enter(agent) {
    myRole = agent.role || 'agent';
    $('#login-view').style.display = 'none';
    $('#work-view').style.display = '';
    $('#who-name').textContent = agent.name + ' · 工作台';
    $('#who-role').textContent = ROLE_TEXT[myRole];
    $('#tab-projects').style.display = myRole === 'admin' ? '' : 'none';
    $('#tab-accounts').style.display = myRole === 'admin' ? '' : 'none';
    loadAll();          // 班期 + 客户
    if (myRole === 'admin') { loadProjects(); loadAccounts(); }
  }

  // ===== Tab 切换：切到哪个 Tab 就刷新哪个数据 =====
  // loadAll 会同时刷新班期与客户；admin 额外刷新项目/账户
  document.querySelectorAll('.atab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.atab').forEach(b => b.classList.toggle('on', b === btn));
      ['trips', 'customers', 'projects', 'accounts'].forEach(t => {
        $('#tab-' + t).style.display = btn.dataset.tab === t ? '' : 'none';
      });
      const tab = btn.dataset.tab;
      $('#pane-title').textContent =
        tab === 'trips' ? '班期管理'
        : tab === 'customers' ? (myRole === 'admin' ? '客户总览' : '我的客户')
        : tab === 'projects' ? '项目管理'
        : '账户管理';
      if (tab === 'trips' || tab === 'customers') loadAll();
      else if (tab === 'projects') loadProjects();
      else if (tab === 'accounts') loadAccounts();
      window.scrollTo(0, 0);
    };
  });

  // ===== 班期状态细化 =====
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function tripStatus(t) {
    const today = todayStr();
    if (t.status === 'closed') return { cls: 'st-closed', text: '已关闭' };
    if (t.date < today) return { cls: 'st-done', text: '已结束' };
    if (t.date === today) return { cls: 'st-today', text: '今日发车' };
    if (t.leftSeats <= 0) return { cls: 'st-full', text: '已满员' };
    return { cls: 'st-open', text: '报名中' };
  }

  // ===== 汇总 + 班期列表 =====
  async function loadAll() {
    const trips = await Api.myTrips();
    const details = (await Promise.all(trips.map(t => Api.tripDetail(t.id)))).filter(Boolean);
    const paxSet = new Set();
    let resvCount = 0;
    details.forEach(d => { d.pax.forEach(p => paxSet.add(p.phone)); d.stats.forEach(s => resvCount += s.taken); });
    $('#st-trips').textContent = trips.length;
    $('#st-pax').textContent = paxSet.size;
    $('#st-resv').textContent = resvCount;
    $('#trip-count').textContent = trips.length;

    $('#ag-trips').innerHTML = '';
    if (!trips.length) { $('#ag-trips').innerHTML = '<div class="empty">还没有班期，请先在上方创建</div>'; }
    [...trips].sort((a, b) => b.date.localeCompare(a.date)).forEach(t => {
      const st = tripStatus(t);
      const el = document.createElement('div');
      el.className = 'card ag-trip';
      el.innerHTML = `
        <div class="ag-card-head">
          <div class="proj-group g-trip">🚌</div>
          <div class="grow">
            <div class="at-date"><b>${fmtDate(t.date)}</b><span>${t.time} 发车</span>
              <span class="badge-trip ${st.cls}">${st.text}</span></div>
            <div class="trip-meta">${t.meetup || '未填写集合点'}</div>
            <div class="quota-text"><span>已约 ${t.takenSeats}/${t.seats} 人</span><span>余 ${t.leftSeats} 座</span></div>
          </div>
        </div>
        <div class="ag-actions">
          <button class="mini-btn solid" data-act="detail">查看名单 · ${t.takenSeats}人</button>
          <button class="mini-btn ${t.status === 'open' ? '' : 'ok'}" data-act="toggle">${t.status === 'open' ? '关闭报名' : '重新开启'}</button>
        </div>`;
      el.querySelector('[data-act=detail]').onclick = () => openDetail(t.id);
      el.querySelector('[data-act=toggle]').onclick = async () => {
        if (t.status === 'open' && t.takenSeats > 0 && !confirm('关闭后客户将无法预约该班期，已预约名单保留。确认关闭？')) return;
        if (t.status === 'open' && t.takenSeats === 0 && !confirm('该班期暂无乘客，确认关闭？')) return;
        const res = await Api.closeTrip(t.id);
        if (!res.ok) return toast(res.msg);
        toast(t.status === 'open' ? '已关闭报名' : '已重新开启');
        loadAll();
      };
      $('#ag-trips').appendChild(el);
    });
  }

  // ===== 新建班期 =====
  $('#nt-btn').onclick = async () => {
    const date = $('#nt-date').value;
    if (!date) return toast('请选择日期');
    $('#nt-btn').disabled = true; $('#nt-btn').textContent = '创建中…';
    const res = await Api.createTrip({ date, time: $('#nt-time').value, meetup: $('#nt-meetup').value.trim() });
    $('#nt-btn').disabled = false; $('#nt-btn').textContent = '创建班期';
    if (!res.ok) return toast(res.msg);
    toast('班期已创建');
    $('#nt-date').value = ''; $('#nt-meetup').value = '';
    loadAll();
  };

  // ===== 班期详情 + 分项目 Sheet =====
  let detailData = null;
  async function openDetail(tripId) {
    const d = await Api.tripDetail(tripId);
    if (!d) return;
    detailData = d;
    const st = tripStatus(d.trip);
    const ck = d.pax.filter(p => p.checkedInAt).length;
    $('#dm-title').textContent = `${fmtDate(d.trip.date)} ${d.trip.time}`;
    $('#dm-sub').textContent = `${st.text} · 已约 ${d.pax.length}/${d.trip.seats} 人 · 已签到 ${ck}/${d.pax.length} · 点击项目行查看该项目的预约名单`;
    $('#dm-stats').innerHTML = d.stats.filter(s => s.taken > 0 || s.active).map(s => {
      const pct = Math.min(100, Math.round(s.taken / s.quota * 100));
      const full = s.taken >= s.quota;
      return `<div class="stat-proj ${s.active ? '' : 'disabled'} ${full ? 'full' : ''}" data-pid="${s.id}">
        <div class="sp-head">
          <span class="name">${s.name}${s.active ? '' : '（已下架）'}</span>
          <span class="sp-count">${full ? '已满' : `<b>${s.taken}</b>/${s.quota}`}</span>
          <span class="sp-arrow">›</span>
        </div>
        <div class="quota-bar"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join('') || '<div class="empty">暂无开放项目</div>';
    $('#dm-pax').innerHTML = d.pax.length
      ? `<table class="pax-table"><tr><th>姓名</th><th>手机号 / 身份证</th><th>预约项目</th><th>签到</th></tr>` +
        d.pax.map(p => `<tr>
          <td><b>${p.name || '未填写'}</b></td>
          <td>${p.phone}<span class="idcard">${maskId(p.idCard) || ''}</span></td>
          <td>${p.items.map(i => i.name.split(' · ')[0]).map(n => `<span class="who-chip">${n}</span>`).join(' ')}</td>
          <td class="ck-cell">${p.checkedInAt
            ? `<span class="ck-badge" title="${fmtClock(p.checkedInAt)} 已签到">已签到 ${fmtClock(p.checkedInAt)}</span>
               <button class="mini-btn ck-undo" data-checkin="${p.phone}">撤销</button>`
            : `<button class="mini-btn solid" data-checkin="${p.phone}">确认到场</button>`}</td>
        </tr>`).join('') + '</table>'
      : '<div class="empty">暂无乘客</div>';
    $('#dm-pax').querySelectorAll('[data-checkin]').forEach(b => {
      b.onclick = async () => {
        if (b.classList.contains('ck-undo') && !confirm(`撤销「${d.pax.find(x => x.phone === b.dataset.checkin)?.name || '该客户'}」的到场签到？`)) return;
        const res = await Api.checkIn(detailData.trip.id, b.dataset.checkin);
        if (!res.ok) return toast(res.msg);
        toast(res.checkedIn ? `已确认 ${res.name} 到场签到` : '已撤销签到');
        openDetail(detailData.trip.id);
      };
    });
    $('#dm-stats').querySelectorAll('.stat-proj').forEach(row => {
      row.onclick = () => openProjSheet(row.dataset.pid);
    });
    $('#detail-modal').style.display = '';
  }
  $('#dm-close').onclick = () => { $('#detail-modal').style.display = 'none'; };
  $('#detail-modal').addEventListener('click', e => { if (e.target.id === 'detail-modal') e.target.style.display = 'none'; });

  function openProjSheet(pid) {
    if (!detailData) return;
    const s = detailData.stats.find(x => x.id === pid);
    if (!s) return;
    const takers = detailData.pax.filter(p => p.items.some(i => i.id === pid));
    $('#ps-title').textContent = s.name;
    $('#ps-sub').textContent = `${fmtDate(detailData.trip.date)} 班 · ${s.taken}/${s.quota} 已约 · ${takers.length} 人`;
    $('#ps-body').innerHTML = takers.length
      ? takers.map(p => `
        <div class="sheet-pax">
          <div class="avatar-sm">${(p.name || '客')[0]}</div>
          <div class="info">
            <div class="nm">${p.name || '未填写姓名'}</div>
            <div class="ph">${p.phone}${p.idCard ? `<span>${maskId(p.idCard)}</span>` : ''}</div>
          </div>
        </div>`).join('')
      : '<div class="empty">该项目暂无预约</div>';
    $('#proj-sheet').style.display = '';
  }
  $('#proj-sheet').addEventListener('click', e => { if (e.target.id === 'proj-sheet') e.target.style.display = 'none'; });

  // ===== 我的客户（代理人=自己班期的客户；管理员=全部） =====
  async function loadCustomers() {
    const r = await Api.myCustomers();
    if (!r.ok) return toast(r.msg);
    $('#cust-empty').style.display = r.customers.length ? 'none' : '';
    $('#cust-count-text').textContent = (myRole === 'admin' ? '全部代理人名下客户 · ' : '客户信息仅您可见 · ') + `共 ${r.total} 人`;
    $('#cust-list').innerHTML = '';
    r.customers.forEach(u => cusCard(u));
  }
  function cusCard(u) {
    const el = document.createElement('div');
    el.className = 'card ag-cust';
    el.innerHTML = `
      <div class="ag-card-head">
        <div class="avatar-sm">${(u.name || '客')[0]}</div>
        <div class="grow">
          <div class="cc-name">${u.name || '<span style="color:var(--ink-3)">未填写姓名</span>'}</div>
          <div class="cc-sub">${u.phone} · ${u.tripCount} 个班期 · ${u.resvCount} 单</div>
          <div class="who-chips">${u.projects.map(p => `<span class="who-chip">${p.split(' · ')[0]}</span>`).join('') || '<span class="who-chip dim">暂无项目</span>'}</div>
        </div>
      </div>
      <div class="ag-actions">
        <button class="mini-btn" data-act="edit">编辑档案${u.idCard ? '' : ' · 补录身份证'}</button>
      </div>`;
    el.querySelector('[data-act=edit]').onclick = () => openCustModal(u);
    $('#cust-list').appendChild(el);
  }
  function openCustModal(u) {
    custEditing = u;
    $('#cm-phone').value = u.phone;
    $('#cm-name').value = u.name || '';
    $('#cm-id').value = u.idCard || '';
    $('#cust-modal').style.display = '';
  }
  $('#cm-cancel').onclick = () => { $('#cust-modal').style.display = 'none'; };
  $('#cm-save').onclick = async () => {
    const res = await Api.updateMyCustomer({ phone: custEditing.phone, name: $('#cm-name').value, idCard: $('#cm-id').value.trim().toUpperCase() });
    if (!res.ok) return toast(res.msg);
    toast('档案已更新');
    $('#cust-modal').style.display = 'none';
    loadAll();
  };

  // ===== 项目管理（仅管理员） =====
  async function loadProjects() {
    const ps = await Api.adminProjects();
    if (!ps.length && myRole !== 'admin') return;
    $('#ag-projects').innerHTML = '';
    ps.forEach(p => {
      const el = document.createElement('div');
      el.className = 'card' + (p.active ? '' : ' proj-off');
      const mallText = p.mall ? `${p.mall.name} · ${p.mall.price}${p.mall.url ? '' : '（未配链接）'}` : '';
      el.innerHTML = `
        <div class="ag-card-head">
          <div class="proj-group ${gCls(p.group)}">${p.group}</div>
          <div class="grow">
            <div class="pc-name">${p.name}${p.active ? '' : ' <span class="badge-trip st-done">已下架</span>'}</div>
            <div class="pc-sub">
              <span>每班名额 ${p.quota}</span>
              <span>${p.takers} 人约过 · 累计 ${p.takenTotal} 单</span>
            </div>
            ${p.desc ? `<div class="trip-meta">${p.desc}</div>` : ''}
            ${mallText ? `<div class="trip-meta" style="color:var(--warn)">🛒 商城 · ${mallText}</div>` : ''}
          </div>
          <button class="proj-toggle ${p.active ? 'on' : ''}" aria-label="${p.active ? '下架' : '上架'}" title="${p.active ? '上架中，点击下架' : '已下架，点击上架'}"></button>
        </div>
        <div class="ag-actions">
          <button class="mini-btn" data-act="edit">编辑项目</button>
        </div>`;
      el.querySelector('.proj-toggle').onclick = async () => {
        if (p.active && !confirm(`下架后客户将无法预约「${p.name}」，已预约的 ${p.takenTotal} 单不受影响。确认下架？`)) return;
        const r = await Api.toggleProject(p.id);
        toast(r.active ? '已上架' : '已下架');
        loadProjects();
      };
      el.querySelector('[data-act=edit]').onclick = () => openProjModal(p);
      $('#ag-projects').appendChild(el);
    });
  }

  function openProjModal(p) {
    editing = p || null;
    $('#pm-title').textContent = p ? '编辑项目' : '新增项目';
    $('#pm-name').value = p?.name || '';
    $('#pm-group').value = p?.group || 'A';
    $('#pm-quota').value = p?.quota ?? 30;
    $('#pm-price').value = p?.price ?? 0;
    $('#pm-desc').value = p?.desc || '';
    $('#pm-note').value = p?.note || '';
    $('#pm-mallname').value = p?.mall?.name || '';
    $('#pm-mallprice').value = p?.mall?.price || '';
    $('#pm-malltype').value = p?.mall?.type || 'mini';
    $('#pm-mallurl').value = p?.mall?.url || '';
    $('#pm-needid').checked = !!p?.needId;
    $('#pm-queue').checked = !!p?.queue;
    $('#pm-firstfree').checked = !!p?.firstFree;
    $('#proj-modal').style.display = '';
  }
  $('#p-add').onclick = () => openProjModal(null);
  $('#pm-cancel').onclick = () => { $('#proj-modal').style.display = 'none'; };
  $('#pm-save').onclick = async () => {
    const mallName = $('#pm-mallname').value.trim();
    if (!$('#pm-name').value.trim()) return toast('请填写项目名称');
    if (!(Number($('#pm-quota').value) >= 1)) return toast('请填写每班名额');
    $('#pm-save').disabled = true; $('#pm-save').textContent = '保存中…';
    const res = await Api.saveProject({
      id: editing?.id, name: $('#pm-name').value, group: $('#pm-group').value,
      quota: Number($('#pm-quota').value), price: Number($('#pm-price').value) || 0,
      desc: $('#pm-desc').value.trim(), note: $('#pm-note').value.trim(),
      needId: $('#pm-needid').checked, queue: $('#pm-queue').checked, firstFree: $('#pm-firstfree').checked,
      mall: mallName ? {
        name: mallName, price: $('#pm-mallprice').value.trim(),
        type: $('#pm-malltype').value, url: $('#pm-mallurl').value.trim(),
      } : null,
    });
    $('#pm-save').disabled = false; $('#pm-save').textContent = '保存';
    if (!res.ok) return toast(res.msg);
    toast(editing ? '项目已更新' : '项目已新增');
    $('#proj-modal').style.display = 'none';
    loadProjects();
  };

  // ===== 账户管理（仅管理员） =====
  async function loadAccounts() {
    const r = await Api.listAccounts();
    if (!r.ok) return toast(r.msg);
    $('#acc-agents').innerHTML = '';
    r.agents.forEach(a => {
      const el = document.createElement('div');
      el.className = 'card ag-acc';
      el.innerHTML = `
        <div class="ag-card-head">
          <div class="avatar-sm">${(a.name || '人')[0]}</div>
          <div class="grow">
            <div class="cc-name">${a.name}
              ${a.id === r.meId ? '<span class="who-chip">当前登录</span>' : ''}
              <span class="role-badge ${a.role === 'admin' ? 'rb-admin' : 'rb-agent'}">${a.role === 'admin' ? '管理员' : '代理人'}</span></div>
            <div class="cc-sub">${a.role === 'admin' ? '项目 · 账户 · 全量权限' : '班期 · 客户管理'}</div>
            <div class="cc-sub2">手机号 ${a.phone}</div>
          </div>
        </div>
        <div class="ag-actions">
          <button class="mini-btn" data-act="edit">编辑</button>
          <button class="mini-btn danger" data-act="remove" ${a.id === r.meId ? 'disabled' : ''}>移除</button>
        </div>`;
      el.querySelector('[data-act=edit]').onclick = () => openAccModal(a);
      el.querySelector('[data-act=remove]').onclick = async () => {
        if (!confirm(`移除后「${a.name}」将无法用该手机号登录，其名下班期与客户转归您。确认移除？`)) return;
        const res = await Api.removeAgent(a.id);
        if (!res.ok) return toast(res.msg);
        toast('已移除');
        loadAccounts(); loadAll();
      };
      $('#acc-agents').appendChild(el);
    });
  }
  function openAccModal(a) {
    accEditing = a || null;
    $('#am-title').textContent = a ? '编辑账户' : '新增账户';
    $('#am-name').value = a?.name || '';
    $('#am-phone').value = a?.phone || '';
    $('#am-role').value = a?.role || 'agent';
    $('#acc-modal').style.display = '';
  }
  $('#acc-add').onclick = () => openAccModal(null);
  $('#am-cancel').onclick = () => { $('#acc-modal').style.display = 'none'; };
  $('#am-save').onclick = async () => {
    if (!$('#am-name').value.trim()) return toast('请填写姓名');
    const res = await Api.saveAgentAccount({
      id: accEditing?.id, name: $('#am-name').value, phone: $('#am-phone').value.trim(), role: $('#am-role').value,
    });
    if (!res.ok) return toast(res.msg);
    toast(accEditing ? '账户已更新' : '账户已新增');
    $('#acc-modal').style.display = 'none';
    loadAccounts();
  };

  // 自动登录
  (async () => {
    const saved = localStorage.getItem(MockDB.AGENT_KEY);
    if (saved) {
      const r = await Api.whoAmI();
      if (r.ok) enter(r.agent);
      else localStorage.removeItem(MockDB.AGENT_KEY);
    }
  })();
})();