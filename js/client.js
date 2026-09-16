/* client.js — 客户端逻辑 */
(function () {
  const $ = s => document.querySelector(s);
  const state = { trips: [], projects: [], tripId: null, sel: new Set(), phone: '' };

  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekOf = ds => WEEK[new Date(ds.replace(/-/g, '/')).getDay()];
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = ds => { const d = new Date(ds.replace(/-/g, '/')); return `${d.getMonth() + 1}月${d.getDate()}日(${weekOf(ds)})`; };

  let toastTimer;
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  // ===== Tab 切换 =====
  document.querySelectorAll('.tabbar button').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b === btn));
      const mine = btn.dataset.tab === 'mine';
      ['#view-trips', '#view-projects', '#view-form'].forEach(s => $(s).style.display = mine ? 'none' : '');
      $('#view-mine').style.display = mine ? '' : 'none';
      if (mine && $('#q-phone').value) $('#btn-query').click();
    };
  });

  // ===== 视图1：班车 =====
  async function loadTrips() {
    $('#trip-list').innerHTML = '<div class="empty">加载中…</div>';
    state.trips = await Api.listTrips();
    const open = state.trips.filter(t => t.status === 'open');
    $('#trip-empty').style.display = open.length ? 'none' : '';
    $('#trip-list').innerHTML = '';
    open.forEach(t => {
      const full = t.leftSeats <= 0;
      const el = document.createElement('div');
      el.className = 'card' + (full ? ' disabled' : '');
      el.innerHTML = `
        <div class="trip-date"><b>${fmtDate(t.date)}</b><span>${t.time} 发车</span>
          <span class="seat-pill ${full ? 'full' : ''}">${full ? '已满员' : `余 ${t.leftSeats} 座`}</span></div>
        <div class="trip-meta">${t.meetup} · 全程约40分钟 · 已约 ${t.takenSeats}/${t.seats} 人</div>`;
      if (!full) el.onclick = () => chooseTrip(t.id);
      $('#trip-list').appendChild(el);
    });
  }

  function chooseTrip(tripId) {
    state.tripId = tripId;
    state.sel.clear();
    $('#step1').classList.remove('on'); $('#step2').classList.add('on');
    $('#view-trips').style.display = 'none';
    $('#view-projects').style.display = '';
    loadProjects();
    window.scrollTo(0, 0);
  }

  // ===== 视图2：项目 =====
  async function loadProjects() {
    const t = state.trips.find(x => x.id === state.tripId);
    $('#proj-trip-hint').textContent = `${fmtDate(t.date)} ${t.time} · 单班名额有限`;
    $('#proj-list').innerHTML = '<div class="empty">加载中…</div>';
    state.projects = await Api.listProjects(state.tripId);
    $('#proj-list').innerHTML = '';
    state.projects.forEach(p => {
      const full = p.left <= 0;
      const el = document.createElement('div');
      el.className = 'card' + (full ? ' disabled' : '') + (state.sel.has(p.id) ? ' sel' : '');
      el.dataset.pid = p.id;
      const pct = Math.min(100, Math.round(p.taken / p.quota * 100));
      const tags = [];
      if (p.firstFree) tags.push('<span class="tag">首次免费</span>');
      if (p.skipReg !== false && p.id === 'P1') tags.push('<span class="tag">免挂号</span>');
      if (p.queue) tags.push('<span class="tag">现场排队</span>');
      if (p.price) tags.push(`<span class="tag fee">挂号费 ¥${p.price} 线下支付</span>`);
      else if (p.id === 'P2' || p.id === 'P3') tags.push('<span class="tag fee">医保结算走线下</span>');
      el.innerHTML = `
        <div class="proj-head">
          <div class="proj-group ${p.group === 'B' ? 'g-b' : p.group === 'C' ? 'g-c' : p.group === 'D' ? 'g-d' : ''}">${p.group}</div>
          <div style="flex:1">
            <div class="proj-name">${p.name}</div>
            <div class="proj-desc">${p.desc}</div>
            ${tags.length ? `<div class="proj-tags">${tags.join('')}</div>` : ''}
            <div class="quota-bar"><i class="${p.left <= Math.ceil(p.quota * 0.15) ? 'low' : ''}" style="width:${pct}%"></i></div>
            <div class="quota-text"><span>已约 ${p.taken}/${p.quota}</span><span>${full ? '名额已满' : `剩 ${p.left} 个名额`}</span></div>
            ${p.mall ? `<div class="mall-row">🏥 北医商城 · ${p.mall.name} <b>${p.mall.price}</b>
              <button class="btn-mall">去商城购买 ›</button></div>` : ''}
          </div>
          <div class="check"></div>
        </div>`;
      el.querySelector('.btn-mall')?.addEventListener('click', e => {
        e.stopPropagation();
        toast('演示环境：此处跳转北医商城小程序');
      });
      if (!full) el.onclick = () => {
        state.sel.has(p.id) ? state.sel.delete(p.id) : state.sel.add(p.id);
        el.classList.toggle('sel', state.sel.has(p.id));
      };
      $('#proj-list').appendChild(el);
    });
  }

  $('#btn-to-form').onclick = () => {
    if (!state.sel.size) return toast('请至少选择 1 个项目');
    $('#step2').classList.remove('on'); $('#step3').classList.add('on');
    $('#view-projects').style.display = 'none';
    $('#view-form').style.display = '';
    const needId = state.projects.find(p => state.sel.has(p.id) && p.needId);
    $('#f-id-req').style.display = needId ? '' : 'none';
    window.scrollTo(0, 0);
  };
  $('#btn-back-trips').onclick = () => {
    $('#step2').classList.remove('on'); $('#step1').classList.add('on');
    $('#view-projects').style.display = 'none'; $('#view-trips').style.display = '';
  };
  $('#btn-back-projects').onclick = () => {
    $('#step3').classList.remove('on'); $('#step2').classList.add('on');
    $('#view-form').style.display = 'none'; $('#view-projects').style.display = '';
  };

  // ===== 视图3：提交 =====
  $('#btn-submit').onclick = async () => {
    const btn = $('#btn-submit');
    btn.disabled = true; btn.textContent = '提交中…';
    const res = await Api.reserve({
      tripId: state.tripId,
      projectIds: [...state.sel],
      name: $('#f-name').value.trim(),
      phone: $('#f-phone').value.trim(),
      idCard: $('#f-id').value.trim().toUpperCase(),
    });
    btn.disabled = false; btn.textContent = '确认预约';
    if (!res.ok) return toast(res.msg);
    const t = state.trips.find(x => x.id === state.tripId);
    $('#ok-text').textContent = `${fmtDate(t.date)} ${t.time} · ${state.sel.size} 个项目已预约，请准时到 ${t.meetup} 集合上车。`;
    $('#ok-modal').style.display = '';
    // 重置流程
    state.sel.clear();
    $('#f-name').value = $('#f-phone').value = $('#f-id').value = '';
    setTimeout(() => {
      $('#ok-modal').style.display = 'none';
      $('#step3').classList.remove('on'); $('#step1').classList.add('on');
      $('#view-form').style.display = 'none'; $('#view-trips').style.display = '';
      loadTrips();
    }, 100);
  };
  $('#ok-close').onclick = () => { $('#ok-modal').style.display = 'none'; };

  // ===== 我的预约 =====
  $('#btn-query').onclick = async () => {
    const phone = $('#q-phone').value.trim();
    if (!/^1\d{10}$/.test(phone)) return toast('请输入正确的手机号');
    const list = await Api.myReservations(phone);
    $('#mine-list').innerHTML = '';
    $('#mine-empty').style.display = list.length ? 'none' : '';
    const byTrip = {};
    list.forEach(r => (byTrip[r.tripId] = byTrip[r.tripId] || []).push(r));
    Object.values(byTrip).forEach(rows => {
      const card = document.createElement('div');
      card.className = 'card mine-item';
      card.innerHTML = `<div class="trip">🚌 ${rows[0].tripLabel}</div>` +
        rows.map(r => `
          <div class="pn">${r.projectName}</div>
          <div class="note">${r.projectNote}${r.mall ? ` · 可购：${r.mall.name}（${r.mall.price}）` : ''}</div>`).join('');
      $('#mine-list').appendChild(card);
    });
  };

  loadTrips();
})();
