/* dnsmgr Cloudflare Edition - 自包含现代化 SPA（零外部依赖） */
(function () {
  'use strict';

  let currentUser = null;
  let preToken = '';
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
    return ct.includes('application/json') ? resp.json() : resp.text();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toast(msg, type = 'info', ms = 2600) {
    const box = $('#toast-box');
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'success' ? 'ok' : type === 'error' ? 'err' : type === 'warning' ? 'warn' : '');
    const icon = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';
    el.innerHTML = `<span class="ic">${icon}</span><span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 200); }, ms);
  }

  /* ---------------- 模态框 ---------------- */
  let modalSaveHandler = null;
  function openModal(title, fields, onSave) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = fields.map((f) => {
      let control;
      if (f.type === 'select') {
        control = `<select class="input" name="${esc(f.name)}">${(f.options || []).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(f.value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      } else if (f.type === 'textarea') {
        control = `<textarea class="input" name="${esc(f.name)}" rows="4" style="height:auto;padding:10px">${esc(f.value ?? '')}</textarea>`;
      } else {
        control = `<input class="input" type="${f.type || 'text'}" name="${esc(f.name)}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}">`;
      }
      const hint = f.hint ? `<div class="hint" style="margin-top:4px">${f.hint}</div>` : '';
      return `<div class="field"><label>${esc(f.label)}</label>${control}${hint}</div>`;
    }).join('');
    modalSaveHandler = onSave;
    $('#modal-mask').style.display = 'flex';
  }
  function closeModal() { $('#modal-mask').style.display = 'none'; modalSaveHandler = null; }

  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-mask').addEventListener('click', (e) => { if (e.target.id === 'modal-mask') closeModal(); });
  $('#modal-save').addEventListener('click', async () => {
    if (!modalSaveHandler) return;
    const data = {};
    $$('#modal-body [name]').forEach((el) => { data[el.name] = el.value; });
    const btn = $('#modal-save');
    btn.disabled = true;
    try { await modalSaveHandler(data); }
    finally { btn.disabled = false; }
  });

  /* ---------------- 登录 ---------------- */
  function refreshCaptcha() { $('#vcode-img').src = '/verifycode?t=' + Date.now(); }
  $('#vcode-img').addEventListener('click', refreshCaptcha);
  $('#logout-btn').addEventListener('click', async () => { await api('/logout', {}, 'GET'); location.href = '/login'; });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#login-msg');
    msg.textContent = ''; msg.className = 'msg';
    const btn = $('#login-btn'); btn.disabled = true;
    try {
      const isTotp = preToken && $('#totp-group').style.display !== 'none';
      let res;
      if (isTotp) {
        res = await api('/auth/totp', { pre_token: preToken, code: $('#totp-code').value });
      } else {
        res = await api('/login', {
          username: $('#login-username').value.trim(),
          password: $('#login-password').value,
          code: $('#login-code').value.trim(),
        });
      }
      if (res.code === 0) {
        await showApp();
      } else if (res.vcode === 2) {
        preToken = res.pre_token || '';
        $('#totp-group').style.display = '';
        $('#vcode-group').style.display = 'none';
        msg.className = 'msg info';
        msg.textContent = res.msg || '请输入动态口令';
      } else {
        msg.className = 'msg err';
        msg.textContent = res.msg || '登录失败';
        if (res.vcode === 1) refreshCaptcha();
      }
    } catch (err) {
      msg.className = 'msg err'; msg.textContent = '网络错误：' + err.message;
    } finally { btn.disabled = false; }
  });

  async function checkLogin() {
    try {
      const st = await api('/install/check', {}, 'GET');
      if (st && st.installed === false) { location.href = '/install'; return; }
    } catch (e) {}
    const res = await api('/api/status', {}, 'GET');
    if (res.code === 0) {
      currentUser = res.data;
      await showApp();
    } else {
      $('#login-page').style.display = 'flex';
      $('#app').style.display = 'none';
      refreshCaptcha();
    }
  }

  function showApp() {
    $('#login-page').style.display = 'none';
    $('#app').style.display = 'block';
    $('#user-name').textContent = currentUser?.username || '用户';
    $('#user-avatar').textContent = (currentUser?.username || 'U').charAt(0).toUpperCase();
    buildMenu();
    navigate('dashboard');
  }

  /* ---------------- 菜单与导航（事件委托） ---------------- */
  const MENU = [
    { group: '概览', items: [
      { key: 'dashboard', name: '仪表盘', icon: '▦' },
    ]},
    { group: '域名管理', items: [
      { key: 'domain', name: '域名列表', icon: '🌐' },
      { key: 'account', name: '域名账户', icon: '☁' },
      { key: 'category', name: '域名分类', icon: '🏷' },
    ]},
    { group: '解析管理', items: [
      { key: 'record_search', name: '解析记录查询', icon: '🔍' },
    ]},
    { group: '容灾与定时', items: [
      { key: 'dmonitor', name: '容灾切换', icon: '💓' },
      { key: 'schedule', name: '定时切换', icon: '🕐' },
      { key: 'optimizeip', name: 'CF优选IP', icon: '⚡' },
    ]},
    { group: 'SSL证书', items: [
      { key: 'certorder', name: '证书订单', icon: '🔐' },
      { key: 'certaccount', name: '证书账户', icon: '🔑' },
      { key: 'deployaccount', name: '部署任务', icon: '📤' },
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
    // 事件委托：在容器上监听，动态重建子元素也不会丢失
    nav.onclick = (e) => {
      const el = e.target.closest('[data-nav]');
      if (el) navigate(el.dataset.nav);
    };
  }

  // 移动端菜单
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
    } catch (e) {
      main.innerHTML = `<div class="card"><div class="msg err">加载失败：${esc(e.message)}</div></div>`;
    }
  }

  /* ---------------- 表格渲染 ---------------- */
  function table(cols, id) {
    return `<div class="table-wrap"><table class="tbl" id="${id || 'tbl'}"><thead><tr>${cols.map((c) => `<th>${esc(c.title)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
  }
  async function fillTable(id, url, cols, extra = {}) {
    const res = await api(url, { offset: 0, limit: 100, ...extra });
    const rows = res.rows || (Array.isArray(res) ? res : []);
    const tbody = $(`#${id} tbody`);
    if (!tbody) return rows;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="empty" colspan="${cols.length}">暂无数据</td></tr>`;
      return rows;
    }
    tbody.innerHTML = rows.map((row) => '<tr>' + cols.map((c) => `<td>${c.render ? c.render(row) : esc(row[c.field] ?? '')}</td>`).join('') + '</tr>').join('');
    return rows;
  }
  const editBtn = (fn, id) => `<button class="btn btn-info btn-sm" onclick="app.${fn}(${id})">编辑</button>`;
  const delBtn = (fn, id) => `<button class="btn btn-danger btn-sm" onclick="app.${fn}(${id})">删除</button>`;

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
      <div class="card">
        <div class="card-head"><div class="card-title"><span class="ico">ℹ</span> 系统信息</div></div>
        <div class="form-grid">
          <div><div class="hint">运行平台</div><div style="font-weight:600;margin-top:4px">${esc(d.platform || 'Cloudflare Workers')}</div></div>
          <div><div class="hint">数据库</div><div style="font-weight:600;margin-top:4px">${esc(d.db_type || 'D1 (SQLite)')}</div></div>
        </div>
        <div class="notice" style="margin-top:18px">定时任务由 Cloudflare Cron Trigger 每分钟自动触发，也可访问 <code>/cron?key=密钥</code> 手动触发。</div>
      </div>`;
  };

  PAGES.domain = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' },
      { field: 'name', title: '域名' },
      { field: 'typename', title: '平台', render: (r) => `<span class="badge blue">${esc(r.typename || r.type || '-')}</span>` },
      { field: 'recordcount', title: '记录数' },
      { field: 'expiretime', title: '到期时间' },
      { field: 'remark', title: '备注' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions"><button class="btn btn-info btn-sm" onclick="app.viewRecords(${r.id})">解析</button>${editBtn('editDomain', r.id)}${delBtn('delDomain', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title"><span class="ico">🌐</span> 域名列表</div><div class="card-tools"><button class="btn btn-success btn-sm" onclick="app.addDomain()">＋ 添加域名</button></div></div>${table(cols, 'tbl-domain')}</div>`;
    await fillTable('tbl-domain', '/domain/data', cols);
  };

  PAGES.account = async (el) => {
    const cols = [
      { field: 'id', title: 'ID' },
      { field: 'name', title: '名称', render: (r) => `${r.icon ? `<img src="/static/images/${esc(r.icon)}" style="width:18px;height:18px;vertical-align:middle;margin-right:6px">` : ''}${esc(r.name)}` },
      { field: 'typename', title: '类型', render: (r) => `<span class="badge blue">${esc(r.typename || '-')}</span>` },
      { field: 'remark', title: '备注' },
      { field: 'addtime', title: '添加时间' },
      { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editAccount', r.id)}${delBtn('delAccount', r.id)}</div>` },
    ];
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title"><span class="ico">☁</span> 域名账户</div><div class="card-tools"><button class="btn btn-success btn-sm" onclick="app.editAccount(0)">＋ 添加账户</button></div></div>${table(cols, 'tbl-account')}</div>`;
    await fillTable('tbl-account', '/account/data', cols);
  };

  PAGES.category = listPage('域名分类', '/domain/category/data', [
    { field: 'id', title: 'ID' }, { field: 'name', title: '分类名' },
    { field: 'remark', title: '备注' }, { field: 'sort', title: '排序' },
    { field: '_op', title: '操作', render: (r) => `<div class="row-actions">${editBtn('editCategory', r.id)}${delBtn('delCategory', r.id)}</div>` },
  ], 'app.editCategory(0)');

  PAGES.record_search = async (el) => {
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title"><span class="ico">🔍</span> 解析记录查询</div></div>
      <div class="input-group" style="max-width:560px;margin-bottom:18px">
        <select class="input" id="rs-domain" style="flex:1"></select>
        <input class="input" id="rs-kw" placeholder="关键字（可选）" style="flex:1">
        <button class="btn btn-primary" id="rs-search">查询</button>
      </div>
      <div id="rs-result"></div></div>`;
    const domains = await api('/domain/data', { offset: 0, limit: 200 });
    $('#rs-domain').innerHTML = (domains.rows || []).map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('') || '<option value="">暂无域名</option>';
    $('#rs-search').addEventListener('click', async () => {
      const id = $('#rs-domain').value;
      if (!id) { toast('请先添加一个域名', 'warning'); return; }
      const res = await api('/record/data/' + id, { keyword: $('#rs-kw').value.trim(), offset: 0, limit: 100 });
      const rows = res.rows || (Array.isArray(res) ? res : []);
      const cols = ['Name', 'Type', 'Value', 'Line', 'TTL', 'Status'];
      $('#rs-result').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
        (rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(Array.isArray(r[c]) ? r[c].join(',') : r[c] ?? '')}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${cols.length}">暂无解析记录</td></tr>`) + '</tbody></table></div>';
      toast(`查询到 ${rows.length} 条记录`, 'success');
    });
  };

  function listPage(title, url, cols, addFn) {
    return async (el) => {
      const addBtn = addFn ? `<div class="card-tools"><button class="btn btn-success btn-sm" onclick="${addFn}">＋ 添加</button></div>` : '';
      el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">${esc(title)}</div>${addBtn}</div>${table(cols, 'tbl-generic')}</div>`;
      await fillTable('tbl-generic', url, cols);
    };
  }

  PAGES.dmonitor = listPage('容灾切换', '/dmonitor/task/data', [
    { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
    { field: 'main_value', title: '主记录' }, { field: 'backup_value', title: '备用记录' },
    { field: 'checktype', title: '检测方式', render: (r) => `<span class="badge gray">${['PING', 'TCP', 'HTTP'][r.checktype] || 'HTTP'}</span>` },
    { field: 'status', title: '状态', render: (r) => r.status == 1 ? '<span class="badge red">已切换</span>' : '<span class="badge green">正常</span>' },
  ]);
  PAGES.schedule = listPage('定时切换', '/schedule/stask/data', [
    { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
    { field: 'switchtype', title: '切换类型' }, { field: 'value', title: '目标值' },
    { field: 'cycle', title: '周期' }, { field: 'active', title: '启用' },
  ]);
  PAGES.optimizeip = listPage('CF优选IP', '/optimizeip/opiplist/data', [
    { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
    { field: 'ip_type', title: 'IP类型' }, { field: 'recordnum', title: '记录数' }, { field: 'status', title: '状态' },
  ]);
  PAGES.certaccount = listPage('证书账户', '/cert/account/data', [
    { field: 'id', title: 'ID' }, { field: 'name', title: '名称' },
    { field: 'type', title: '类型' }, { field: 'remark', title: '备注' },
  ]);
  PAGES.certorder = listPage('证书订单', '/cert/order/data', [
    { field: 'id', title: 'ID' }, { field: 'aid', title: '账户ID' },
    { field: 'status', title: '状态' }, { field: 'issuer', title: '颁发者' },
    { field: 'expiretime', title: '到期时间' }, { field: 'error', title: '错误' },
  ]);
  PAGES.deployaccount = listPage('证书部署任务', '/cert/deploy/data', [
    { field: 'id', title: 'ID' }, { field: 'aid', title: '账户ID' },
    { field: 'oid', title: '订单ID' }, { field: 'status', title: '状态' }, { field: 'error', title: '错误' },
  ]);
  PAGES.user = listPage('用户管理', '/user/data', [
    { field: 'id', title: 'ID' }, { field: 'username', title: '用户名' },
    { field: 'level', title: '等级', render: (r) => `<span class="badge ${r.level == 2 ? 'blue' : 'gray'}">${['普通', '成员', '管理员'][r.level] || r.level}</span>` },
    { field: 'is_api', title: 'API', render: (r) => r.is_api == 1 ? '<span class="badge green">开启</span>' : '<span class="badge gray">关闭</span>' },
    { field: 'status', title: '状态', render: (r) => r.status == 1 ? '<span class="badge green">正常</span>' : '<span class="badge red">封禁</span>' },
    { field: 'lasttime', title: '最后登录' },
  ]);
  PAGES.log = listPage('操作日志', '/log/data', [
    { field: 'id', title: 'ID' }, { field: 'uid', title: '用户ID' },
    { field: 'action', title: '操作' }, { field: 'domain', title: '域名' },
    { field: 'data', title: '详情' }, { field: 'addtime', title: '时间' },
  ]);

  async function settingsPage(el, title, keys) {
    const res = await api('/system/configs', {}, 'GET');
    const cfg = res.data || {};
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">${esc(title)}</div></div>
      <form id="settings-form"><div class="form-grid">
      ${keys.map((k) => `<div class="field"><label>${esc(k)}</label><input class="input" name="${esc(k)}" value="${esc(cfg[k] ?? '')}"></div>`).join('')}
      </div><div class="form-actions"><button class="btn btn-primary" type="submit">保存设置</button></div></form></div>`;
    $('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      $$('#settings-form [name]').forEach((input) => { data[input.name] = input.value; });
      const r = await api('/system/set', data);
      toast(r.msg || (r.code === 0 ? '保存成功' : '保存失败'), r.code === 0 ? 'success' : 'error');
    });
  }
  PAGES.notice = (el) => settingsPage(el, '通知设置', ['notice_mail', 'mail_type', 'mail_smtp', 'mail_port', 'mail_name', 'mail_pwd', 'mail_apiuser', 'mail_apikey', 'mail_recv', 'webhook_url', 'tgbot_token', 'tgbot_chatid', 'custom_webhook_url', 'wechat_apptoken', 'wechat_appuid']);
  PAGES.cron = (el) => settingsPage(el, '定时任务设置', ['cron_type', 'cron_key']);

  PAGES.backup = async (el) => {
    el.innerHTML = `<div class="card"><div class="card-head"><div class="card-title"><span class="ico">💾</span> 数据库备份与恢复</div></div>
      <div class="notice">导出当前 D1 数据库的全部数据（SQLite 格式）。导入支持本系统备份及历史 MySQL mysqldump 文件，会自动转换格式。</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:20px">
        <button class="btn btn-primary" id="backup-export">⬇ 导出备份</button>
      </div>
      <hr style="border:none;border-top:1px solid var(--line);margin:20px 0">
      <div class="field" style="max-width:520px"><label>选择备份文件 (.sql)</label><input class="input" type="file" id="backup-file" accept=".sql"></div>
      <div class="form-actions"><button class="btn btn-warning" id="backup-import">⬆ 导入恢复</button></div>
      <div id="backup-msg" style="margin-top:16px"></div></div>`;
    $('#backup-export').addEventListener('click', () => { window.location = '/system/backup/export'; });
    $('#backup-import').addEventListener('click', async () => {
      const f = $('#backup-file').files[0];
      if (!f) { toast('请选择备份文件', 'warning'); return; }
      const msg = $('#backup-msg');
      msg.innerHTML = '<div class="hint">正在恢复，请稍候...</div>';
      try {
        const sql = await f.text();
        const r = await api('/system/backup/import', { sql });
        const detail = r.data && r.data.errors && r.data.errors.length ? `<div class="hint">${r.data.errors.map(esc).join('<br>')}</div>` : '';
        msg.innerHTML = `<div class="notice">${esc(r.msg || '恢复完成')}</div>${detail}`;
        toast(r.msg || '恢复完成', r.code === 0 ? 'success' : 'warning');
      } catch (e) { msg.innerHTML = `<div class="msg err">恢复失败：${esc(e.message)}</div>`; }
    });
  };

  /* ---------------- 全局操作（弹窗按钮 onclick 用） ---------------- */
  window.app = {
    addDomain: async () => {
      const res = await api('/account/data', { offset: 0, limit: 200 });
      const accounts = res.rows || [];
      if (!accounts.length) { toast('请先添加域名账户', 'warning'); return; }
      openModal('添加域名', [
        { name: 'aid', label: '域名账户', type: 'select', options: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.typename || a.type})` })) },
        { name: 'name', label: '域名', placeholder: 'example.com' },
        { name: 'thirdid', label: '平台域名ID', placeholder: '手动录入时填写' },
        { name: 'method', label: '方式', type: 'select', options: [{ value: '0', label: '手动录入已有域名' }, { value: '1', label: '通过API新建域名' }] },
      ], async (data) => {
        const r = await api('/domain/op', { act: 'add', ...data });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error');
        closeModal(); navigate('domain');
      });
    },
    editDomain: async (id) => {
      const r = await api('/domain/data', { id, offset: 0, limit: 1 });
      const info = (r.rows || [])[0] || {};
      openModal('域名配置', [
        { name: 'remark', label: '备注', value: info.remark },
        { name: 'expiretime', label: '到期时间', value: info.expiretime, placeholder: '2027-01-01 00:00:00' },
        { name: 'is_hide', label: '隐藏 (0否/1是)', value: info.is_hide },
        { name: 'is_sso', label: '快捷登录 (0否/1是)', value: info.is_sso },
        { name: 'is_notice', label: '到期提醒 (0否/1是)', value: info.is_notice },
      ], async (data) => {
        const res = await api('/domain/op', { act: 'edit', id, ...data });
        toast(res.msg || '操作完成', res.code === 0 ? 'success' : 'error');
        closeModal(); navigate('domain');
      });
    },
    delDomain: async (id) => {
      if (!confirm('确定删除该域名？关联任务也会一并删除。')) return;
      const r = await api('/domain/op', { act: 'del', id });
      toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error');
      navigate('domain');
    },
    viewRecords: (id) => { navigate('record_search'); setTimeout(() => { const s = $('#rs-domain'); if (s) { s.value = id; $('#rs-search').click(); } }, 250); },
    editAccount: async (id) => {
      let info = {};
      if (id) { const r = await api('/account/data', { offset: 0, limit: 200 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      openModal(id ? '编辑账户' : '添加账户', [
        { name: 'type', label: '平台类型', type: 'select', value: info.type, options: ['aliyun', 'dnspod', 'cloudflare', 'huawei', 'baidu', 'west', 'huoshan', 'jdcloud', 'dnsla', 'powerdns', 'namesilo', 'aws'].map((k) => ({ value: k, label: k })) },
        { name: 'name', label: '账户名称', value: info.name },
        { name: 'config', label: '配置 (JSON)', type: 'textarea', value: info.config, hint: '如 {"AccessKeyId":"...","AccessKeySecret":"..."}' },
        { name: 'remark', label: '备注', value: info.remark },
      ], async (data) => {
        const r = await api('/account/' + (id ? 'edit' : 'add'), { ...data, id });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error');
        closeModal(); navigate('account');
      });
    },
    delAccount: async (id) => {
      if (!confirm('确定删除该账户？')) return;
      const r = await api('/account/del', { id });
      toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error');
      navigate('account');
    },
    editCategory: async (id) => {
      let info = {};
      if (id) { const r = await api('/domain/category/data', { offset: 0, limit: 200 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      openModal(id ? '编辑分类' : '添加分类', [
        { name: 'name', label: '分类名', value: info.name },
        { name: 'remark', label: '备注', value: info.remark },
        { name: 'sort', label: '排序', value: info.sort ?? 0 },
      ], async (data) => {
        const r = await api('/domain/category/' + (id ? 'edit' : 'add'), { ...data, id });
        toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error');
        closeModal(); navigate('category');
      });
    },
    delCategory: async (id) => {
      if (!confirm('确定删除该分类？')) return;
      const r = await api('/domain/category/del', { id });
      toast(r.msg || '操作完成', r.code === 0 ? 'success' : 'error');
      navigate('category');
    },
  };

  // 启动
  checkLogin();
})();
