/* agent.js — 代理人端逻辑 */
(function () {
  const $ = s => document.querySelector(s);
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const fmtDate = ds => { const d = new Date(ds.replace(/-/g, '/')); return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`; };

  let toastTimer;
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  const AGENT_KEY = 'bybus_agent';

  // ===== 登录 =====
  $('#lg-btn').onclick = async () => {
    const res = await Api.agentLogin($('#lg-code').value.trim());
    if (!res.ok) return toast(res.msg);
    localStorage.setItem(AGENT_KEY, res.agent.id);
    enter(res.agent);
  };
  $('#lg-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lg-btn').click(); });

  $('#btn-logout').onclick = () => { localStorage.removeItem(AGENT_KEY); location.reload(); };

  function enter(agent) {
    $('#login-view').style.display = 'none';
    $('#work-view').style.display = '';
    $('#who-name').textContent = agent.name + ' · 工作台';
    loadAll();
  }

  async function loadAll() {
    const trips = await Api.listTrips();
    const details = await Promise.all(trips.map(t => Api.tripDetail(t.id)));
    const paxSet = new Set();
    let resvCount = 0;
    details.forEach(d => {
      d.pax.forEach(p => paxSet.add(p.phone));
      d.stats.forEach(s => resvCount += s.taken);
    });
    $('#st-trips').textContent = trips.length;
    $('#st-pax').textContent = paxSet.size;
    $('#st-resv').textContent = resvCount;

    $('#ag-trips').innerHTML = '';
    const sorted = [...trips].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(t => {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `
        <div class="stat-row">
          <div>
            <div class="trip-date"><b>${fmtDate(t.date)}</b><span>${t.time}</span></div>
            <div class="trip-meta">${t.meetup} · 已约 ${t.takenSeats}/${t.seats} 人</div>
          </div>
          <span class="${t.status === 'open' ? 'badge-on' : 'badge-off'}">${t.status === 'open' ? '报名中' : '已关闭'}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="mini-btn" data-act="detail">查看名单</button>
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

  // ===== 新建班期 =====
  $('#nt-btn').onclick = async () => {
    const date = $('#nt-date').value;
    if (!date) return toast('请选择日期');
    const res = await Api.createTrip({ date, time: $('#nt-time').value, meetup: $('#nt-meetup').value });
    if (!res.ok) return toast(res.msg);
    toast('班期已创建');
    $('#nt-date').value = '';
    loadAll();
  };

  // ===== 班期详情 =====
  async function openDetail(tripId) {
    const d = await Api.tripDetail(tripId);
    if (!d) return;
    $('#dm-title').textContent = `${fmtDate(d.trip.date)} ${d.trip.time}`;
    $('#dm-sub').textContent = `${d.trip.meetup} · ${d.trip.status === 'open' ? '报名中' : '已关闭'} · ${d.pax.length}/${d.trip.seats} 人`;
    $('#dm-stats').innerHTML = d.stats.map(s => {
      const pct = Math.min(100, Math.round(s.taken / s.quota * 100));
      return `<div style="margin-bottom:8px">
        <div class="quota-text"><span>${s.name}</span><span>${s.taken}/${s.quota}</span></div>
        <div class="quota-bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
    $('#dm-pax').innerHTML = d.pax.length
      ? `<table class="pax"><tr><th>姓名</th><th>手机号</th><th>项目</th></tr>` +
        d.pax.map(p => `<tr class="pax-row"><td>${p.name}</td><td>${p.phone}</td>
          <td style="font-size:.72rem">${p.projectNames.map(n => n.split(' · ')[0]).join('、')}</td></tr>`).join('') + '</table>'
      : '<div class="empty">暂无乘客</div>';
    $('#detail-modal').style.display = '';
  }
  $('#dm-close').onclick = () => { $('#detail-modal').style.display = 'none'; };
  $('#detail-modal').addEventListener('click', e => { if (e.target.id === 'detail-modal') e.target.style.display = 'none'; });

  // 自动登录
  (async () => {
    const saved = localStorage.getItem(AGENT_KEY);
    if (saved) {
      // 模拟环境直接放行（真实后端应校验 token）
      enter({ id: saved, name: '王代理' });
    } else {
      $('#lg-code').value = '';
    }
  })();
})();
