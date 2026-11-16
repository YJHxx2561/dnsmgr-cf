# dnsmgr Cloudflare 版本（Workers + Pages + D1 + KV）

这是彩虹聚合 DNS 管理系统的 **Cloudflare Workers 原生版本**，用 TypeScript 全量重写，保留原系统的核心功能。

## 部署方式一览

| 方式 | 适合人群 | 难度 | 是否需要本地环境 | 自动建库 |
|---|---|---|---|---|
| [① 一键部署按钮](#方式一一键部署按钮 deploy-to-cloudflare) | 想最快上线 | ⭐ | 不需要 | ✅ 自动 |
| [② GitHub Actions](#方式二github-actions-部署) | 想 push 自动部署、可定制 | ⭐⭐ | 不需要 | 需先创建 |
| [③ 本地 CLI](#方式三本地-cli-部署wrangler) | 开发调试 | ⭐⭐ | 需要 Node.js | 需先创建 |

> 三种方式部署的都是同一个 Worker（后端 API + 前端静态资源 + 定时任务）。前端静态资源已内置在 `worker/public/`，所以**只需部署 Worker 一个项目**，无需单独建 Pages 项目。

---

## 方式一：一键部署按钮（Deploy to Cloudflare）

这是 Cloudflare 官方的一键部署能力：点击按钮 → 授权 GitHub → Cloudflare 自动把本项目的 `cloudflare/worker` 目录克隆到你自己的 GitHub 仓库，**自动创建并绑定 D1 数据库与 KV 命名空间**，自动执行数据库初始化，然后部署上线。全程无需命令行。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YJHxx2561/dnsmgr/tree/main/cloudflare/worker)

### 操作步骤

1. **前置条件**
   - 拥有一个 Cloudflare 账号（[免费注册](https://dash.cloudflare.com/sign-up)）
   - 拥有一个 GitHub 账号（仓库必须是 public，Cloudflare 才能克隆）
   - 本项目当前仓库地址：`https://github.com/YJHxx2561/dnsmgr`
     - 如果你 fork 到了自己的账号，请把上面按钮链接里的仓库地址换成你自己的：`?url=https://github.com/<你的用户名>/dnsmgr/tree/main/cloudflare/worker`

2. **点击上方按钮**，进入 Cloudflare 的部署配置页。

3. **填写配置**（Cloudflare 会自动预填，可按需修改）：
   - **Repository name**：克隆到你 GitHub 的新仓库名，默认 `dnsmgr-worker`
   - **Worker name**：部署的 Worker 名称，默认 `dnsmgr`
   - **D1 database / KV namespace**：资源名称，Cloudflare 会自动创建
   - **Build command**：留空即可（本项目是纯 TS，无需额外构建）
   - **Deploy command**：保持默认 `npm run deploy`
     - 该脚本会先执行 `wrangler d1 migrations apply DB --remote`（幂等建表，不删数据），再 `wrangler deploy`

4. 点击 **Deploy**。Cloudflare 会自动：克隆仓库 → 创建 D1/KV 并写入配置 → 初始化数据库 → 部署 Worker。

5. **完成安装**：部署成功后，访问 `https://<你的worker名>.<你的子域>.workers.dev/install`，填写管理员用户名密码，完成初始化。

6. **配置密钥（可选但推荐）**：在 Cloudflare Dashboard → 你的 Worker → **Settings → Variables and Secrets** 中添加 `SYS_KEY`（一串随机字符串），用于登录 cookie 加密。不填也能用，系统会在首次安装时自动生成并存入 D1。

### 一键部署注意事项

- **自动更新**：Cloudflare 会为克隆出的新仓库配置 Workers Builds，此后你 `git push` 到该仓库会自动重新部署。
- **子目录说明**：本项目的 Worker 代码在 `cloudflare/worker`，是**完全自包含**的（前端静态资源已复制到 `worker/public/`），所以克隆后能独立构建。
- **资源 ID**：一键部署时 Cloudflare 会自动把新创建的 D1/KV 的 ID 写入克隆仓库的 `wrangler.toml`，你无需手动填写。
- **限制**：一键部署按钮仅支持 public 仓库和 Workers（不支持私有仓库、不支持纯 Pages 项目）。

---

## 方式二：GitHub Actions 部署

适合希望**自己掌控仓库、push 即自动部署**的场景。仓库中已内置工作流 `.github/workflows/deploy-cloudflare.yml`。

### 第一步：创建 Cloudflare 资源

在本项目 `cloudflare/worker` 目录，用 Wrangler 创建 D1 和 KV（如已创建可跳过）：

```bash
cd cloudflare/worker
npm install
npx wrangler d1 create dnsmgr
npx wrangler kv namespace create dnsmgr_kv
```

命令会输出 `database_id` 和 `id`，记下它们。

### 第二步：配置 GitHub Secrets / Variables

进入你的 GitHub 仓库 → **Settings → Secrets and variables → Actions**：

**Secrets（必填）**：

| Secret 名 | 值 | 获取方式 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌 | Dashboard → 右上角头像 → **My Profile → API Tokens → Create Token**，使用模板 **Edit Cloudflare Workers**，或自定义权限：`Account / Workers Scripts:Edit`、`Account / D1:Edit`、`Account / Workers KV Storage:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | 账户 ID | Dashboard 右侧栏，或 Worker 页面 URL 中的那一串 32 位字符 |

**Variables（二选一，推荐）**：

| Variable 名 | 值 |
|---|---|
| `CF_D1_DATABASE_ID` | 第一步拿到的 D1 `database_id` |
| `CF_KV_NAMESPACE_ID` | 第一步拿到的 KV `id` |

> 配置了这两个 Variables，工作流会自动替换 `wrangler.toml` 中的占位符，**无需修改源码**。
> 如果不配置 Variables，则需要手动编辑 `cloudflare/worker/wrangler.toml`，把 `REPLACE_WITH_YOUR_D1_DATABASE_ID` 和 `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` 替换成真实 ID。

### 第三步：触发部署

工作流在以下情况触发：
- **手动**：Actions 标签页 → 选择 **Deploy dnsmgr to Cloudflare** → **Run workflow**
- **自动**：push 到 `main` 分支且改动了 `cloudflare/worker/**`

工作流会依次执行：安装依赖 → 注入资源 ID → 应用 D1 迁移（幂等） → 部署 Worker。

### 第四步：完成安装

部署成功后访问 `https://<worker域名>/install` 创建管理员账号；如需 SYS_KEY，在 Worker 的 Settings → Variables and Secrets 里添加。

---

## 方式三：本地 CLI 部署（wrangler）

适合本地开发调试。

### 前置：Node.js 18+ 与 Wrangler 登录

```bash
node -v               # 需 >= 18
cd cloudflare/worker
npm install
npx wrangler login    # 浏览器授权 Cloudflare 账号
```

### 创建资源并填写 ID

```bash
npx wrangler d1 create dnsmgr
npx wrangler kv namespace create dnsmgr_kv
```

把输出的两个 ID 分别填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "dnsmgr"
database_id = "这里填D1的ID"

[[kv_namespaces]]
binding = "KV"
id = "这里填KV的ID"
```

### 本地调试

```bash
npx wrangler d1 migrations apply DB --local   # 初始化本地数据库
npm run dev                                   # 启动本地服务 http://localhost:8787
```

### 部署上线

```bash
npm run deploy
```

该命令等价于：`wrangler d1 migrations apply DB --remote && wrangler deploy`。数据库迁移是幂等的，重复执行不会清空数据。

---

## 初始化与管理员账号

三种方式部署后，都需要访问一次安装页创建管理员：

```
https://<你的worker域名>/install
```

提交管理员用户名和密码即可。系统会自动建表（若迁移未执行）、写入 `sys_key` 并创建 level=2 的超级管理员。

> **从旧系统恢复数据**：如果你有原 PHP 系统的 MySQL 备份（`mysqldump` 导出的 `.sql`），可在登录后台后进入 **系统 → 备份恢复**，直接上传该 `.sql` 文件恢复。系统会自动把 MySQL 语法转换为 D1/SQLite 语法（含 `REPLACE INTO`、`int(11) unsigned auto_increment`、`ENGINE=`、`NOW()` 等），历史数据可无缝迁移。恢复后需用原账号密码登录。

---

## 定时任务（Cron）

`wrangler.toml` 已配置 `crons = ["* * * * *"]`，Cloudflare 每分钟自动触发一次定时任务（容灾检测、定时切换、证书续签、到期提醒等），**替代原 PHP 的 crontab + Swoole 常驻进程**。

也可带密钥手动触发：`GET https://<worker域名>/cron?key=<后台配置的 cron_key>`。若未配置 `cron_key`，则无需 key。

---

## 目录结构

```
cloudflare/
├── worker/                    # Cloudflare Worker（后端 API + 定时任务 + 前端），一键部署入口
│   ├── src/                   # TS 源码
│   │   ├── index.ts           # 入口：路由 + Cron Trigger + 静态资源兜底
│   │   ├── types.ts           # 类型定义
│   │   ├── core/              # 路由框架、响应、配置层
│   │   ├── db/                # D1 访问层 + schema.sql（17 张表）
│   │   ├── auth/              # 鉴权（兼容原 authcode cookie / API / MCP）
│   │   ├── dns/               # DNS 平台客户端（22 个平台元数据 + 4 个实现）
│   │   │   ├── meta.ts        #   从 PHP DnsHelper 提取的全部平台配置
│   │   │   ├── providers/     #   cloudflare / aliyun / dnspod / generic
│   │   ├── services/          # 定时任务、ACME 证书、MCP
│   │   ├── notify/            # HTTP webhook 通知
│   │   ├── routes/            # 各业务路由
│   │   └── utils/             # 加密(authcode/md5/bcrypt)、签名、TOTP
│   ├── migrations/            # D1 幂等初始化迁移
│   │   └── 0001_init.sql      #   CREATE TABLE IF NOT EXISTS，可安全重复执行
│   ├── public/                # 前端静态资源（自包含，供 Worker Assets 托管）
│   │   ├── index.html         #   SPA 入口
│   │   ├── app.js             #   前端逻辑
│   │   └── static/            #   复用原项目的 CSS/JS/图片
│   ├── wrangler.toml          # Worker 配置（D1/KV/Cron/Assets 绑定）
│   └── package.json           # 含 cloudflare 元数据 + deploy 脚本（自动迁移）
└── pages/                     # 前端静态资源副本（供单独部署 Pages 或参考）
    └── public/
```

---

## 功能保留情况

| 功能 | 状态 | 说明 |
|---|---|---|
| 多用户/权限/登录/TOTP | ✅ | authcode cookie 与 PHP 完全一致，历史密码哈希(bcrypt)兼容 |
| DNS 账户 / 域名管理 | ✅ | — |
| 22 个 DNS 平台元数据 | ✅ | 全部平台字段定义完整保留（前端表单可用） |
| 解析记录增删改查 | ✅ | **实时从平台拉取**（与原系统一致，不存本地库） |
| Cloudflare / 阿里云 / 腾讯云 provider | ✅ | 原生实现（HMAC-SHA1 / TC3 签名） |
| 其他 19 个平台 | ⚠️ | 通用 REST 适配器（需按各平台 API 补充映射，见 `dns/providers/generic.ts`） |
| 容灾切换 | ✅ | cron 分钟级 + HTTP(S) 探测（ping/tcp 改为 HTTP 探测，已确认可接受） |
| 定时切换 / 优选 IP / 到期提醒 | ✅ | cron 触发 |
| SSL 证书签发 | ⚠️ | ACME v2 + WebCrypto 骨架（DNS-01/HTTP-01 验证记录写入待按平台补全） |
| 证书部署 46/51 目标 | ⚠️ | HTTP API 目标可迁移；SSH 部署见下方 |
| 通知（钉钉/飞书/企微/TG/WxPusher/自定义） | ✅ | 纯 HTTP webhook |
| 邮件 | ⚠️ | 改为 HTTP 邮件 API（Sendcloud/阿里云 DM），不再用 SMTP |
| MCP 接口 | ✅ | JSON-RPC 2.0 over HTTP，工具集可用 |
| 备份导出/导入恢复 | ✅ | SQLite dump + **历史 MySQL mysqldump 格式自动转换** |
| SSH 部署 | 🔜 | 可用 `cloudflare:sockets` + 纯 TS SSH 客户端实现（参考 CF-Workers-WebSSH） |

---

## 常见问题排查

| 现象 | 原因与解决 |
|---|---|
| 部署后访问报 `D1_ERROR: no such table` | 数据库未初始化。执行 `npx wrangler d1 migrations apply DB --remote`，或访问 `/install` 让它建表。 |
| 登录后立即退出 / 提示未登录 | 检查是否已配置 `SYS_KEY`；清理浏览器 Cookie 后重试。 |
| GitHub Action 报 `database_id` 相关错误 | 未配置 `CF_D1_DATABASE_ID` Variable，且 `wrangler.toml` 里还是占位符。按方式二第二步配置。 |
| 一键部署构建失败 | 确认部署的是子目录 `cloudflare/worker`（URL 带 `/tree/main/cloudflare/worker`），该目录已自包含。 |
| 验证码不显示 | `/verifycode` 返回 SVG，检查浏览器是否拦截；可在后台把 `vcode` 设为 `2` 关闭。 |
| 定时任务没执行 | 确认 `wrangler.toml` 的 `[triggers] crons` 存在；本地 Miniflare 不会自动触发 cron，需用 `--test-scheduled` 或访问 `/cron`。 |

---

## 已知限制与后续工作

1. **19 个非原生 provider**：`generic.ts` 提供了 REST 适配器框架，需要按各平台 API 补充路径/字段映射。
2. **ACME 证书验证**：`cert.ts` 已实现账户注册/订单创建/JWS 签名骨架，DNS-01 验证记录的添加/清理需按 DNS 平台补全。
3. **SSH 部署**：Workers 上可用 `cloudflare:sockets` + 纯 TS SSH 客户端（参考 `cmliu/CF-Workers-WebSSH`）实现，可作为后续独立模块接入。
4. **Workers 时长限制**：ACME 签发等长任务已设计为 D1 状态机分步推进，避免单次请求超时。

## 本地开发命令

```bash
npm run dev          # 启动本地 Worker（Miniflare 模拟 D1/KV）
npm run typecheck    # 类型检查
npm run build        # 构建检查
npm run db:migrations:local  # 应用本地数据库迁移
```

详细迁移方案与取舍说明见 [`../docs/CLOUDFLARE_MIGRATION_PLAN.md`](../docs/CLOUDFLARE_MIGRATION_PLAN.md)。
