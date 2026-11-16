# 彩虹聚合DNS管理系统 · Cloudflare 版

> 本仓库是 [dnsmgr](https://github.com/netcccyun/dnsmgr) 的 **Cloudflare Workers 原生版本**（TypeScript 重写）。Worker 项目位于**仓库根目录**。

后端 API + 定时任务运行在 Cloudflare Workers，前端由 Worker Assets 托管，数据存 D1（免费 SQLite），缓存存 KV。保留多用户权限、22 个 DNS 平台、解析记录实时管理、容灾切换、定时切换、通知、MCP、数据库备份/恢复（兼容历史 MySQL dump）等核心功能。

## 🚀 部署教程（推送代码即自动部署，无需新建仓库）

部署后访问 `https://<你的worker域名>/install` 创建管理员账号即可使用。

> 💡 **关于「Deploy to Cloudflare」按钮**：该按钮是 Cloudflare 官方提供的**项目分发**工具，它的机制是**把仓库克隆一份到你的 GitHub 账号**再部署，因此一定会新建仓库。如果你就是本仓库的拥有者、想直接部署**当前仓库**，请用下面的**方式一（Workers Builds）**或**方式二（GitHub Actions）**——两者都不会新建仓库，且 push 后自动部署。文末附有按钮的说明。

### 方式一：Workers Builds（推荐，Dashboard 直接连接现有仓库，不用 API Token）

这是 Cloudflare 官方的 Git 集成：**在 Dashboard 里连接你现有的这个仓库**，授权后即可 push 自动部署，全程不用手动建 API Token。

**第 1 步：创建 D1 数据库和 KV 命名空间**（各一次）
- Dashboard → **D1** → Create database，名称填 `dnsmgr`，创建后复制它的 **Database ID**
- Dashboard → **Workers KV** → Create namespace，名称填 `dnsmgr_kv`，创建后复制它的 **Namespace ID**

**第 2 步：把两个 ID 填入配置并提交**
编辑仓库根目录的 `wrangler.toml`，把占位符替换成上一步的 ID：
```toml
[[d1_databases]]
database_id = "这里填D1的Database ID"
[[kv_namespaces]]
id = "这里填KV的Namespace ID"
```
然后 `git add wrangler.toml && git commit -m "config: 填入D1/KV资源ID" && git push`。

**第 3 步：在 Dashboard 连接仓库**
- Dashboard → **Workers & Pages** → **Create** → **Import from GitHub**（或"从 Git 仓库导入"）
- 首次会引导安装/授权 **Cloudflare Workers & Pages** GitHub App，选择本仓库 `dnsmgr-cf`
- 构建配置：
  - **Root directory**：留空（或 `/`，因为 Worker 就在仓库根目录）
  - **Build command**：留空
  - **Deploy command**：`npm run deploy`（会先执行幂等 D1 迁移，再部署 Worker）
- 点击 **Save and Deploy**

**第 4 步：完成**
之后每次 `git push` 到 `main` 都会自动重新部署；部署日志在 Worker 的 **Builds** 标签页查看。访问 Worker 域名 `/install` 创建管理员。
（可选）在 Worker → Settings → Variables and Secrets 添加 `SYS_KEY` 随机字符串增强 cookie 加密，不填会自动生成。

### 方式二：GitHub Actions（push 自动部署）

> ✅ **推荐方式**：用你现有的这个仓库即可，**不需要新建仓库**。配置一次 Secrets 后，以后每次 `git push` 到 `main` 都会自动完成部署。

仓库已内置 `.github/workflows/deploy-cloudflare.yml`，Worker 在仓库根目录，无需设置子目录。工作流会**自动创建 D1/KV 资源（若不存在）并注入 ID**，所以你不用手动建库。

1. 在**当前仓库** **Settings → Secrets and variables → Actions → Secrets** 添加两个 Secret：
   - `CLOUDFLARE_API_TOKEN`：API 令牌
     - 生成：Cloudflare Dashboard → 头像 → My Profile → API Tokens → Create Token → 用模板 **Edit Cloudflare Workers**（或自定义，需包含 `Workers Scripts:Edit`、`D1:Edit`、`Workers KV Storage:Edit` 权限）
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID（Dashboard 右侧栏可见）
2. （可选）在 **Variables** 添加 `CF_D1_DATABASE_ID` / `CF_KV_NAMESPACE_ID` 以复用已有资源；不填则自动创建/复用同名 `dnsmgr` / `dnsmgr_kv`。
3. 触发部署：
   - **自动**：`git push` 到 `main`（改动 `src/`、`web/`、`migrations/`、`wrangler.toml` 等时触发）
   - **手动**：Actions 页 → **Deploy dnsmgr to Cloudflare** → Run workflow
4. 工作流步骤：安装依赖 → 自动准备 D1/KV 并注入 ID → 应用幂等数据库迁移 → 部署 Worker。
5. 每次 push 后到 Actions 页可看到实时构建日志；部署完成后访问 Worker 域名即可。

### 方式三：本地 CLI（wrangler）

```bash
npm install
npx wrangler login                            # 首次登录授权
# 创建资源并把返回的 ID 填入 wrangler.toml
npx wrangler d1 create dnsmgr
npx wrangler kv namespace create dnsmgr_kv
npx wrangler d1 migrations apply DB --local   # 本地调试用
npm run dev                                   # 本地开发 http://localhost:8787
npm run deploy                                # 部署：自动迁移 + 部署
```

`npm run deploy` = `wrangler d1 migrations apply DB --remote && wrangler deploy`，迁移幂等可重复执行，不会清空数据。

### 关于定时任务

`wrangler.toml` 已配置 `crons = ["* * * * *"]`，Cloudflare 每分钟自动触发容灾检测、定时切换、证书续签、到期提醒。也可访问 `https://<worker域名>/cron?key=<后台cron_key>` 手动触发。

### 从旧系统恢复数据

登录后台 → **系统 → 备份恢复**，上传原 PHP 系统导出的 MySQL `.sql` 备份，系统会自动转换为 D1/SQLite 语法并恢复，历史数据无缝迁移。

### 常见问题

| 现象 | 解决 |
|---|---|
| `Could not read package.json` | 确认 Worker 在仓库根目录构建（本仓库已配置好，无需子目录）。 |
| `no such table` | 执行 `npx wrangler d1 migrations apply DB --remote` 或访问 `/install`。 |
| 登录后退出 | 配置 `SYS_KEY`，清理浏览器 Cookie 重试。 |
| Action 报 database_id 错误 | 配置 `CF_D1_DATABASE_ID` / `CF_KV_NAMESPACE_ID` Variables，或手填 `wrangler.toml`。 |
| 一键按钮会新建仓库 | 这是按钮的官方机制（用于分发项目）。要部署当前仓库请用方式一 Workers Builds 或方式二 GitHub Actions。 |

### 关于「Deploy to Cloudflare」一键按钮

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YJHxx2561/dnsmgr-cf)

这个按钮的用途是**把本项目分发给别人**：点击者点击后，Cloudflare 会把仓库**克隆一份到他自己的 GitHub 账号**，再自动创建资源并部署。因此它**一定会新建仓库**，这是 Cloudflare 的设计，无法通过修改项目配置改变。

- 如果你是本仓库拥有者、想部署**当前仓库** → 用上面的**方式一**或**方式二**（都不新建仓库，push 自动部署）。
- 如果你想把项目分享给别人一键体验 → 保留此按钮即可；别人点击后会自动在其账号克隆并部署。
- 若按钮链接指向的不是你 fork 的仓库，把链接里的 `YJHxx2561/dnsmgr-cf` 换成 `<你的用户名>/<仓库名>`。

---

## 原项目说明（PHP 版本）

以下是原 ThinkPHP 项目的功能介绍与传统部署方式（本 Cloudflare 版本不依赖这些内容）。

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/netcccyun/dnsmgr?style=flat)](https://github.com/netcccyun/dnsmgr/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/netcccyun/dnsmgr?style=flat)](https://github.com/netcccyun/dnsmgr/forks)
[![Docker Pulls](https://img.shields.io/docker/pulls/netcccyun/dnsmgr?style=flat)](https://hub.docker.com/r/netcccyun/dnsmgr)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/netcccyun/dnsmgr)](https://github.com/netcccyun/dnsmgr/releases)
[![GitHub last commit](https://img.shields.io/github/last-commit/netcccyun/dnsmgr)](https://github.com/netcccyun/dnsmgr/commits/main)

</div>

彩虹聚合DNS管理系统 是一款基于ThinkPHP开发的网站程序，可实现在单一网站内管理多个平台的域名解析，目前已支持的域名解析平台有：阿里云、腾讯云、华为云、百度云、西部数码、火山引擎、DNSLA、CloudFlare、AWS Route 53、Namesilo、PowerDNS

## 功能特性

- 多用户管理，可为每个用户可分配不同的域名解析权限；
- 提供API接口，可获取域名单独的登录链接，方便各种IDC系统对接；
- 容灾切换功能，支持ping、tcp、http(s)检测协议并自动暂停/修改域名解析，并支持发送通知；
- 定时切换功能，设置在指定时间/周期，自动修改/开启/暂停/删除域名解析；
- CF优选IP功能，支持获取最新的Cloudflare优选IP，并自动更新到解析记录；
- SSL证书申请与自动部署功能，支持从Let's Encrypt等渠道申请SSL证书，并自动部署到各种面板、云服务商、服务器等；
- 支持邮件、微信公众号、Telegram、钉钉、飞书、企业微信等多种通知渠道；
- 提供MCP接口，可通过 AI Agent管理域名解析、容灾切换、SSL证书等功能。

## 部署方式

### 自部署

可以使用宝塔、Kangle等任意支持PHP-MySQL的环境部署

* 从[Release](https://github.com/netcccyun/dnsmgr/releases)页面下载安装包

* 运行环境要求PHP8.0+，MySQL5.6+

* 设置网站运行目录为`public`

* 设置伪静态为`ThinkPHP`

* 如果是下载的Source code包，还需Composer安装依赖（Release页面下载的安装包不需要）

  ```
  composer install --no-dev
  ```

* 访问网站，会自动跳转到安装页面，根据提示安装完成

* 访问首页登录控制面板

* 后续更新方式：重新下载安装包上传覆盖即可

##### 伪静态规则

* Nginx

```
location ~* (runtime|application)/ {
    return 403;
}
location / {
    if (!-e $request_filename) {
        rewrite ^(.*)$ /index.php?s=$1 last; break;
    }
}
```

* Apache

```
<IfModule mod_rewrite.c>
  Options +FollowSymlinks -Multiviews
  RewriteEngine On

  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^(.*)$ index.php/$1 [QSA,PT,L]
</IfModule>
```

### Docker 部署

首先需要安装Docker，然后执行以下命令拉取镜像并启动（启动后监听8081端口）：

```
docker run --name dnsmgr -dit -p 8081:80 -v /var/dnsmgr:/app/www netcccyun/dnsmgr
```

访问并安装好后如果容灾切换未自动启动，重启容器即可：

```
docker restart dnsmgr
```

从国内镜像地址拉取：

```
docker pull swr.cn-east-3.myhuaweicloud.com/netcccyun/dnsmgr:latest
```

### docker-compose 部署

```
services:
  dnsmgr-web:
    container_name: dnsmgr-web
    stdin_open: true
    tty: true
    ports:
      - 8081:80
    volumes:
      - ./web:/app/www
    image: netcccyun/dnsmgr
    depends_on:
      - dnsmgr-mysql
    networks:
      - dnsmgr-network

  dnsmgr-mysql:
    container_name: dnsmgr-mysql
    restart: always
    ports:
      - 3306:3306
    volumes:
      - ./mysql/conf/my.cnf:/etc/mysql/my.cnf
      - ./mysql/logs:/logs
      - ./mysql/data:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=123456
      - TZ=Asia/Shanghai
    image: mysql:5.7
    networks:
      - dnsmgr-network

networks:
  dnsmgr-network:
    driver: bridge
```

在运行之前请创建好目录

```
mkdir -p ./web
mkdir -p ./mysql/conf
mkdir -p ./mysql/logs
mkdir -p ./mysql/data

vim mysql/conf/my.cnf
[mysqld]
sql_mode=STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION
```

登陆mysql容器创建数据库

```
docker exec -it dnsmgr-mysql /bin/bash
mysql -uroot -p123456
create database dnsmgr;
```

在install界面链接IP填写dnsmgr-mysql

## 演示截图

添加域名账户

![](https://p0.meituan.net/csc/090508cdc7aaabd185ba9c76a8c099f9283946.png)

域名管理列表

![](https://p0.meituan.net/csc/60bf3f607d40f30f152ad1f6ee3be098357839.png)

域名DNS解析管理，支持解析批量操作

![](https://p0.meituan.net/csc/f99c599d4febced404c88672dd50d62c212895.png)

用户管理添加用户，支持为用户开启API接口

![](https://p0.meituan.net/csc/d1bd90bedca9b6cbc5da40286bdb5cd5228438.png)

CF优选IP功能，添加优选IP任务

![](https://p1.meituan.net/csc/da70c76753aee4bce044d16fadd56e5f217660.png)

SSL证书申请功能

![](https://blog.cccyun.cn/content/uploadfile/202412/QQ%E6%88%AA%E5%9B%BE20241221154857.png)

![](https://blog.cccyun.cn/content/uploadfile/202412/QQ%E6%88%AA%E5%9B%BE20241221154652.png?a)

SSL证书自动部署功能

![](https://blog.cccyun.cn/content/uploadfile/202412/QQ%E6%88%AA%E5%9B%BE20241221154702.png)

![](https://blog.cccyun.cn/content/uploadfile/202412/QQ%E6%88%AA%E5%9B%BE20241221154804.png)

## 支持与反馈

🌐 作者信息：消失的彩虹海(https://blog.cccyun.cn)

⭐ 如果您觉得本项目对您有帮助，欢迎给项目点个 Star

🤝 捐赠：

<img height="240" src="https://wkphoto.bj.bcebos.com/d8f9d72a6059252db065f556249b033b5bb5b976.jpg">

### 其他推荐

- [彩虹云主机 - 免备案CDN/虚拟主机](https://www.cccyun.net/)
- [小白云高防云服务器](https://www.xiaobaiyun.cn/aff/GMLPMFOV)

