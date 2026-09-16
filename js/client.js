/* client.js — 客户端 v2：登录 → 选车 → 选项目 → 确认 → 成功页；我的预约+详情 */
(function () {
  const $ = s => document.querySelector(s);
  const state = { me: null, trips: [], projects: [], tripId: null, sel: new Set(), step: 1, mine: [], detailTrip: null };

  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekOf = ds => WEEK[new Date(ds.replace(/-/g, '/')).getDay()];
  const fmtDate = ds => { const d = new Date(ds.replace(/-/g, '/')); return `${d.getMonth() + 1}月${d.getDate()}日(${weekOf(ds)})`; };
  const fmtTime = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  let toastTimer;
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2800);
  }
  function showView(name) {
    ['view-login', 'view-app', 'view-success', 'view-detail'].forEach(v =>
      $('#' + v).style.display = v === name ? '' : 'none');
    window.scrollTo(0, 0);
  }
  const bar = () => $('#actionbar');
  function updateBar() {
    // 悬浮栏内容随步骤变化
    const info = { 1: ['第一步', '选择要乘坐的班车班期'], 2: [`${state.sel.size} 个项目已选`, '可多选，名额有限'], 3: ['最后一步', '核对信息并提交预约'] };
    const [b, s] = info[state.step];
    $('#bar-info').innerHTML = `<b>${b}</b>${s || ''}`;
    $('#btn-prev').textContent = state.step === 1 ? '我的预约' : '上一步';
    $('#btn-next').textContent = state.step === 3 ? '确认预约' : '下一步';
    $('#btn-next').disabled = (state.step === 2 && !state.sel.size);
    bar().style.display = '';
  }
  function setStep(n) {
    state.step = n;
    [1, 2, 3].forEach(i => $('#step' + i).classList.toggle('on', i <= n));
    $('#view-trips').style.display = n === 1 ? '' : 'none';
    $('#view-projects').style.display = n === 2 ? '' : 'none';
    $('#view-form').style.display = n === 3 ? '' : 'none';
    updateBar();
    window.scrollTo(0, 0);
  }

  // ================= 登录 =================
  let codeCd = 0;
  $('#lg-send').onclick = async () => {
    const phone = $('#lg-phone').value.trim();
    const res = await Api.sendCode(phone);
    if (!res.ok) return toast(res.msg);
    toast(`演示验证码：${res.demoCode}`);
    let t = 60;
    const btn = $('#lg-send'); btn.disabled = true;
    const iv = setInterval(() => {
      btn.textContent = `${--t}s 后重发`;
      if (t <= 0) { clearInterval(iv); btn.disabled = false; btn.textContent = '获取验证码'; }
    }, 1000);
  };
  $('#lg-submit').onclick = async () => {
    const res = await Api.login($('#lg-phone').value.trim(), $('#lg-code').value.trim());
    if (!res.ok) return toast(res.msg);
    await enterApp();
    toast('登录成功');
  };

  async function enterApp() {
    state.me = await Api.me();
    if (!state.me) { showView('view-login'); return; }
    $('#uc-name').textContent = state.me.name || '我的';
    $('#uc-avatar').textContent = (state.me.name || state.me.phone.slice(-2))[0];
    showView('view-app');
    $('#tabbar').style.display = '';
    document.querySelector('[data-tab=book]').click();
  }

  // 用户弹窗
  $('#user-chip').onclick = () => {
    $('#me-phone').textContent = `${state.me.name || '未填写姓名'} · ${state.me.phone}`;
    $('#me-modal').style.display = '';
  };
  $('#me-cancel').onclick = () => $('#me-modal').style.display = 'none';
  $('#me-logout').onclick = () => { Api.logout(); location.reload(); };

  // ================= Tab =================
  document.querySelectorAll('.tabbar button').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b === btn));
      const mine = btn.dataset.tab === 'mine';
      bar().style.display = mine ? 'none' : '';
      document.querySelectorAll('.steps').forEach(s => s.style.display = mine ? 'none' : '');
      $('#view-trips').style.display = !mine && state.step === 1 ? '' : 'none';
      $('#view-projects').style.display = !mine && state.step === 2 ? '' : 'none';
      $('#view-form').style.display = !mine && state.step === 3 ? '' : 'none';
      $('#view-mine').style.display = mine ? '' : 'none';
      if (mine) loadMine();
      window.scrollTo(0, 0);
    };
  });

  // ================= 悬浮栏 =================
  $('#btn-prev').onclick = () => {
    if (state.step === 1) { document.querySelector('[data-tab=mine]').click(); return; }
    setStep(state.step - 1);
  };
  $('#btn-next').onclick = () => {
    if (state.step === 2 && !state.sel.size) return toast('请至少选择 1 个项目');
    if (state.step < 3) return setStep(state.step + 1);
    openConfirm();
  };

  // ================= 视图1：班车 =================
  async function loadTrips() {
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
        <div class="trip-meta">${t.meetup}</div>
        <div class="quota-text"><span>已约 ${t.takenSeats}/${t.seats} 人</span><span></span></div>`;
      if (!full) el.onclick = () => chooseTrip(t.id);
      $('#trip-list').appendChild(el);
    });
  }
  function chooseTrip(tripId) {
    state.tripId = tripId;
    state.sel.clear();
    loadProjects();
    setStep(2);
  }

  // ================= 视图2：项目 =================
  async function loadProjects() {
    const t = state.trips.find(x => x.id === state.tripId);
    $('#proj-trip-hint').textContent = `${fmtDate(t.date)} ${t.time} · 单班名额有限`;
    $('#proj-list').innerHTML = '<div class="loader">加载中…</div>';
    state.projects = await Api.listProjects(state.tripId);
    $('#proj-list').innerHTML = '';
    state.projects.forEach(p => {
      const full = p.left <= 0;
      const el = document.createElement('div');
      el.className = 'card' + (full ? ' disabled' : '') + (state.sel.has(p.id) ? ' sel' : '');
      const pct = Math.min(100, Math.round(p.taken / p.quota * 100));
      const tags = [];
      if (p.firstFree) tags.push('<span class="tag">首次免费</span>');
      if (p.queue) tags.push('<span class="tag">现场排队</span>');
      if (p.needId) tags.push('<span class="tag">需身份证</span>');
      if (p.price) tags.push(`<span class="tag fee">挂号费 ¥${p.price} 线下</span>`);
      else if (/医保/.test(p.note)) tags.push('<span class="tag fee">医保结算走线下</span>');
      el.innerHTML = `
        <div class="proj-head">
          <div class="proj-group ${p.group === 'B' ? 'g-b' : p.group === 'C' ? 'g-c' : p.group === 'D' ? 'g-d' : ''}">${p.group}</div>
          <div style="flex:1">
            <div class="proj-name">${p.name}</div>
            <div class="proj-desc">${p.desc}</div>
            ${tags.length ? `<div class="proj-tags">${tags.join('')}</div>` : ''}
            <div class="quota-bar"><i class="${p.left <= Math.ceil(p.quota * 0.15) ? 'low' : ''}" style="width:${pct}%"></i></div>
            <div class="quota-text"><span>已约 ${p.taken}/${p.quota}</span><span>${full ? '名额已满' : `剩 ${p.left} 个`}</span></div>
            ${p.mall ? `<div class="mall-row">🏥 北医商城 · ${p.mall.name} <b>${p.mall.price}</b>
              <button class="btn-mall">去购买 ›</button></div>` : ''}
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
        updateBar();
      };
      $('#proj-list').appendChild(el);
    });
  }

  // ================= 视图3：信息 + 确认弹窗 =================
  function prefillForm() {
    $('#f-name').value = state.me.name || '';
    $('#f-phone').value = state.me.phone;
    $('#f-id').value = state.me.idCard || '';
  }
  const origSetStep = setStep;
  setStep = function (n) {
    origSetStep(n);
    if (n === 3) {
      prefillForm();
      const needId = state.projects.find(p => state.sel.has(p.id) && p.needId);
      $('#f-id-req').style.display = needId ? '' : 'none';
    }
  };

  function openConfirm() {
    const t = state.trips.find(x => x.id === state.tripId);
    const projs = state.projects.filter(p => state.sel.has(p.id));
    const rows = [
      ['班车', `${fmtDate(t.date)} ${t.time}`],
      ['集合点', t.meetup],
      ['姓名', $('#f-name').value.trim()],
      ['手机号', state.me.phone],
    ];
    if ($('#f-id').value.trim()) rows.push(['身份证', $('#f-id').value.trim().replace(/(\d{4})\d+(\d{4})/, '$1****$2')]);
    rows.push(['项目', projs.map(p => p.name).join('、')]);
    const fee = projs.reduce((s, p) => s + (p.price || 0), 0);
    if (fee) rows.push(['现场费用', `约 ¥${fee}（线下支付）`]);
    $('#cf-list').innerHTML = rows.map(r => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('');
    $('#confirm-modal').style.display = '';
  }
  $('#cf-no').onclick = () => $('#confirm-modal').style.display = 'none';
  $('#cf-yes').onclick = async () => {
    $('#confirm-modal').style.display = 'none';
    const btn = $('#btn-next');
    btn.disabled = true; btn.textContent = '提交中…';
    const res = await Api.reserve({
      tripId: state.tripId,
      projectIds: [...state.sel],
      name: $('#f-name').value.trim(),
      idCard: $('#f-id').value.trim().toUpperCase(),
    });
    btn.disabled = false; btn.textContent = '确认预约';
    if (!res.ok) return toast(res.msg);
    showSuccess();
  };

  // ================= 成功页 =================
  async function showSuccess() {
    const t = state.trips.find(x => x.id === state.tripId);
    const projs = state.projects.filter(p => state.sel.has(p.id));
    $('#sc-trip').innerHTML = `${fmtDate(t.date)} · ${t.time} 发车<small>集合点：${t.meetup}</small>`;
    $('#sc-items').innerHTML = projs.map(p => `
      <div class="sc-item">
        <div class="proj-group ${p.group === 'B' ? 'g-b' : p.group === 'C' ? 'g-c' : p.group === 'D' ? 'g-d' : ''}">${p.group}</div>
        <span>${p.name}</span>
        <span class="note">${p.note}</span>
      </div>`).join('');
    $('#sc-tips').innerHTML = `· 请提前 10 分钟到集合点找代理人签到上车<br>· 高峰项目现场排队，请听从医院引导<br>· ${projs.some(p => p.mall) ? '如需购买疗程卡，可在「我的预约」里跳转北医商城' : '祝您体验愉快'}`;
    state.successSnapshot = { trip: t, projs };
    state.sel.clear();
    showView('view-success');
    $('#tabbar').style.display = 'none';
  }
  $('#sc-mine').onclick = () => { showView('view-app'); $('#tabbar').style.display = ''; document.querySelector('[data-tab=mine]').click(); };
  $('#sc-home').onclick = () => { showView('view-app'); $('#tabbar').style.display = ''; document.querySelector('[data-tab=book]').click(); };

  // ================= 我的预约 =================
  async function loadMine() {
    $('#mine-list').innerHTML = '<div class="loader">加载中…</div>';
    state.mine = await Api.myReservations();
    if (!state.mine.length) {
      $('#mine-list').innerHTML = `
        <div class="mine-empty">
          <div class="big">🚌</div>
          <p>还没有预约记录<br>选择班车班期开始预约吧</p>
          <button class="btn-link" id="go-book">去预约 ›</button>
        </div>`;
      $('#go-book').onclick = () => document.querySelector('[data-tab=book]').click();
      return;
    }
    $('#mine-list').innerHTML = '';
    state.mine.forEach(m => {
      const el = document.createElement('div');
      el.className = 'card mine-card';
      const st = m.status === 'open' ? '<span class="badge-on">报名中</span>' : m.status === 'closed' ? '<span class="badge-off">班期已关闭</span>' : '<span class="badge-off">班期已删除</span>';
      el.innerHTML = `
        <div class="mc-head">
          <div class="mc-date">${fmtDate(m.trip.date)}</div>
          <div class="mc-pax">${m.trip.time} 发车 · ${m.items.length} 项</div>
          ${st}
        </div>
        <div class="trip-meta">${m.trip.meetup}</div>
        <div class="mc-items">${m.items.map(i => `
          <div style="display:flex;align-items:center;gap:8px;font-size:.85rem">
            <span style="width:5px;height:5px;border-radius:50%;background:var(--blue);flex:none"></span>
            <span>${i.name}</span>
          </div>`).join('')}</div>
        <div style="display:flex;justify-content:flex-end;margin-top:4px">
          <button class="btn-link">查看详情 ›</button>
        </div>`;
      el.querySelector('.btn-link').onclick = () => openDetail(m.tripId);
      $('#mine-list').appendChild(el);
    });
  }

  // ================= 详情页 =================
  function openDetail(tripId) {
    const m = state.mine.find(x => x.tripId === tripId);
    if (!m) return;
    state.detailTrip = tripId;
    $('#dp-trip').innerHTML = `${fmtDate(m.trip.date)} · ${m.trip.time} 发车<small>集合点：${m.trip.meetup}\n状态：${m.status === 'open' ? '报名中' : m.status === 'closed' ? '班期已关闭（已预约的仍可到院）' : '班期已删除'}</small>`;
    $('#dp-items').innerHTML = m.items.map(i => `
      <div class="dp-row"><div class="k">项目</div><div class="v">
        <b>${i.name}</b>
        <div style="font-size:.75rem;color:var(--ink-3);margin-top:2px">${i.note || ''}</div>
        ${i.mall ? `<div class="mall-row" style="margin-top:8px;padding-top:8px">🏥 北医商城 · ${i.mall.name} <b>${i.mall.price}</b>
          <button class="btn-mall">去购买 ›</button></div>` : ''}
      </div></div>`).join('');
    $('#dp-person').innerHTML = `
      <div class="dp-row"><div class="k">姓名</div><div class="v">${m.items[0].person}</div></div>
      <div class="dp-row"><div class="k">手机号</div><div class="v">${state.me.phone}</div></div>
      ${m.items[0].idCard ? `<div class="dp-row"><div class="k">身份证</div><div class="v">${m.items[0].idCard.replace(/(\d{4})\d+(\d{4})/, '$1****$2')}</div></div>` : ''}
      <div class="dp-row"><div class="k">提交时间</div><div class="v">${fmtTime(m.createdAt)}</div></div>`;
    $('#dp-items').querySelectorAll('.btn-mall').forEach(b => b.onclick = () => toast('演示环境：此处跳转北医商城小程序'));
    $('#dp-cancel').style.display = '';
    showView('view-detail');
  }
  $('#dp-back').onclick = () => { showView('view-app'); $('#tabbar').style.display = ''; document.querySelector('[data-tab=mine]').click(); };
  $('#dp-cancel').onclick = () => {
    const m = state.mine.find(x => x.tripId === state.detailTrip);
    $('#cc-text').textContent = `将取消 ${fmtDate(m.trip.date)} 班期的 ${m.items.length} 个项目预约，名额即时释放，确认取消？`;
    $('#cancel-modal').style.display = '';
  };
  $('#cc-no').onclick = () => $('#cancel-modal').style.display = 'none';
  $('#cc-yes').onclick = async () => {
    $('#cancel-modal').style.display = 'none';
    const m = state.mine.find(x => x.tripId === state.detailTrip);
    for (const it of m.items) await Api.cancelReservation(state.detailTrip, it.projectId);
    toast('已取消预约');
    showView('view-app');
    document.querySelector('[data-tab=mine]').click();
  };

  // ================= 启动 =================
  (async () => {
    await enterApp();
    loadTrips();
  })();
})();
