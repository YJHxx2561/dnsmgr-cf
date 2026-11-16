/* dnsmgr Cloudflare Edition - 前端单页应用（原生 JS + Bootstrap） */
(function () {
  'use strict';

  const API = '';
  let currentUser = null;
  let preToken = '';

  // ---------- 通用请求 ----------
  async function request(path, data = {}, method = 'POST') {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (method === 'GET') {
      const qs = new URLSearchParams(data).toString();
      if (qs) path += '?' + qs;
    } else {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(data);
    }
    const resp = await fetch(API + path, opt);
    const ct = resp.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) return resp.json();
    return resp.text();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 登录 ----------
  const loginPage = document.getElementById('login-page');
  const appEl = document.getElementById('app');

  async function refreshCaptcha() {
    document.getElementById('vcode-img').src = '/verifycode?t=' + Date.now();
  }
  document.getElementById('vcode-img')?.addEventListener('click', refreshCaptcha);

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('login-msg');
    msg.textContent = '';
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    try {
      const isTotp = preToken && document.getElementById('totp-group').style.display !== 'none';
      let res;
      if (isTotp) {
        res = await request('/auth/totp', { pre_token: preToken, code: document.getElementById('totp-code').value });
      } else {
        res = await request('/login', {
          username: document.getElementById('login-username').value,
          password: document.getElementById('login-password').value,
          code: document.getElementById('login-code').value,
        });
      }
      if (res.code === 0) {
        await showApp();
      } else if (res.vcode === 2) {
        preToken = res.pre_token || '';
        document.getElementById('totp-group').style.display = '';
        document.getElementById('vcode-group').style.display = 'none';
        msg.className = 'text-info';
        msg.textContent = res.msg || '请输入动态口令';
      } else {
        msg.className = 'text-danger';
        msg.textContent = res.msg || '登录失败';
        if (res.vcode === 1) refreshCaptcha();
      }
    } catch (err) {
      msg.textContent = '网络错误：' + err.message;
    } finally {
      btn.disabled = false;
    }
  });

  async function showApp() {
    loginPage.style.display = 'none';
    appEl.style.display = '';
    buildMenu();
    navigate('dashboard');
  }

  async function checkLogin() {
    const res = await request('/', {}, 'GET');
    if (res.code === 0) {
      currentUser = res.data;
      await showApp();
    } else {
      loginPage.style.display = '';
      appEl.style.display = 'none';
      refreshCaptcha();
    }
  }

  // ---------- 菜单 ----------
  const MENU = [
    { group: '概览', items: [{ key: 'dashboard', name: '仪表盘', icon: 'fa-dashboard' }] },
    { group: '域名管理', items: [
      { key: 'account', name: '域名账户', icon: 'fa-cloud' },
      { key: 'domain', name: '域名列表', icon: 'fa-globe' },
      { key: 'category', name: '域名分类', icon: 'fa-tags' },
    ]},
    { group: '解析管理', items: [
      { key: 'record_search', name: '解析记录查询', icon: 'fa-search' },
    ]},
    { group: '容灾与定时', items: [
      { key: 'dmonitor', name: '容灾切换', icon: 'fa-heartbeat' },
      { key: 'schedule', name: '定时切换', icon: 'fa-clock-o' },
      { key: 'optimizeip', name: 'CF优选IP', icon: 'fa-tachometer' },
    ]},
    { group: 'SSL证书', items: [
      { key: 'certaccount', name: '证书账户', icon: 'fa-key' },
      { key: 'certorder', name: '证书订单', icon: 'fa-certificate' },
      { key: 'deployaccount', name: '部署任务', icon: 'fa-upload' },
    ]},
    { group: '系统', items: [
      { key: 'user', name: '用户管理', icon: 'fa-users', admin: true },
      { key: 'notice', name: '通知设置', icon: 'fa-bell', admin: true },
      { key: 'cron', name: '定时任务', icon: 'fa-refresh', admin: true },
      { key: 'backup', name: '备份恢复', icon: 'fa-database', admin: true },
      { key: 'log', name: '操作日志', icon: 'fa-list' },
    ]},
  ];

  function buildMenu() {
    const sidebar = document.getElementById('sidebar-menu');
    let html = '';
    for (const g of MENU) {
      html += `<li class="treeview"><a href="#"><i class="fa fa-folder-o"></i><span>${g.group}</span><i class="fa fa-angle-left pull-right"></i></a><ul class="treeview-menu">`;
      for (const item of g.items) {
        if (item.admin && currentUser?.level !== 2) continue;
        html += `<li><a data-nav="${item.key}"><i class="fa ${item.icon}"></i> ${item.name}</a></li>`;
      }
      html += '</ul></li>';
    }
    sidebar.innerHTML = html;
    sidebar.querySelectorAll('[data-nav]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); navigate(a.dataset.nav); });
    });
  }

  async function navigate(page) {
    document.querySelectorAll('.sidebar-menu li').forEach((li) => li.classList.remove('active'));
    const navLink = document.querySelector(`[data-nav="${page}"]`);
    if (navLink) {
      navLink.parentElement.classList.add('active');
      navLink.closest('.treeview')?.classList.add('active');
    }
    const main = document.getElementById('main-content');
    main.innerHTML = '<div class="loader">加载中...</div>';
    try {
      await PAGES[page](main);
    } catch (e) {
      main.innerHTML = `<div class="alert alert-danger">加载失败：${escapeHtml(e.message)}</div>`;
    }
  }

  // ---------- 通用表格 ----------
  function tableHtml(cols, id) {
    let thead = '<thead><tr>' + cols.map((c) => `<th data-field="${c.field}">${c.title}</th>`).join('') + '</tr></thead>';
    return `<table class="table table-bordered table-hover" id="${id || 'tbl'}">${thead}<tbody></tbody></table>`;
  }

  async function loadTable(tableId, listUrl, cols, dataFn) {
    const offset = 0, limit = 50;
    const res = await request(listUrl, { offset, limit });
    const rows = res.rows || [];
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="text-center text-muted">暂无数据</td></tr>`;
      return rows;
    }
    tbody.innerHTML = rows.map((row) => '<tr>' + cols.map((c) => `<td>${c.render ? c.render(row) : escapeHtml(row[c.field] ?? '')}</td>`).join('') + '</tr>').join('');
    return rows;
  }

  function setTitle(t) { document.getElementById('page-title').textContent = t; }

  // ---------- 页面定义 ----------
  const PAGES = {};

  PAGES.dashboard = async (el) => {
    setTitle('仪表盘');
    const res = await request('/', {}, 'GET');
    const d = res.data || {};
    el.innerHTML = `
      <div class="row">
        <div class="col-md-3"><div class="stat-card blue"><div class="num">${d.domain_count || 0}</div><div class="label-txt">域名数量</div></div></div>
        <div class="col-md-3"><div class="stat-card green"><div class="num">${d.account_count || 0}</div><div class="label-txt">域名账户</div></div></div>
        <div class="col-md-3"><div class="stat-card yellow"><div class="num">${d.record_count || 0}</div><div class="label-txt">解析记录</div></div></div>
        <div class="col-md-3"><div class="stat-card red"><div class="num">${d.version || '-'}</div><div class="label-txt">系统版本</div></div></div>
      </div>
      <div class="box box-primary"><div class="box-header"><h3 class="box-title">系统信息</h3></div>
        <div class="box-body"><p>运行平台：${escapeHtml(d.platform)}</p><p>数据库：${escapeHtml(d.db_type)}</p>
        <p>定时任务：由 Cloudflare Cron Trigger 每分钟自动触发，也可访问 <code>/cron?key=密钥</code> 手动触发。</p></div></div>`;
  };

  PAGES.account = async (el) => {
    setTitle('域名账户');
    const cols = [
      { field: 'id', title: 'ID' },
      { field: 'name', title: '名称', render: (r) => `${r.icon ? `<img src="/static/images/${escapeHtml(r.icon)}" style="width:16px;height:16px"> ` : ''}${escapeHtml(r.name)}` },
      { field: 'typename', title: '类型' },
      { field: 'remark', title: '备注' },
      { field: 'addtime', title: '添加时间' },
      { field: '_op', title: '操作', render: (r) => `<button class="btn btn-xs btn-primary" onclick="app.editAccount(${r.id})">编辑</button> <button class="btn btn-xs btn-danger" onclick="app.delAccount(${r.id})">删除</button>` },
    ];
    el.innerHTML = `<div class="box box-primary"><div class="box-header">
      <button class="btn btn-success btn-sm" onclick="app.editAccount(0)"><i class="fa fa-plus"></i> 添加账户</button></div>
      <div class="box-body">${tableHtml(cols, 'tbl-account')}</div></div>`;
    await loadTable('tbl-account', '/account/data', cols);
  };

  PAGES.domain = async (el) => {
    setTitle('域名列表');
    const cols = [
      { field: 'id', title: 'ID' },
      { field: 'name', title: '域名' },
      { field: 'typename', title: '平台' },
      { field: 'recordcount', title: '记录数' },
      { field: 'expiretime', title: '到期时间' },
      { field: 'remark', title: '备注' },
      { field: '_op', title: '操作', render: (r) => `<button class="btn btn-xs btn-info" onclick="app.viewRecords(${r.id},'${escapeHtml(r.name)}')">解析</button> <button class="btn btn-xs btn-primary" onclick="app.editDomain(${r.id})">配置</button> <button class="btn btn-xs btn-danger" onclick="app.delDomain(${r.id})">删除</button>` },
    ];
    el.innerHTML = `<div class="box box-primary"><div class="box-header"><h3 class="box-title">域名管理</h3></div>
      <div class="box-body">${tableHtml(cols, 'tbl-domain')}</div></div>`;
    await loadTable('tbl-domain', '/domain/data', cols);
  };

  PAGES.record_search = async (el) => {
    setTitle('解析记录查询');
    el.innerHTML = `<div class="box box-primary"><div class="box-body">
      <div class="form-inline" style="margin-bottom:15px">
        <select class="form-control" id="rs-domain"></select>
        <input type="text" class="form-control" id="rs-kw" placeholder="关键字">
        <button class="btn btn-primary" id="rs-search">查询</button>
      </div>
      <div id="rs-result"></div></div></div>`;
    const domains = await request('/domain/data', { offset: 0, limit: 100 });
    document.getElementById('rs-domain').innerHTML = (domains.rows || []).map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    document.getElementById('rs-search').addEventListener('click', async () => {
      const id = document.getElementById('rs-domain').value;
      const kw = document.getElementById('rs-kw').value;
      const res = await request('/record/data/' + id, { keyword: kw, offset: 0, limit: 50 });
      const rows = res.rows || (Array.isArray(res) ? res : []);
      const cols = ['Name', 'Type', 'Value', 'Line', 'TTL', 'Status'];
      document.getElementById('rs-result').innerHTML = `<table class="table table-bordered"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
        rows.map((r) => `<tr>${cols.map((c) => `<td>${escapeHtml(r[c] ?? '')}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
    });
  };

  function genericListPage(title, listUrl, cols, addFn) {
    return async (el) => {
      setTitle(title);
      const addBtn = addFn ? `<button class="btn btn-success btn-sm" onclick="${addFn}"><i class="fa fa-plus"></i> 添加</button>` : '';
      el.innerHTML = `<div class="box box-primary"><div class="box-header">${addBtn}</div><div class="box-body">${tableHtml(cols, 'tbl-generic')}</div></div>`;
      await loadTable('tbl-generic', listUrl, cols);
    };
  }

  PAGES.dmonitor = genericListPage('容灾切换', '/dmonitor/task/data', [
    { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
    { field: 'main_value', title: '主记录' }, { field: 'backup_value', title: '备用记录' },
    { field: 'checktype', title: '检测方式', render: (r) => ['ping', 'tcp', 'http'][r.checktype] || 'HTTP' },
    { field: 'status', title: '状态', render: (r) => r.status == 1 ? '<span class="label label-danger">已切换</span>' : '<span class="label label-success">正常</span>' },
  ]);
  PAGES.schedule = genericListPage('定时切换', '/schedule/stask/data', [
    { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
    { field: 'switchtype', title: '切换类型' }, { field: 'value', title: '目标值' },
    { field: 'cycle', title: '周期' }, { field: 'active', title: '启用' },
  ]);
  PAGES.optimizeip = genericListPage('CF优选IP', '/optimizeip/opiplist/data', [
    { field: 'id', title: 'ID' }, { field: 'rr', title: '主机记录' },
    { field: 'ip_type', title: 'IP类型' }, { field: 'recordnum', title: '记录数' },
    { field: 'status', title: '状态' },
  ]);
  PAGES.category = genericListPage('域名分类', '/domain/category/data', [
    { field: 'id', title: 'ID' }, { field: 'name', title: '分类名' },
    { field: 'remark', title: '备注' }, { field: 'sort', title: '排序' },
  ]);
  PAGES.certaccount = genericListPage('证书账户', '/cert/account/data', [
    { field: 'id', title: 'ID' }, { field: 'name', title: '名称' },
    { field: 'type', title: '类型' }, { field: 'remark', title: '备注' },
  ]);
  PAGES.certorder = genericListPage('证书订单', '/cert/order/data', [
    { field: 'id', title: 'ID' }, { field: 'aid', title: '账户ID' },
    { field: 'status', title: '状态' }, { field: 'issuer', title: '颁发者' },
    { field: 'expiretime', title: '到期时间' }, { field: 'error', title: '错误' },
  ]);
  PAGES.deployaccount = genericListPage('证书部署任务', '/cert/deploy/data', [
    { field: 'id', title: 'ID' }, { field: 'aid', title: '账户ID' },
    { field: 'oid', title: '订单ID' }, { field: 'status', title: '状态' }, { field: 'error', title: '错误' },
  ]);
  PAGES.user = genericListPage('用户管理', '/user/data', [
    { field: 'id', title: 'ID' }, { field: 'username', title: '用户名' },
    { field: 'level', title: '等级', render: (r) => ['普通', '成员', '管理员'][r.level] || r.level },
    { field: 'is_api', title: 'API', render: (r) => r.is_api == 1 ? '开启' : '关闭' },
    { field: 'status', title: '状态', render: (r) => r.status == 1 ? '正常' : '封禁' },
    { field: 'lasttime', title: '最后登录' },
  ]);
  PAGES.log = genericListPage('操作日志', '/log/data', [
    { field: 'id', title: 'ID' }, { field: 'uid', title: '用户ID' },
    { field: 'action', title: '操作' }, { field: 'domain', title: '域名' },
    { field: 'data', title: '详情' }, { field: 'addtime', title: '时间' },
  ]);

  async function settingsPage(title, el) {
    setTitle(title);
    const res = await request('/system/configs', {}, 'GET');
    const configs = res.data || {};
    const groups = {
      'notice': { title: '通知设置', keys: ['notice_mail', 'mail_type', 'mail_smtp', 'mail_port', 'mail_name', 'mail_pwd', 'mail_apiuser', 'mail_apikey', 'mail_recv', 'webhook_url', 'tgbot_token', 'tgbot_chatid', 'custom_webhook_url', 'wechat_apptoken', 'wechat_appuid'] },
      'cron': { title: '定时任务', keys: ['cron_type', 'cron_key'] },
    };
    const g = groups[title] || groups.notice;
    el.innerHTML = `<div class="box box-primary"><div class="box-header"><h3 class="box-title">${g.title}</h3></div>
      <div class="box-body"><form id="settings-form">
      ${g.keys.map((k) => `<div class="form-group"><label>${k}</label><input class="form-control" name="${k}" value="${escapeHtml(configs[k] ?? '')}"></div>`).join('')}
      <button type="submit" class="btn btn-primary">保存</button></form></div></div>`;
    el.querySelector('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      new FormData(e.target).forEach((v, k) => data[k] = v);
      const r = await request('/system/set', data);
      layer.msg(r.msg || (r.code === 0 ? '保存成功' : '保存失败'));
    });
  }
  PAGES.notice = (el) => settingsPage('notice', el);
  PAGES.cron = (el) => settingsPage('cron', el);

  PAGES.backup = async (el) => {
    setTitle('备份恢复');
    el.innerHTML = `<div class="box box-primary"><div class="box-header"><h3 class="box-title">数据库备份与恢复</h3></div>
      <div class="box-body backup-actions">
        <p>导出当前 D1 数据库的全部数据（SQLite 格式）：</p>
        <button class="btn btn-primary" onclick="window.location='/system/backup/export'"><i class="fa fa-download"></i> 导出备份</button>
        <hr>
        <p>通过备份文件恢复（支持本系统备份及历史 MySQL mysqldump 文件）：</p>
        <div class="form-group"><input type="file" id="backup-file" accept=".sql"></div>
        <button class="btn btn-warning" id="backup-import"><i class="fa fa-upload"></i> 导入恢复</button>
        <div id="backup-msg" style="margin-top:15px"></div>
      </div></div>`;
    document.getElementById('backup-import').addEventListener('click', async () => {
      const fileEl = document.getElementById('backup-file');
      if (!fileEl.files.length) { layer.msg('请选择备份文件'); return; }
      const text = await fileEl.files[0].text();
      const msg = document.getElementById('backup-msg');
      msg.innerHTML = '<span class="text-info">正在恢复，请稍候...</span>';
      const r = await request('/system/backup/import', { sql: text });
      msg.innerHTML = `<div class="alert ${r.code === 0 ? 'alert-success' : 'alert-warning'}">${escapeHtml(r.msg)}${r.data?.errors?.length ? '<br><small>' + r.data.errors.map(escapeHtml).join('<br>') + '</small>' : ''}</div>`;
    });
  };

  // ---------- 操作弹窗 ----------
  function openModal(title, fields, onSave) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = fields.map((f) => `
      <div class="form-group"><label>${f.label}</label>
      ${f.type === 'select' ? `<select class="form-control" name="${f.name}">${(f.options || []).map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}</select>`
        : f.type === 'textarea' ? `<textarea class="form-control" name="${f.name}" rows="3">${escapeHtml(f.value ?? '')}</textarea>`
        : `<input class="form-control" type="${f.type || 'text'}" name="${f.name}" value="${escapeHtml(f.value ?? '')}">`}
      </div>`).join('');
    const saveBtn = document.getElementById('modal-save');
    const newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);
    newBtn.addEventListener('click', async () => {
      const data = {};
      new FormData(document.getElementById('modal-body').querySelector('form') || document.createElement('form'));
      document.querySelectorAll('#modal-body input,#modal-body select,#modal-body textarea').forEach((el) => data[el.name] = el.value);
      await onSave(data);
      $('#edit-modal').modal('hide');
    });
    $('#edit-modal').modal('show');
  }

  // 暴露给全局（onclick 用）
  window.app = {
    logout: async () => { await request('/logout', {}, 'GET'); location.href = '/login'; },
    editAccount: async (id) => {
      let info = {};
      if (id) { const r = await request('/account/data', { offset: 0, limit: 100 }); info = (r.rows || []).find((x) => x.id === id) || {}; }
      const types = await request('/system/configs', {}, 'GET');
      openModal(id ? '编辑账户' : '添加账户', [
        { name: 'type', label: '平台类型', type: 'select', options: (types.data?.provider_keys || ['aliyun', 'dnspod', 'cloudflare', 'huawei', 'baidu']).map((k) => ({ value: k, label: k })) },
        { name: 'name', label: '账户名称', value: info.name },
        { name: 'config', label: '配置JSON', type: 'textarea', value: info.config },
        { name: 'remark', label: '备注', value: info.remark },
      ], async (data) => {
        const r = await request('/account/' + (id ? 'edit' : 'add'), { ...data, id });
        layer.msg(r.msg || '操作完成'); navigate('account');
      });
    },
    delAccount: async (id) => { if (confirm('确定删除？')) { const r = await request('/account/del', { id }); layer.msg(r.msg); navigate('account'); } },
    editDomain: async (id) => {
      const r = await request('/domain/data', { id, offset: 0, limit: 1 });
      const info = (r.rows || [])[0] || {};
      openModal('域名配置', [
        { name: 'remark', label: '备注', value: info.remark },
        { name: 'expiretime', label: '到期时间', value: info.expiretime },
        { name: 'is_hide', label: '隐藏(0/1)', value: info.is_hide },
        { name: 'is_notice', label: '到期提醒(0/1)', value: info.is_notice },
      ], async (data) => { const res = await request('/domain/op', { act: 'edit', id, ...data }); layer.msg(res.msg); navigate('domain'); });
    },
    delDomain: async (id) => { if (confirm('确定删除域名？')) { const r = await request('/domain/op', { act: 'del', id }); layer.msg(r.msg); navigate('domain'); } },
    viewRecords: (id, name) => { navigate('record_search'); setTimeout(() => { const sel = document.getElementById('rs-domain'); if (sel) sel.value = id; }, 300); },
  };

  // 启动
  checkLogin();
})();
