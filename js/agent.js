/* agent.js — 代理人端 v2：班期 + 项目管理 + 名单明细 */
(function () {
  const $ = s => document.querySelector(s);
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const fmtDate = ds => { const d = new Date(ds.replace(/-/g, '/')); return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`; };
  const GROUP_NAMES = { A: 'A组', B: 'B组', C: 'C组', D: 'D组' };

  let toastTimer;
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2800);
  }

  let editing = null; // 当前编辑项目对象

  // ===== 登录 =====
  $('#lg-btn').onclick = async () => {
    const res = await Api.agentLogin($('#lg-code').value.trim());
    if (!res.ok) return toast(res.msg);
    localStorage.setItem(MockDB.AGENT_KEY, res.agent.id);
    enter(res.agent);
  };
  $('#lg-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lg-btn').click(); });
  $('#btn-logout').onclick = () => { localStorage.removeItem(MockDB.AGENT_KEY); location.reload(); };

  function enter(agent) {
    $('#login-view').style.display = 'none';
    $('#work-view').style.display = '';
    $('#who-name').textContent = agent.name + ' · 工作台';
    loadAll();
    loadProjects();
  }

  // ===== 顶部Tab =====
  document.querySelectorAll('.atab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.atab').forEach(b => b.classList.toggle('on', b === btn));
      const p = btn.dataset.tab === 'projects';
      $('#tab-trips').style.display = p ? 'none' : '';
      $('#tab-projects').style.display = p ? '' : 'none';
      window.scrollTo(0, 0);
    };
  });

  // ===== 班期状态细化 =====
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  /**
   * 班期显示状态（优先级从高到低）：
   * 已关闭(手动停约) > 已结束(日期已过) > 今日发车 > 已满员(座位满) > 报名中
   */
  function tripStatus(t) {
    const today = todayStr();
    if (t.status === 'closed') return { cls: 'st-closed', text: '已关闭', tip: '手动停止报名' };
    if (t.date < today) return { cls: 'st-done', text: '已结束', tip: '日期已过' };
    if (t.date === today) return { cls: 'st-today', text: '今日发车', tip: '今天发车' };
    if (t.leftSeats <= 0) return { cls: 'st-full', text: '已满员', tip: '40座已满，客户不可再约' };
    return { cls: 'st-open', text: '报名中', tip: `余 ${t.leftSeats} 座` };
  }

  // ===== 汇总 + 班期列表 =====
  async function loadAll() {
    const trips = await Api.listTrips();
    const details = await Promise.all(trips.map(t => Api.tripDetail(t.id)));
    const paxSet = new Set();
    let resvCount = 0;
    details.forEach(d => { d.pax.forEach(p => paxSet.add(p.phone)); d.stats.forEach(s => resvCount += s.taken); });
    $('#st-trips').textContent = trips.length;
    $('#st-pax').textContent = paxSet.size;
    $('#st-resv').textContent = resvCount;

    $('#ag-trips').innerHTML = '';
    [...trips].sort((a, b) => b.date.localeCompare(a.date)).forEach(t => {
      const st = tripStatus(t);
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `
        <div class="ag-card-head">
          <div class="grow">
            <div class="trip-date"><b>${fmtDate(t.date)}</b><span>${t.time}</span>
              <span class="badge-trip ${st.cls}" title="${st.tip}">${st.text}</span></div>
            <div class="trip-meta">${t.meetup}</div>
            <div class="quota-text"><span>已约 ${t.takenSeats}/${t.seats} 人 · ${st.tip}</span><span></span></div>
          </div>
        </div>
        <div class="ag-actions">
          <button class="mini-btn solid" data-act="detail">查看名单</button>
          <button class="mini-btn" data-act="toggle">${t.status === 'open' ? '关闭报名' : '重新开启'}</button>
        </div>`;
      el.querySelector('[data-act=detail]').onclick = () => openDetail(t.id);
      el.querySelector('[data-act=toggle]').onclick = async () => {
        if (t.status === 'open' && !confirm('关闭后客户将无法预约该班期，确认关闭？')) return;
        await Api.closeTrip(t.id);
        toast(t.status === 'open' ? '已关闭报名' : '已重新开启');
        loadAll();
      };
      $('#ag-trips').appendChild(el);
    });
  }

  // ===== 新建班期（集合点自由填写） =====
  $('#nt-btn').onclick = async () => {
    const date = $('#nt-date').value;
    if (!date) return toast('请选择日期');
    const res = await Api.createTrip({ date, time: $('#nt-time').value, meetup: $('#nt-meetup').value.trim() });
    if (!res.ok) return toast(res.msg);
    toast('班期已创建');
    $('#nt-date').value = ''; $('#nt-meetup').value = '';
    loadAll();
  };

  // ===== 班期详情：项目统计（点击看名单）+ 乘客表 =====
  let detailData = null;
  async function openDetail(tripId) {
    const d = await Api.tripDetail(tripId);
    if (!d) return;
    detailData = d;
    const st = tripStatus(d.trip);
    $('#dm-title').textContent = `${fmtDate(d.trip.date)} ${d.trip.time}`;
    $('#dm-sub').textContent = `${st.text} · ${d.pax.length}/${d.trip.seats} 人 · 点击项目行查看该项目的预约名单`;
    $('#dm-stats').innerHTML = d.stats.filter(s => s.taken > 0 || s.active).map(s => {
      const pct = Math.min(100, Math.round(s.taken / s.quota * 100));
      return `<div class="stat-proj ${s.active ? '' : 'disabled'}" data-pid="${s.id}">
        <div class="sp-head">
          <span class="name">${s.name}${s.active ? '' : '（已下架）'}</span>
          <span class="sp-count"><b>${s.taken}</b>/${s.quota}</span>
          <span class="sp-arrow">›</span>
        </div>
        <div class="quota-bar"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join('') || '<div class="empty">暂无开放项目</div>';
    $('#dm-pax').innerHTML = d.pax.length
      ? `<table class="pax-table"><tr><th>姓名</th><th>手机号 / 身份证</th><th>预约项目</th></tr>` +
        d.pax.map(p => `<tr>
          <td><b>${p.name}</b></td>
          <td>${p.phone}<span class="idcard">${p.idCard || ''}</span></td>
          <td>${p.items.map(i => i.name.split(' · ')[0]).map(n => `<span class="who-chip">${n}</span>`).join(' ')}</td>
        </tr>`).join('') + '</table>'
      : '<div class="empty">暂无乘客</div>';
    $('#dm-stats').querySelectorAll('.stat-proj').forEach(row => {
      row.onclick = () => openProjSheet(row.dataset.pid);
    });
    $('#detail-modal').style.display = '';
  }

  // ===== 分项目名单 Sheet =====
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
          <div class="avatar-sm">${p.name[0]}</div>
          <div class="info">
            <div class="nm">${p.name}</div>
            <div class="ph">${p.phone}${p.idCard ? `<span>身份证 ${p.idCard.replace(/(\d{4})\d+(\d{4})/, '$1****$2')}</span>` : ''}</div>
          </div>
          <span class="who-chip">${s.taken}/${s.quota}</span>
        </div>`).join('')
      : '<div class="empty">该项目暂无预约</div>';
    $('#proj-sheet').style.display = '';
  }
  $('#proj-sheet').addEventListener('click', e => { if (e.target.id === 'proj-sheet') e.target.style.display = 'none'; });
  $('#dm-close').onclick = () => { $('#detail-modal').style.display = 'none'; };
  $('#detail-modal').addEventListener('click', e => { if (e.target.id === 'detail-modal') e.target.style.display = 'none'; });

  // ===== 项目管理 =====
  async function loadProjects() {
    const ps = await Api.adminProjects();
    $('#ag-projects').innerHTML = '';
    ps.forEach(p => {
      const el = document.createElement('div');
      el.className = 'card' + (p.active ? '' : ' disabled');
      el.innerHTML = `
        <div class="ag-card-head">
          <div class="proj-group ${p.group === 'B' ? 'g-b' : p.group === 'C' ? 'g-c' : p.group === 'D' ? 'g-d' : ''}">${p.group}</div>
          <div class="grow">
            <div class="proj-name">${p.name}</div>
            <div class="quota-text" style="margin-top:3px">
              <span>名额 ${p.takenTotal}/${p.quota}/班 · ${p.price ? `挂号费 ¥${p.price} 线下` : '免费'}</span>
              <span>${p.takers} 人约过</span></div>
            <div class="trip-meta">${p.desc || ''}</div>
          </div>
          <button class="proj-toggle ${p.active ? 'on' : ''}" title="${p.active ? '上架中，点击下架' : '已下架，点击上架'}"></button>
        </div>
        <div class="ag-actions">
          <button class="mini-btn" data-act="edit">编辑</button>
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

  // ===== 项目新增/编辑弹层 =====
  function openProjModal(p) {
    editing = p || null;
    $('#pm-title').textContent = p ? '编辑项目' : '新增项目';
    $('#pm-name').value = p?.name || '';
    $('#pm-group').value = p?.group || 'A';
    $('#pm-quota').value = p?.quota ?? 30;
    $('#pm-price').value = p?.price ?? 0;
    $('#pm-mallname').value = p?.mall?.name || '';
    $('#pm-mallprice').value = p?.mall?.price || '';
    $('#pm-desc').value = p?.desc || '';
    $('#pm-note').value = p?.note || '';
    $('#pm-needid').checked = !!p?.needId;
    $('#pm-queue').checked = !!p?.queue;
    $('#proj-modal').style.display = '';
  }
  $('#p-add').onclick = () => openProjModal(null);
  $('#pm-cancel').onclick = () => { $('#proj-modal').style.display = 'none'; };
  $('#pm-save').onclick = async () => {
    const mallName = $('#pm-mallname').value.trim();
    const mallPrice = $('#pm-mallprice').value.trim();
    const res = await Api.saveProject({
      id: editing?.id, name: $('#pm-name').value, group: $('#pm-group').value,
      quota: Number($('#pm-quota').value), price: Number($('#pm-price').value) || 0,
      desc: $('#pm-desc').value.trim(), note: $('#pm-note').value.trim(),
      needId: $('#pm-needid').checked, queue: $('#pm-queue').checked,
      mall: mallName ? { name: mallName, price: mallPrice || '价格待定' } : null,
    });
    if (!res.ok) return toast(res.msg);
    toast(editing ? '项目已更新' : '项目已新增');
    $('#proj-modal').style.display = 'none';
    loadProjects();
  };

  // 自动登录
  (async () => {
    if (localStorage.getItem(MockDB.AGENT_KEY)) enter({ id: 'AG001', name: '王代理' });
  })();
})();
