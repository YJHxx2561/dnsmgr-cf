/* dnsmgr Cloudflare Edition - 自包含现代化 SPA（零外部依赖） */
(function () {
  'use strict';

  let currentUser = null;
  let preToken = '';
  let META = { dns: {}, cert: {}, deploy: {}, lineName: {}, recordTypeSupport: {} };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 通用工具 ---------------- */
  async function api(path, data = {}, method = 'POST') {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (method === 'GET') {
      const qs = new URLSearchParams(data).toString();
      if (qs) path += (path.includes('?') ? '&' : '?') + qs;
    } else {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(data);
    }
    const resp = await fetch(path, opt);
    const ct = resp.headers.get('Content-Type') || '';
    if (resp.status === 401) { location.href = '/login'; return {}; }
    return ct.includes('application/json') ? resp.json() : resp.text();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toast(msg, type = 'info', ms = 2800) {
    const box = $('#toast-box');
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'success' ? 'ok' : type === 'error' ? 'err' : type === 'warning' ? 'warn' : '');
    const icon = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';
    el.innerHTML = `<span class="ic">${icon}</span><span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 200); }, ms);
  }

  function confirmBox(msg) { return window.confirm(msg); }

  /* ---------------- 动态表单引擎 ----------------
   * schema: { field: {name,type,required,placeholder,options,value,show,note} }
   * config: 当前值对象
   * 支持 input/textarea/select/radio/checkboxes
   */
  function fieldVisible(rule, config) {
    if (!rule) return true;
    try { return new Function('c', 'with(c){return (' + rule + ')}')(config) ? true : false; }
    catch (e) { return true; }
  }

  function fieldControl(key, f, value) {
    const id = 'f_' + key;
    if (f.type === 'textarea') {
      return `<textarea class="input" id="${id}" data-key="${key}" rows="3" style="height:auto;padding:10px" placeholder="${esc(f.placeholder || '')}">${esc(value ?? '')}</textarea>`;
    }
    if (f.type === 'select') {
      const opts = normalizeOptions(f.options).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value ?? f.value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
      return `<select class="input" id="${id}" data-key="${key}">${opts}</select>`;
    }
    if (f.type === 'radio') {
      const opts = normalizeOptions(f.options).map((o) => `<label class="radio-opt"><input type="radio" name="r_${key}" value="${esc(o.value)}" data-key="${key}"${String(o.value) === String(value ?? f.value ?? '') ? ' checked' : ''}> ${esc(o.label)}</label>`).join('');
      return `<div class="radio-group">${opts}</div>`;
    }
    if (f.type === 'checkbox' || f.type === 'checkboxes') {
      const arr = Array.isArray(value) ? value : String(value ?? '').split(',');
      const opts = normalizeOptions(f.options).map((o) => `<label class="radio-opt"><input type="checkbox" name="c_${key}" value="${esc(o.value)}" data-key="${key}" data-multi="1"${arr.includes(String(o.value)) ? ' checked' : ''}> ${esc(o.label)}</label>`).join('');
      return `<div class="radio-group">${opts}</div>`;
    }
    return `<input class="input" type="${f.type === 'password' ? 'password' : 'text'}" id="${id}" data-key="${key}" value="${esc(value ?? f.value ?? '')}" placeholder="${esc(f.placeholder || '')}">`;
  }

  function normalizeOptions(o) {
    if (!o) return [];
    if (Array.isArray(o)) return o.map((x) => (typeof x === 'object' ? { value: x.value, label: x.label } : { value: x, label: x }));
    return Object.entries(o).map(([k, v]) => ({ value: k, label: v }));
  }

  /** 渲染动态字段到容器，返回读取配置的函数 */
  function renderDynamic(container, schema, config) {
    let html = '';
    for (const [key, f] of Object.entries(schema || {})) {
      const vis = fieldVisible(f.show, config);
      html += `<div class="field" data-field="${esc(key)}" style="${vis ? '' : 'display:none'}">
        <label>${esc(f.name || key)}${f.required ? ' <span style="color:#ef4444">*</span>' : ''}</label>
        ${fieldControl(key, f, config[key])}
        ${f.note ? `<div class="hint">${f.note}</div>` : ''}
      </div>`;
    }
    container.innerHTML = html || '<div class="hint">该类型无需额外配置。</div>';

    // 联动显隐：任一字段变化时重新计算 show
    function refreshVisibility() {
      const cfg = readDynamic(container);
      Object.entries(schema || {}).forEach(([key, f]) => {
        const el = container.querySelector(`[data-field="${key}"]`);
        if (el) el.style.display = fieldVisible(f.show, cfg) ? '' : 'none';
      });
    }
    container.addEventListener('change', refreshVisibility);
    container.addEventListener('input', refreshVisibility);
    return readDynamic;
  }

  function readDynamic(container) {
    const out = {};
    $$('[data-key]', container).forEach((el) => {
      const key = el.dataset.key;
      if (el.type === 'radio') { if (el.checked) out[key] = el.value; return; }
      if (el.type === 'checkbox') { if (el.checked) { (out[key] = out[key] || []).push(el.value); } else if (!out[key]) out[key] = []; return; }
      out[key] = el.value;
    });
    // checkboxes 转成逗号串（与原系统一致）
    Object.keys(out).forEach((k) => { if (Array.isArray(out[k])) out[k] = out[k].join(','); });
    return out;
  }

  /* ---------------- 模态框 ---------------- */
  let modalSaveHandler = null;
  function openModal(title, bodyHtml, onSave, opts = {}) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    modalSaveHandler = onSave;
    $('#modal-save').textContent = opts.saveText || '保存';
    $('#modal-mask').style.display = 'flex';
  }
  function closeModal() { $('#modal-mask').style.display = 'none'; modalSaveHandler = null; }
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-mask').addEventListener('click', (e) => { if (e.target.id === 'modal-mask') closeModal(); });
  $('#modal-save').addEventListener('click', async () => {
    if (!modalSaveHandler) return;
    const btn = $('#modal-save'); btn.disabled = true;
    try { await modalSaveHandler(); }
    finally { btn.disabled = false; }
  });

  /** 简单字段表单（非动态 schema） */
  function simpleForm(fields, values = {}) {
    return fields.map((f) => {
      let control;
      if (f.type === 'select') {
        control = `<select class="input" name="${esc(f.name)}">${(f.options || []).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(values[f.name] ?? f.value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      } else if (f.type === 'textarea') {
        control = `<textarea class="input" name="${esc(f.name)}" rows="4" style="height:auto;padding:10px" placeholder="${esc(f.placeholder || '')}">${esc(values[f.name] ?? f.value ?? '')}</textarea>`;
      } else {
        control = `<input class="input" type="${f.type || 'text'}" name="${esc(f.name)}" value="${esc(values[f.name] ?? f.value ?? '')}" placeholder="${esc(f.placeholder || '')}">`;
      }
      return `<div class="field"><label>${esc(f.label)}${f.required ? ' <span style="color:#ef4444">*</span>' : ''}</label>${control}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`;
    }).join('');
  }
  function readSimpleForm() {
    const data = {};
    $$('#modal-body [name]').forEach((el) => { data[el.name] = el.value; });
    return data;
  }

  /* ---------------- 登录 ---------------- */
  function refreshCaptcha() { $('#vcode-img').src = '/verifycode?t=' + Date.now(); }
  $('#vcode-img').addEventListener('click', refreshCaptcha);
  $('#logout-btn').addEventListener('click', async () => { await api('/logout', {}, 'GET'); location.href = '/login'; });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#login-msg'); msg.textContent = ''; msg.className = 'msg';
    const btn = $('#login-btn'); btn.disabled = true;
    try {
      const isTotp = preToken && $('#totp-group').style.display !== 'none';
      let res;
      if (isTotp) res = await api('/auth/totp', { pre_token: preToken, code: $('#totp-code').value });
      else res = await api('/login', { username: $('#login-username').value.trim(), password: $('#login-password').value, code: $('#login-code').value.trim() });
      if (res.code === 0) await showApp();
      else if (res.vcode === 2) {
        preToken = res.pre_token || '';
        $('#totp-group').style.display = ''; $('#vcode-group').style.display = 'none';
        msg.className = 'msg info'; msg.textContent = res.msg || '请输入动态口令';
      } else {
        msg.className = 'msg err'; msg.textContent = res.msg || '登录失败';
        if (res.vcode === 1) refreshCaptcha();
      }
    } catch (err) { msg.className = 'msg err'; msg.textContent = '网络错误：' + err.message; }
    finally { btn.disabled = false; }
  });

  async function checkLogin() {
    try {
      const st = await api('/install/check', {}, 'GET');
      if (st && st.installed === false) { location.href = '/install'; return; }
    } catch (e) {}
    const res = await api('/api/status', {}, 'GET');
    if (res.code === 0) { currentUser = res.data; await showApp(); }
    else { $('#login-page').style.display = 'flex'; $('#app').style.display = 'none'; refreshCaptcha(); }
  }

  async function showApp() {
    $('#login-page').style.display = 'none';
    $('#app').style.display = 'block';
    $('#user-name').textContent = currentUser?.username || '用户';
    $('#user-avatar').textContent = (currentUser?.username || 'U').charAt(0).toUpperCase();
    // 加载动态表单元数据
    try { const m = await api('/meta/all', {}, 'GET'); if (m.code === 0) META = m.data; } catch (e) {}
    buildMenu();
    navigate('dashboard');
  }

  /* ---------------- 菜单与导航 ---------------- */
  const MENU = [
    { group: '概览', items: [{ key: 'dashboard', name: '仪表盘', icon: '▦' }] },
    { group: '域名管理', items: [
      { key: 'domain', name: '域名列表', icon: '🌐' },
      { key: 'account', name: '域名账户', icon: '☁' },
      { key: 'category', name: '域名分类', icon: '🏷' },
    ]},
    { group: '解析管理', items: [{ key: 'record_search', name: '解析记录查询', icon: '🔍' }] },
    { group: '容灾与定时', items: [
      { key: 'dmonitor', name: '容灾切换', icon: '💓' },
      { key: 'schedule', name: '定时切换', icon: '🕐' },
      { key: 'optimizeip', name: 'CF优选IP', icon: '⚡' },
    ]},
    { group: 'SSL证书', items: [
      { key: 'certorder', name: '证书订单', icon: '🔐' },
      { key: 'certaccount', name: '证书账户', icon: '🔑' },
      { key: 'deployaccount', name: '部署账户', icon: '📦' },
      { key: 'deploytask', name: '部署任务', icon: '📤' },
      { key: 'certcname', name: 'CNAME验证', icon: '🔗' },
    ]},
    { group: '系统', items: [
      { key: 'backup', name: '备份恢复', icon: '💾', admin: true },
      { key: 'user', name: '用户管理', icon: '👥', admin: true },
      { key: 'notice', name: '通知设置', icon: '🔔', admin: true },
      { key: 'cron', name: '定时任务', icon: '🔄', admin: true },
      { key: 'log', name: '操作日志', icon: '📋' },
    ]},
  ];

  let MENU_MAP = {};
  function buildMenu() {
    const nav = $('#sidebar-menu');
    let html = '';
    for (const g of MENU) {
      html += `<div class="nav-group"><div class="nav-group-title">${esc(g.group)}</div>`;
      for (const item of g.items) {
        if (item.admin && currentUser?.level !== 2) continue;
        html += `<div class="nav-item" data-nav="${esc(item.key)}"><span class="ico">${item.icon}</span><span>${esc(item.name)}</span></div>`;
        MENU_MAP[item.key] = item.name;
      }
      html += '</div>';
    }
    nav.innerHTML = html;
    nav.onclick = (e) => {
      const el = e.target.closest('[data-nav]');
      if (el) navigate(el.dataset.nav);
    };
  }

  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  async function navigate(page) {
    $$('.nav-item').forEach((el) => el.classList.remove('active'));
    const item = $(`[data-nav="${page}"]`);
    if (item) item.classList.add('active');
    const title = MENU_MAP[page] || '控制台';
    $('#page-title').textContent = title;
    $('#crumb-title').textContent = title;
    $('#sidebar').classList.remove('open');
    const main = $('#main-content');
    main.innerHTML = '<div class="loader">加载中...</div>';
    try {
      if (typeof PAGES[page] === 'function') await PAGES[page](main);
      else main.innerHTML = `<div class="card"><div class="hint">页面「${esc(title)}」暂未实现。</div></div>`;
    } catch (e) { main.innerHTML = `<div class="card"><div class="msg err">加载失败：${esc(e.message)}</div></div>`; }
  }

  /* ---------------- 表格 ---------------- */
  function table(cols, id) {
    return `<div class="table-wrap"><table class="tbl" id="${id || 'tbl'}"><thead><tr>${cols.map((c) => `<th>${esc(c.title)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
  }
  async function fillTable(id, url, cols, extra = {}) {
    const res = await api(url, { offset: 0, limit: 200, ...extra });
    const rows = res.rows || (Array.isArray(res) ? res : []);
    const tbody = $(`#${id} tbody`);
    if (!tbody) return rows;
    if (!rows.length) { tbody.innerHTML = `<tr><td class="empty" colspan="${cols.length}">暂无数据</td></tr>`; return rows; }
    tbody.innerHTML = rows.map((row) => '<tr>' + cols.map((c) => `<td>${c.render ? c.render(row) : esc(row[c.field] ?? '')}</td>`).join('') + '</tr>').join('');
    return rows;
  }
  const editBtn = (fn, id) => `<button class="btn btn-info btn-sm" onclick="app.${fn}(${id})">编辑</button>`;
  const delBtn = (fn, id) => `<button class="btn btn-danger btn-sm" onclick="app.${fn}(${id})">删除</button>`;
  function statusBtn(fn, id, active) { return `<button class="btn ${active ? 'btn-warning' : 'btn-success'} btn-sm" onclick="app.${fn}(${id},${active ? 0 : 1})">${active ? '停用' : '启用'}</button>`; }
  function addBtn(fn, label = '添加') { return `<div class="card-tools"><button class="btn btn-success btn-sm" onclick="app.${fn}()">＋ ${label}</button></div>`; }

  /** 取域名下拉选项 */
  async function domainOptions() {
    const r = await api('/domain/data', { offset: 0, limit: 500 });
    return (r.rows || []).map((d) => ({ value: d.id, label: d.name }));
  }
  /** 取记录下拉选项（按域名） */
  async function recordOptions(did) {
    if (!did) return [];
    const r = await api('/record/data/' + did, { offset: 0, limit: 200 });
    const rows = r.rows || (Array.isArray(r) ? r : []);
    return rows.map((rec) => ({ value: rec.RecordId, label: `${rec.Name} [${rec.Type}] ${rec.Value}` }));
  }

  /* ---------------- 页面定义 ---------------- */
  const PAGES = {};

  PAGES.dashboard = async (el) => {
    const res = await api('/index/dashboard', {}, 'GET');
    const d = res.data || {};
    el.innerHTML = `
      <div class="stats">
        <div class="stat indigo"><div class="ic">🌐</div><div><div class="num">${d.domain_count || 0}</div><div class="lbl">域名数量</div></div></div>
        <div class="stat green"><div class="ic">☁</div><div><div class="num">${d.account_count || 0}</div><div class="lbl">域名账户</div></div></div>
        <div class="stat orange"><div class="ic">📝</div><div><div class="num">${d.record_count || 0}</div><div class="lbl">解析记录</div></div></div>
        <div class="stat rose"><div class="ic">⚙</div><div><div class="num">${esc(d.version || '-')}</div><div class="lbl">系统版本</div></div></div>
      </div>
      <div class="card"><div class="card-head"><div class="card-title"><span class="ico">ℹ</span> 系统信息</div></div>
        <div class="form-grid">
          <div><div class="hint">运行平台</div><div style="font-weight:600;margin-top:4px">${esc(d.platform || 'Cloudflare Workers')}</div></div>
          <div><div class="hint">数据库</div><div style="font-weight:600;margin-top:4px">${esc(d.db_type || 'D1 (SQLite)')}</div></div>
        </div>
        <div class="notice" style="margin-top:18px">定时任务由 Cloudflare Cron Trigger 每分钟自动触发，也可访问 <code>/cron?key=密钥</code> 手动触发。</div>
      </div>`;
  };

  /* ===== 域名 ===== */
  PAGES.domain = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'name', title: '域名' },
      { field: 'typename', title: '平台', render: (r) => `<span class="badge blue">${esc(r.typename || r.type || '-')}</span>` },
      { field: 'recordcount', title: '记录数' }, { field: 'expiretime', title: '到期时间' },
      { field: 'remark', title: '备注' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions"><button class="btn btn-info btn-sm" onclick="app.viewRecords(${r.id})">解析</button>${editBtn('editDomain', r.id)}${delBtn('delDomain', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title"><span class="ico">🌐</span> 域名列表</div>${addBtn('addDomain', '添加域名')}</div>${table(cols, 'tbl-domain')}</div>`;
    await fillTable('tbl-domain', '/domain/data', cols);
  };

  /* ===== 域名账户（按平台动态字段） ===== */
  PAGES.account = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' },
      { field: 'name', title: '名称', render: (r) => `${r.icon ? `<img src="/static/images/${esc(r.icon)}" style="width:18px;height:18px;vertical-align:middle;margin-right:6px">` : ''}${esc(r.name)}` },
      { field: 'typename', title: '类型', render: (r) => `<span class="badge blue">${esc(r.typename || '-')}</span>` },
      { field: 'remark', title: '备注' }, { field: 'addtime', title: '添加时间' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editAccount', r.id)}${delBtn('delAccount', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title"><span class="ico">☁</span> 域名账户</div>${addBtn('editAccount', '添加账户')}</div>${table(cols, 'tbl-account')}</div>`;
    await fillTable('tbl-account', '/account/data', cols);
  };

  /* ===== 域名分类 ===== */
  PAGES.category = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'name', title: '分类名' },
      { field: 'remark', title: '备注' }, { field: 'sort', title: '排序' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editCategory', r.id)}${delBtn('delCategory', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">🏷 域名分类</div>${addBtn('editCategory', '添加分类')}</div>${table(cols, 'tbl-category')}</div>`;
    await fillTable('tbl-category', '/domain/category/data', cols);
  };

  /* ===== 解析记录查询 ===== */
  PAGES.record_search = async (el) => {
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">🔍 解析记录查询</div></div>
      <div class="input-group" style="max-width:620px;margin-bottom:18px">
        <select class="input" id="rs-domain" style="flex:1"></select>
        <input class="input" id="rs-kw" placeholder="关键字（可选）" style="flex:1">
        <button class="btn btn-primary" id="rs-search">查询</button>
      </div><div id="rs-result"></div></div>`;
    const domains = await domainOptions();
    $('#rs-domain').innerHTML = domains.map((d) => `<option value="${d.value}">${esc(d.label)}</option>`).join('') || '<option value="">暂无域名</option>';
    $('#rs-search').addEventListener('click', async () => {
      const id = $('#rs-domain').value;
      if (!id) { toast('请先添加一个域名', 'warning'); return; }
      const res = await api('/record/data/' + id, { keyword: $('#rs-kw').value.trim(), offset: 0, limit: 200 });
      const rows = res.rows || (Array.isArray(res) ? res : []);
      const cols = ['Name', 'Type', 'Value', 'Line', 'TTL', 'Status'];
      $('#rs-result').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
        (rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(Array.isArray(r[c]) ? r[c].join(',') : r[c] ?? '')}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${cols.length}">暂无解析记录</td></tr>`) + '</tbody></table></div>';
      toast(`查询到 ${rows.length} 条记录`, 'success');
    });
    // 支持从域名列表跳转时自动选中并查询
    if (window.__pendingRecordDomain) {
      $('#rs-domain').value = window.__pendingRecordDomain;
      window.__pendingRecordDomain = null;
      $('#rs-search').click();
    }
  };

  /* ===== 容灾切换 ===== */
  PAGES.dmonitor = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
      { field: 'main_value', title: '主记录' }, { field: 'backup_value', title: '备用记录' },
      { field: 'checktype', title: '检测', render: (r) => `<span class="badge gray">${['PING', 'TCP', 'HTTP'][r.checktype] ?? 'HTTP'}</span>` },
      { field: 'status', title: '状态', render: (r) => r.status == 1 ? '<span class="badge red">已切换</span>' : '<span class="badge green">正常</span>' },
      { field: 'active', title: '启用', render: (r) => r.active == 1 ? '<span class="badge green">是</span>' : '<span class="badge gray">否</span>' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editDmonitor', r.id)}${statusBtn('toggleDmonitor', r.id, r.active)}${delBtn('delDmonitor', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">💓 容灾切换</div>${addBtn('editDmonitor', '添加策略')}</div>${table(cols, 'tbl-dm')}</div>`;
    await fillTable('tbl-dm', '/dmonitor/task/data', cols);
  };

  /* ===== 定时切换 ===== */
  PAGES.schedule = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
      { field: 'switchtype', title: '切换类型', render: (r) => `<span class="badge blue">${['修改解析', '启用解析', '暂停解析', '删除解析'][r.switchtype] ?? r.switchtype}</span>` },
      { field: 'value', title: '目标值' }, { field: 'switchtime', title: '执行时间' },
      { field: 'active', title: '启用', render: (r) => r.active == 1 ? '<span class="badge green">是</span>' : '<span class="badge gray">否</span>' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editSchedule', r.id)}${statusBtn('toggleSchedule', r.id, r.active)}${delBtn('delSchedule', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">🕐 定时切换</div>${addBtn('editSchedule', '添加任务')}</div>${table(cols, 'tbl-sc')}</div>`;
    await fillTable('tbl-sc', '/schedule/stask/data', cols);
  };

  /* ===== 优选IP ===== */
  PAGES.optimizeip = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
      { field: 'ip_type', title: 'IP类型' }, { field: 'recordnum', title: '记录数' },
      { field: 'status', title: '状态' },
      { field: 'active', title: '启用', render: (r) => r.active == 1 ? '<span class="badge green">是</span>' : '<span class="badge gray">否</span>' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editOptimizeip', r.id)}${statusBtn('toggleOptimizeip', r.id, r.active)}<button class="btn btn-warning btn-sm" onclick="app.runOptimizeip(${r.id})">执行</button>${delBtn('delOptimizeip', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">⚡ CF优选IP</div>${addBtn('editOptimizeip', '添加任务')}</div>${table(cols, 'tbl-op')}</div>`;
    await fillTable('tbl-op', '/optimizeip/opiplist/data', cols);
  };

  /* ===== 证书订单 ===== */
  PAGES.certorder = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'aid', title: '账户ID' },
      { field: 'status', title: '状态' }, { field: 'issuer', title: '颁发者' },
      { field: 'expiretime', title: '到期时间' }, { field: 'error', title: '错误' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editCertOrder', r.id)}${delBtn('delCertOrder', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">🔐 证书订单</div>${addBtn('editCertOrder', '申请证书')}</div>${table(cols, 'tbl-co')}</div>`;
    await fillTable('tbl-co', '/cert/order/data', cols);
  };

  /* ===== 证书账户（CA 类型动态字段） ===== */
  PAGES.certaccount = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'name', title: '名称' },
      { field: 'type', title: '类型', render: (r) => `<span class="badge blue">${esc(META.cert?.[r.type]?.name || r.type)}</span>` },
      { field: 'remark', title: '备注' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editCertAccount', r.id)}${delBtn('delCertAccount', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">🔑 证书账户（ACME/云CA）</div>${addBtn('editCertAccount', '添加账户')}</div>${table(cols, 'tbl-ca')}</div>`;
    await fillTable('tbl-ca', '/cert/account/data', cols, { deploy: 0 });
  };

  /* ===== 部署账户（部署目标动态字段） ===== */
  PAGES.deployaccount = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'name', title: '名称' },
      { field: 'type', title: '部署方式', render: (r) => `<span class="badge blue">${esc(META.deploy?.[r.type]?.name || r.type)}</span>` },
      { field: 'remark', title: '备注' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editDeployAccount', r.id)}${delBtn('delDeployAccount', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">📦 部署账户</div>${addBtn('editDeployAccount', '添加账户')}</div>${table(cols, 'tbl-dpa')}</div>`;
    await fillTable('tbl-dpa', '/cert/account/data', cols, { deploy: 1 });
  };

  /* ===== 部署任务 ===== */
  PAGES.deploytask = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'aid', title: '部署账户' }, { field: 'oid', title: '证书订单' },
      { field: 'status', title: '状态' },
      { field: 'active', title: '启用', render: (r) => r.active == 1 ? '<span class="badge green">是</span>' : '<span class="badge gray">否</span>' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editDeployTask', r.id)}${statusBtn('toggleDeployTask', r.id, r.active)}${delBtn('delDeployTask', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">📤 部署任务</div>${addBtn('editDeployTask', '添加任务')}</div>${table(cols, 'tbl-dpt')}</div>`;
    await fillTable('tbl-dpt', '/cert/deploy/data', cols);
  };

  /* ===== CNAME 验证 ===== */
  PAGES.certcname = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'domain', title: '被代理域名' },
      { field: 'rr', title: 'CNAME记录值' }, { field: 'did', title: '域名ID' },
      { field: 'status', title: '状态', render: (r) => r.status == 1 ? '<span class="badge green">已验证</span>' : '<span class="badge orange">待验证</span>' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editCname', r.id)}${delBtn('delCname', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">🔗 CNAME验证</div>${addBtn('editCname', '添加')}</div>${table(cols, 'tbl-cn')}</div>`;
    await fillTable('tbl-cn', '/cert/cname/data', cols);
  };

  /* ===== 用户 / 日志 ===== */
  PAGES.user = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'username', title: '用户名' },
      { field: 'level', title: '等级', render: (r) => `<span class="badge ${r.level == 2 ? 'blue' : 'gray'}">${['普通', '成员', '管理员'][r.level] ?? r.level}</span>` },
      { field: 'is_api', title: 'API', render: (r) => r.is_api == 1 ? '<span class="badge green">开启</span>' : '<span class="badge gray">关闭</span>' },
      { field: 'status', title: '状态', render: (r) => r.status == 1 ? '<span class="badge green">正常</span>' : '<span class="badge red">封禁</span>' },
      { field: 'lasttime', title: '最后登录' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editUser', r.id)}${statusBtn('toggleUser', r.id, r.status)}${delBtn('delUser', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">👥 用户管理</div>${addBtn('editUser', '添加用户')}</div>${table(cols, 'tbl-user')}</div>`;
    await fillTable('tbl-user', '/user/data', cols);
  };
  PAGES.log = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' }, { field: 'uid', title: '用户ID' },
      { field: 'action', title: '操作' }, { field: 'domain', title: '域名' },
      { field: 'data', title: '详情' }, { field: 'addtime', title: '时间' },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">📋 操作日志</div></div>${table(cols, 'tbl-log')}</div>`;
    await fillTable('tbl-log', '/log/data', cols);
  };

  /* ===== 系统设置 ===== */
  async function settingsPage(el, title, keys) {
    const res = await api('/system/configs', {}, 'GET');
    const cfg = res.data || {};
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">${esc(title)}</div></div>
      <form id="settings-form"><div class="form-grid">
      ${keys.map((k) => `<div class="field"><label>${esc(k)}</label><input class="input" name="${esc(k)}" value="${esc(cfg[k] ?? '')}"></div>`).join('')}
      </div><div class="form-actions"><button class="btn btn-primary" type="submit">保存设置</button></div></form></div>`;
    $('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {}; $$('#settings-form [name]').forEach((input) => { data[input.name] = input.value; });
      const r = await api('/system/set', data);
      toast(r.msg || (r.code === 0 ? '保存成功' : '保存失败'), r.code === 0 ? 'success' : 'error');
    });
  }
  PAGES.notice = (el) => settingsPage(el, '通知设置', ['notice_mail', 'mail_type', 'mail_smtp', 'mail_port', 'mail_name', 'mail_pwd', 'mail_apiuser', 'mail_apikey', 'mail_recv', 'webhook_url', 'tgbot_token', 'tgbot_chatid', 'custom_webhook_url', 'wechat_apptoken', 'wechat_appuid']);
  PAGES.cron = (el) => settingsPage(el, '定时任务设置', ['cron_type', 'cron_key']);

  PAGES.backup = async (el) => {
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">💾 数据库备份与恢复</div></div>
      <div class="notice">导出当前 D1 数据库的全部数据（SQLite 格式）。导入支持本系统备份及历史 MySQL mysqldump 文件，会自动转换格式。</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:20px">
        <button class="btn btn-primary" id="backup-export">⬇ 导出备份</button></div>
      <hr style="border:none;border-top:1px solid var(--line);margin:20px 0">
      <div class="field" style="max-width:520px"><label>选择备份文件 (.sql)</label><input class="input" type="file" id="backup-file" accept=".sql"></div>
      <div class="form-actions"><button class="btn btn-warning" id="backup-import">⬆ 导入恢复</button></div>
      <div id="backup-msg" style="margin-top:16px"></div></div>`;
    $('#backup-export').addEventListener('click', () => { window.location = '/system/backup/export'; });
    $('#backup-import').addEventListener('click', async () => {
      const f = $('#backup-file').files[0];
      if (!f) { toast('请选择备份文件', 'warning'); return; }
      const msg = $('#backup-msg'); msg.innerHTML = '<div class="hint">正在恢复，请稍候...</div>';
      try {
        const r = await api('/system/backup/import', { sql: await f.text() });
        const detail = r.data?.errors?.length ? `<div class="hint">${r.data.errors.map(esc).join('<br>')}</div>` : '';
        msg.innerHTML = `<div class="notice">${esc(r.msg || '恢复完成')}</div>${detail}`;
        toast(r.msg || '恢复完成', r.code === 0 ? 'success' : 'warning');
      } catch (e) { msg.innerHTML = `<div class="msg err">恢复失败：${esc(e.message)}</div>`; }
    });
  };

  /* ================= 全局操作：添加/编辑弹窗 ================= */
  window.app = {
    logout: async () => { await api('/logout', {}, 'GET'); location.href = '/login'; },

    /* ---- 域名 ---- */
    addDomain: async () => {
      const accounts = (await api('/account/data', { offset: 0, limit: 500 })).rows || [];
      if (!accounts.length) { toast('请先添加域名账户', 'warning'); return; }
      openModal('添加域名', simpleForm([
        { name: 'aid', label: '域名账户', type: 'select', options: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.typename || a.type})` })) },
        { name: 'name', label: '域名', placeholder: 'example.com', required: true },
        { name: 'thirdid', label: '平台域名ID', placeholder: '手动录入时填写' },
        { name: 'method', label: '添加方式', type: 'select', options: [{ value: '0', label: '手动录入已有域名' }, { value: '1', label: '通过API新建域名' }] },
      ]), async () => {
        const d = readSimpleForm();
        const r = await api('/domain/op', { act: 'add', ...d });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('domain');
      });
    },
    editDomain: async (id) => {
      const r = await api('/domain/data', { id, offset: 0, limit: 1 });
      const info = (r.rows || [])[0] || {};
      openModal('域名配置', simpleForm([
        { name: 'remark', label: '备注', value: info.remark },
        { name: 'expiretime', label: '到期时间', value: info.expiretime, placeholder: '2027-01-01 00:00:00' },
        { name: 'is_hide', label: '隐藏 (0否/1是)', value: info.is_hide ?? 0 },
        { name: 'is_sso', label: '快捷登录 (0否/1是)', value: info.is_sso ?? 0 },
        { name: 'is_notice', label: '到期提醒 (0否/1是)', value: info.is_notice ?? 0 },
        { name: 'cid', label: '分类ID', value: info.cid ?? 0 },
      ], info), async () => {
        const r2 = await api('/domain/op', { act: 'edit', id, ...readSimpleForm() });
        toast(r2.msg || '操作完成', r2.code === 0 ? 'success' : 'error'); closeModal(); navigate('domain');
      });
    },
    delDomain: async (id) => { if (!confirmBox('确定删除该域名？关联任务也会删除。')) return; const r = await api('/domain/op', { act: 'del', id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('domain'); },
    viewRecords: (id) => { window.__pendingRecordDomain = id; navigate('record_search'); },

    /* ---- 域名账户：按平台动态字段 ---- */
    editAccount: async (id) => {
      let info = {};
      if (id) { const r = await api('/account/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const types = META.dns || {};
      const typeKeys = Object.keys(types);
      const curType = info.type || typeKeys[0] || 'aliyun';
      let config = {};
      try { config = typeof info.config === 'string' ? JSON.parse(info.config || '{}') : (info.config || {}); } catch (e) {}

      const html = `<div class="field"><label>平台类型 <span style="color:#ef4444">*</span></label>
          <select class="input" id="ac-type">${typeKeys.map((k) => `<option value="${k}"${k === curType ? ' selected' : ''}>${esc(types[k]?.name || k)}</option>`).join('')}</select></div>
        <div class="field"><label>账户名称 <span style="color:#ef4444">*</span></label><input class="input" id="ac-name" value="${esc(info.name || '')}" placeholder="留空自动取第一个配置项"></div>
        <div id="ac-dynamic"></div>
        <div class="field"><label>备注</label><input class="input" id="ac-remark" value="${esc(info.remark || '')}"></div>
        <div class="field"><label class="radio-opt"><input type="checkbox" id="ac-skip"> 跳过密钥验证（网络受限或确认配置无误时勾选）</label></div>`;
      openModal(id ? '编辑域名账户' : '添加域名账户', html, async () => {
        const cfg = readDynamic($('#ac-dynamic'));
        const name = $('#ac-name').value.trim() || Object.values(cfg)[0] || '';
        const body = { act: id ? 'edit' : 'add', id, type: $('#ac-type').value, name, config: JSON.stringify(cfg), remark: $('#ac-remark').value, skipCheck: $('#ac-skip').checked ? '1' : '0' };
        const r = await api('/account/' + (id ? 'edit' : 'add'), body);
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('account');
      });
      const dyn = $('#ac-dynamic');
      let readCfg = renderDynamic(dyn, types[curType]?.fields || {}, config);
      $('#ac-type').addEventListener('change', (e) => {
        const t = e.target.value;
        // 切换平台时保留同名配置项的值
        const current = readCfg();
        const merged = {};
        Object.keys(types[t]?.fields || {}).forEach((k) => { merged[k] = current[k] ?? ''; });
        readCfg = renderDynamic(dyn, types[t]?.fields || {}, merged);
      });
    },
    delAccount: async (id) => { if (!confirmBox('确定删除该账户？')) return; const r = await api('/account/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('account'); },

    /* ---- 分类 ---- */
    editCategory: async (id) => {
      let info = {};
      if (id) { const r = await api('/domain/category/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      openModal(id ? '编辑分类' : '添加分类', simpleForm([
        { name: 'name', label: '分类名称', value: info.name, required: true },
        { name: 'sort', label: '排序（越小越靠前）', value: info.sort ?? 0 },
        { name: 'remark', label: '备注', value: info.remark },
      ], info), async () => {
        const r = await api('/domain/category/' + (id ? 'edit' : 'add'), { ...readSimpleForm(), id });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('category');
      });
    },
    delCategory: async (id) => { if (!confirmBox('确定删除该分类？')) return; const r = await api('/domain/category/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('category'); },

    /* ---- 容灾切换 ---- */
    editDmonitor: async (id) => {
      let info = {};
      if (id) { const r = await api('/dmonitor/task/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const domains = await domainOptions();
      const recs = info.did ? await recordOptions(info.did) : [];
      const html = simpleForm([
        { name: 'did', label: '主域名', type: 'select', options: [{ value: '', label: '请选择' }, ...domains], required: true },
        { name: 'rr', label: '主机记录', value: info.rr, placeholder: '如 www', required: true },
        { name: 'recordid', label: '解析记录', type: 'select', options: [{ value: '', label: '请选择域名后加载' }, ...recs], required: true },
        { name: 'type', label: '切换设置', type: 'select', options: [{ value: '0', label: '无操作' }, { value: '1', label: '暂停解析' }, { value: '2', label: '切换备用解析' }, { value: '3', label: '条件开启解析' }], value: info.type ?? 1 },
        { name: 'main_value', label: '主解析记录值', value: info.main_value, required: true },
        { name: 'backup_value', label: '备用解析记录', value: info.backup_value, placeholder: 'IP 或 CNAME（type=2 时填写）' },
        { name: 'checktype', label: '检测协议', type: 'select', options: [{ value: '0', label: 'PING' }, { value: '1', label: 'TCP' }, { value: '2', label: 'HTTP(S)' }], value: info.checktype ?? 1 },
        { name: 'checkurl', label: '检测地址', value: info.checkurl, placeholder: '检测IP 或 http(s)://URL' },
        { name: 'tcpport', label: 'TCP端口', value: info.tcpport ?? 80 },
        { name: 'frequency', label: '检测间隔（秒）', value: info.frequency ?? 60, required: true },
        { name: 'cycle', label: '确认次数', value: info.cycle ?? 3, required: true },
        { name: 'timeout', label: '超时时间（秒）', value: info.timeout ?? 2 },
        { name: 'proxy', label: '使用代理', type: 'select', options: [{ value: '0', label: '否' }, { value: '1', label: '是' }], value: info.proxy ?? 0 },
        { name: 'cdn', label: '切换时开启CF代理', type: 'select', options: [{ value: '0', label: '否' }, { value: '1', label: '是' }], value: info.cdn ?? 0 },
        { name: 'remark', label: '备注', value: info.remark },
      ], info);
      openModal(id ? '编辑容灾策略' : '添加容灾策略', html, async () => {
        const r = await api('/dmonitor/task/' + (id ? 'edit' : 'add'), { ...readSimpleForm(), id });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('dmonitor');
      });
      // 域名变化时加载记录列表
      $('#modal-body [name="did"]').addEventListener('change', async (e) => {
        const opts = await recordOptions(e.target.value);
        const sel = $('#modal-body [name="recordid"]');
        sel.innerHTML = '<option value="">请选择</option>' + opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
      });
    },
    delDmonitor: async (id) => { if (!confirmBox('确定删除？')) return; const r = await api('/dmonitor/task/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('dmonitor'); },
    toggleDmonitor: async (id, active) => { const r = await api('/dmonitor/task/setactive', { id, active }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('dmonitor'); },

    /* ---- 定时切换 ---- */
    editSchedule: async (id) => {
      let info = {};
      if (id) { const r = await api('/schedule/stask/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const domains = await domainOptions();
      const recs = info.did ? await recordOptions(info.did) : [];
      openModal(id ? '编辑定时切换' : '添加定时切换', simpleForm([
        { name: 'did', label: '域名', type: 'select', options: [{ value: '', label: '请选择' }, ...domains], required: true },
        { name: 'rr', label: '主机记录', value: info.rr, required: true },
        { name: 'recordid', label: '解析记录', type: 'select', options: [{ value: '', label: '请选择' }, ...recs], required: true },
        { name: 'type', label: '执行方式', type: 'select', options: [{ value: '0', label: '单次执行' }, { value: '1', label: '周期执行' }], value: info.type ?? 0 },
        { name: 'switchtime', label: '执行时间', value: info.switchtime, placeholder: '单次: 2027-01-01 10:00 / 周期: 10:00' },
        { name: 'cycle', label: '周期', type: 'select', options: [{ value: '0', label: '每天' }, { value: '1', label: '每周' }, { value: '2', label: '每月' }], value: info.cycle ?? 0 },
        { name: 'switchdate', label: '每周几/每月日期', value: info.switchdate, placeholder: '每周0-6 / 每月1-31' },
        { name: 'switchtype', label: '切换设置', type: 'select', options: [{ value: '0', label: '修改解析' }, { value: '1', label: '启用解析' }, { value: '2', label: '暂停解析' }, { value: '3', label: '删除解析' }], value: info.switchtype ?? 0 },
        { name: 'value', label: '记录值', value: info.value, placeholder: 'switchtype=0 时填写' },
        { name: 'line', label: '线路', value: info.line, placeholder: 'CF: 留空不改/0仅DNS/1代理' },
        { name: 'remark', label: '备注', value: info.remark },
      ], info), async () => {
        const r = await api('/schedule/stask/' + (id ? 'edit' : 'add'), { ...readSimpleForm(), id });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('schedule');
      });
      $('#modal-body [name="did"]').addEventListener('change', async (e) => {
        const opts = await recordOptions(e.target.value);
        $('#modal-body [name="recordid"]').innerHTML = '<option value="">请选择</option>' + opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
      });
    },
    delSchedule: async (id) => { if (!confirmBox('确定删除？')) return; const r = await api('/schedule/stask/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('schedule'); },
    toggleSchedule: async (id, active) => { const r = await api('/schedule/stask/setactive', { id, active }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('schedule'); },

    /* ---- 优选IP ---- */
    editOptimizeip: async (id) => {
      let info = {};
      if (id) { const r = await api('/optimizeip/opiplist/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const domains = await domainOptions();
      openModal(id ? '编辑优选IP' : '添加优选IP', simpleForm([
        { name: 'did', label: '域名', type: 'select', options: [{ value: '', label: '请选择' }, ...domains], required: true },
        { name: 'rr', label: '主机记录', value: info.rr, required: true },
        { name: 'type', label: '线路类型', type: 'select', options: [{ value: '0', label: '电信/联通/移动' }, { value: '1', label: '默认/联通/移动' }], value: info.type ?? 0 },
        { name: 'cdn_type', label: 'CDN服务商', type: 'select', options: [{ value: '1', label: 'CloudFlare' }, { value: '2', label: 'CloudFront' }, { value: '4', label: 'EdgeOne' }], value: info.cdn_type ?? 1 },
        { name: 'ip_type', label: 'IP类型', type: 'select', options: [{ value: 'v4', label: 'IPv4 (A记录)' }, { value: 'v6', label: 'IPv6 (AAAA记录)' }, { value: 'v4,v6', label: 'IPv4 + IPv6' }], value: info.ip_type ?? 'v4' },
        { name: 'recordnum', label: '每线路解析数量', value: info.recordnum ?? 2 },
        { name: 'ttl', label: 'TTL', value: info.ttl ?? 600 },
        { name: 'remark', label: '备注', value: info.remark },
      ], info), async () => {
        const r = await api('/optimizeip/opipform/' + (id ? 'edit' : 'add'), { ...readSimpleForm(), id });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('optimizeip');
      });
    },
    delOptimizeip: async (id) => { if (!confirmBox('确定删除？')) return; const r = await api('/optimizeip/opipform/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('optimizeip'); },
    toggleOptimizeip: async (id, active) => { const r = await api('/optimizeip/opipform/setactive', { id, active }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('optimizeip'); },
    runOptimizeip: async (id) => { const r = await api('/optimizeip/opipform/run', { id }); toast(r.msg || '已提交执行', r.code === 0 ? 'success' : 'info'); },

    /* ---- 证书订单 ---- */
    editCertOrder: async (id) => {
      let info = {};
      if (id) { const r = await api('/cert/order/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const accounts = (await api('/cert/account/data', { offset: 0, limit: 500, deploy: 0 })).rows || [];
      let domains = '';
      if (id) { const g = await api('/cert/order/get', { act: 'get', id }); if (g.data?.domains) domains = g.data.domains.join('\n'); }
      openModal(id ? '编辑证书订单' : '申请证书', simpleForm([
        { name: 'aid', label: '证书账户', type: 'select', options: [{ value: '', label: '请选择' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))], required: true },
        { name: 'keytype', label: '签名算法', type: 'select', options: [{ value: 'RSA', label: 'RSA' }, { value: 'ECC', label: 'ECC' }], value: info.keytype || 'RSA' },
        { name: 'keysize', label: '密钥长度', value: info.keysize || '2048', placeholder: 'RSA: 2048/3072；ECC: 256/384' },
        { name: 'domains', label: '绑定域名（一行一个）', type: 'textarea', value: domains, required: true },
      ], info), async () => {
        const d = readSimpleForm();
        d.domains = d.domains.split('\n').map((s) => s.trim()).filter(Boolean);
        const r = await api(id ? '/cert/order/edit' : '/cert/order/add', { ...d, id, act: id ? 'edit' : 'add' });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('certorder');
      });
    },
    delCertOrder: async (id) => { if (!confirmBox('确定删除该证书订单？')) return; const r = await api('/cert/order/del', { id, act: 'del' }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('certorder'); },

    /* ---- 证书账户 / 部署账户（动态字段） ---- */
    editCertAccount: (id) => window.app.__editAccountByType(id, 'cert', 0, '/cert/account/', 'certaccount'),
    editDeployAccount: (id) => window.app.__editAccountByType(id, 'deploy', 1, '/cert/account/', 'deployaccount'),
    __editAccountByType: async (id, metaKey, deploy, base, page) => {
      let info = {};
      if (id) { const r = await api(base + 'data', { offset: 0, limit: 500, deploy }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const types = META[metaKey] || {};
      const keys = Object.keys(types);
      const curType = info.type || keys[0] || '';
      let config = {};
      try { config = typeof info.config === 'string' ? JSON.parse(info.config || '{}') : (info.config || {}); } catch (e) {}
      const html = `<div class="field"><label>类型 <span style="color:#ef4444">*</span></label>
          <select class="input" id="ca-type">${keys.map((k) => `<option value="${k}"${k === curType ? ' selected' : ''}>${esc(types[k]?.name || k)}</option>`).join('')}</select></div>
        <div class="field"><label>账户名称 <span style="color:#ef4444">*</span></label><input class="input" id="ca-name" value="${esc(info.name || '')}" placeholder="留空自动取第一个配置项"></div>
        <div id="ca-dynamic"></div>
        <div class="field"><label>备注</label><input class="input" id="ca-remark" value="${esc(info.remark || '')}"></div>`;
      openModal(id ? '编辑账户' : '添加账户', html, async () => {
        const cfg = readDynamic($('#ca-dynamic'));
        const name = $('#ca-name').value.trim() || Object.values(cfg)[0] || '';
        const body = { act: id ? 'edit' : 'add', id, type: $('#ca-type').value, name, config: JSON.stringify(cfg), remark: $('#ca-remark').value, deploy };
        const r = await api(base + (id ? 'edit' : 'add'), body);
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate(page);
      });
      const dyn = $('#ca-dynamic');
      let readCfg = renderDynamic(dyn, types[curType]?.fields || {}, config);
      $('#ca-type').addEventListener('change', (e) => {
        const t = e.target.value; const current = readCfg(); const merged = {};
        Object.keys(types[t]?.fields || {}).forEach((k) => { merged[k] = current[k] ?? ''; });
        readCfg = renderDynamic(dyn, types[t]?.fields || {}, merged);
      });
    },
    delCertAccount: async (id) => { if (!confirmBox('确定删除？')) return; const r = await api('/cert/account/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('certaccount'); },
    delDeployAccount: async (id) => { if (!confirmBox('确定删除？')) return; const r = await api('/cert/account/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('deployaccount'); },

    /* ---- 部署任务 ---- */
    editDeployTask: async (id) => {
      let info = {};
      if (id) { const r = await api('/cert/deploy/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const accounts = (await api('/cert/account/data', { offset: 0, limit: 500, deploy: 1 })).rows || [];
      const orders = (await api('/cert/order/data', { offset: 0, limit: 500 })).rows || [];
      let config = {};
      try { config = typeof info.config === 'string' ? JSON.parse(info.config || '{}') : (info.config || {}); } catch (e) {}
      const accountType = accounts.find((a) => a.id == info.aid)?.type || '';
      const taskSchema = accountType ? (META.deploy?.[accountType]?.taskinputs || {}) : {};
      openModal(id ? '编辑部署任务' : '添加部署任务',
        `<div class="field"><label>部署账户 <span style="color:#ef4444">*</span></label><select class="input" name="aid">${accounts.map((a) => `<option value="${a.id}"${a.id == info.aid ? ' selected' : ''}>${esc(a.name)} (${esc(a.type)})</option>`).join('')}</select></div>
         <div class="field"><label>关联证书 <span style="color:#ef4444">*</span></label><select class="input" name="oid">${orders.map((o) => `<option value="${o.id}"${o.id == info.oid ? ' selected' : ''}>#${o.id} ${esc(o.issuer || '')}</option>`).join('')}</select></div>
         <div class="field"><label>部署参数</label><div id="dt-dynamic"></div></div>
         <div class="field"><label>备注</label><input class="input" name="remark" value="${esc(info.remark || '')}"></div>`,
        async () => {
          const cfg = readDynamic($('#dt-dynamic'));
          const d = readSimpleForm();
          const r = await api('/cert/deploy/' + (id ? 'edit' : 'add'), { ...d, id, config: JSON.stringify(cfg) });
          toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('deploytask');
        });
      const dyn = $('#dt-dynamic');
      let readCfg = renderDynamic(dyn, taskSchema, config);
      $('#modal-body [name="aid"]').addEventListener('change', async (e) => {
        const acc = accounts.find((a) => a.id == e.target.value);
        const t = acc?.type || '';
        const schema = META.deploy?.[t]?.taskinputs || {};
        const current = readCfg(); const merged = {};
        Object.keys(schema).forEach((k) => { merged[k] = current[k] ?? ''; });
        readCfg = renderDynamic(dyn, schema, merged);
      });
    },
    delDeployTask: async (id) => { if (!confirmBox('确定删除？')) return; const r = await api('/cert/deploy/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('deploytask'); },
    toggleDeployTask: async (id, active) => { const r = await api('/cert/deploy/setactive', { id, active }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('deploytask'); },

    /* ---- CNAME ---- */
    editCname: async (id) => {
      let info = {};
      if (id) { const r = await api('/cert/cname/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const domains = await domainOptions();
      openModal(id ? '编辑CNAME' : '添加CNAME', simpleForm([
        { name: 'domain', label: '被代理域名', value: info.domain, required: true, placeholder: '如 example.com' },
        { name: 'did', label: '系统域名', type: 'select', options: [{ value: '', label: '请选择' }, ...domains], required: true },
        { name: 'rr', label: 'CNAME记录值', value: info.rr, required: true, placeholder: '自定义主机记录' },
      ], info), async () => {
        const r = await api('/cert/cname/' + (id ? 'edit' : 'add'), { ...readSimpleForm(), id });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('certcname');
      });
    },
    delCname: async (id) => { if (!confirmBox('确定删除？')) return; const r = await api('/cert/cname/del', { id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('certcname'); },

    /* ---- 用户 ---- */
    editUser: async (id) => {
      let info = {};
      if (id) { const r = await api('/user/data', { offset: 0, limit: 500 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      openModal(id ? '编辑用户' : '添加用户', simpleForm([
        { name: 'username', label: '用户名', value: info.username, required: true },
        { name: 'password', label: id ? '重置密码（留空不改）' : '密码', type: 'password', required: !id },
        { name: 'is_api', label: 'API接口', type: 'select', options: [{ value: '0', label: '关闭' }, { value: '1', label: '开启' }], value: info.is_api ?? 0 },
        { name: 'apikey', label: 'API密钥', value: info.apikey },
        { name: 'level', label: '用户等级', type: 'select', options: [{ value: '1', label: '普通用户' }, { value: '2', label: '管理员' }], value: info.level ?? 1 },
        { name: 'repwd', label: '重复密码', type: 'password' },
      ], info), async () => {
        const d = readSimpleForm();
        if (id && !d.password) delete d.password;
        if (id) d.repwd = d.password;
        const r = await api('/user/op', { act: id ? 'edit' : 'add', id, ...d });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error'); closeModal(); navigate('user');
      });
    },
    delUser: async (id) => { if (!confirmBox('确定删除该用户？')) return; const r = await api('/user/op', { act: 'del', id }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('user'); },
    toggleUser: async (id, status) => { const r = await api('/user/op', { act: 'set', id, status }); toast(r.msg, r.code === 0 ? 'success' : 'error'); navigate('user'); },
  };

  // 启动
  checkLogin();
})();
