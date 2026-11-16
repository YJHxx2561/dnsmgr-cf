/** 安装页 HTML（自包含，无外部依赖），由 GET /install 返回 */

export function installPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>安装 - 彩虹聚合DNS管理系统</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,"Microsoft YaHei",Arial,sans-serif;background:#f0f2f5;color:#333}
  .wrap{max-width:460px;margin:8vh auto;padding:0 16px}
  .brand{text-align:center;margin-bottom:24px}
  .brand h1{font-size:28px;margin:0;color:#2c3e50}
  .brand h1 b{color:#3c8dbc}
  .brand p{color:#888;font-size:14px;margin:8px 0 0}
  .card{background:#fff;border-radius:6px;box-shadow:0 1px 6px rgba(0,0,0,.12);padding:28px}
  .card h2{margin:0 0 20px;font-size:18px;font-weight:600;border-bottom:1px solid #eee;padding-bottom:12px}
  .form-group{margin-bottom:18px}
  .form-group label{display:block;font-size:14px;margin-bottom:6px;color:#555}
  .form-control{width:100%;height:40px;padding:0 12px;border:1px solid #dcdfe6;border-radius:4px;font-size:14px;outline:none}
  .form-control:focus{border-color:#3c8dbc;box-shadow:0 0 0 2px rgba(60,141,188,.15)}
  .btn{width:100%;height:42px;border:none;border-radius:4px;background:#3c8dbc;color:#fff;font-size:16px;cursor:pointer}
  .btn:hover{background:#367fa9}
  .btn:disabled{background:#a0c5da;cursor:not-allowed}
  .msg{margin-top:14px;font-size:14px;min-height:20px}
  .msg.err{color:#dd4b39}.msg.ok{color:#00a65a}
  .tips{margin-top:18px;padding:12px;background:#f9f9f9;border-radius:4px;font-size:12px;color:#888;line-height:1.7}
  .done{text-align:center;padding:20px 0}
  .done .ico{font-size:48px;color:#00a65a}
  .done a{display:inline-block;margin-top:18px;padding:10px 28px;background:#3c8dbc;color:#fff;text-decoration:none;border-radius:4px}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><h1><b>彩虹</b>聚合DNS管理系统</h1><p>Cloudflare Workers Edition · 安装向导</p></div>
  <div class="card" id="install-card">
    <h2>初始化管理员账号</h2>
    <form id="install-form">
      <div class="form-group">
        <label>管理员用户名</label>
        <input class="form-control" type="text" id="admin_username" placeholder="请输入用户名" required autofocus>
      </div>
      <div class="form-group">
        <label>密码</label>
        <input class="form-control" type="password" id="admin_password" placeholder="请输入密码（至少6位）" required minlength="6">
      </div>
      <div class="form-group">
        <label>确认密码</label>
        <input class="form-control" type="password" id="admin_password2" placeholder="请再次输入密码" required minlength="6">
      </div>
      <button class="btn" type="submit" id="submit-btn">开始安装</button>
      <div class="msg" id="msg"></div>
    </form>
    <div class="tips">
      安装程序会自动初始化 D1 数据库表结构并创建超级管理员。<br>
      如需从旧系统恢复数据，安装后到「系统 → 备份恢复」上传 MySQL 备份文件即可。
    </div>
  </div>
</div>
<script>
(function(){
  var form=document.getElementById('install-form');
  var msg=document.getElementById('msg');
  var btn=document.getElementById('submit-btn');
  form.addEventListener('submit',async function(e){
    e.preventDefault();
    msg.textContent='';msg.className='msg';
    var u=document.getElementById('admin_username').value.trim();
    var p=document.getElementById('admin_password').value;
    var p2=document.getElementById('admin_password2').value;
    if(!u||!p){msg.textContent='用户名和密码不能为空';msg.className='msg err';return;}
    if(p!==p2){msg.textContent='两次输入的密码不一致';msg.className='msg err';return;}
    if(p.length<6){msg.textContent='密码至少6位';msg.className='msg err';return;}
    btn.disabled=true;btn.textContent='正在安装...';
    try{
      var resp=await fetch('/install',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({admin_username:u,admin_password:p})
      });
      var res=await resp.json();
      if(res.code===1){
        msg.textContent='安装成功，正在跳转...';msg.className='msg ok';
        setTimeout(function(){location.href='/';},800);
      }else{
        msg.textContent=res.msg||'安装失败';msg.className='msg err';
        btn.disabled=false;btn.textContent='开始安装';
      }
    }catch(err){
      msg.textContent='网络错误：'+err.message;msg.className='msg err';
      btn.disabled=false;btn.textContent='开始安装';
    }
  });
})();
</script>
</body>
</html>`;
}

/** 已安装时的提示页 */
export function installedPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>已安装 - 彩虹聚合DNS</title>
<style>body{font-family:-apple-system,"Microsoft YaHei",Arial,sans-serif;background:#f0f2f5;text-align:center;padding:15vh 16px;color:#333}
.box{background:#fff;max-width:480px;margin:0 auto;padding:40px;border-radius:6px;box-shadow:0 1px 6px rgba(0,0,0,.12)}
.box h1{font-size:22px;color:#00a65a}.box p{color:#888;line-height:1.8}
a{display:inline-block;margin-top:16px;padding:10px 28px;background:#3c8dbc;color:#fff;text-decoration:none;border-radius:4px}</style>
</head><body><div class="box"><h1>系统已安装</h1>
<p>当前系统已完成安装。如需重新安装，请先清空 D1 数据库中的所有数据表。</p>
<a href="/">返回首页</a></div></body></html>`;
}
