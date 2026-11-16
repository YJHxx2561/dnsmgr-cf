# dnsmgr 迁移 Cloudflare 详细方案对比

> 本文基于对项目源码的逐文件审计（165 个 PHP 文件、约 4 万行代码、17 张表）得出，力求给出可落地的结论。
> 生成时间：2026-11-16

---

## 0. 一句话结论

**这个项目无法"原样搬上" Cloudflare Workers/Pages，因为它是 PHP 应用，而 Workers 只跑 JS/TS/WASM。但若接受"用 JS/TS 重写业务逻辑"，绝大多数功能（22 个 DNS 平台、MCP、通知、46/51 个部署目标）都是纯 HTTP 调用，可以高保真迁移；真正的硬骨头只有 4 类：Swoole 常驻容灾进程、ACME 的 openssl 运算、SSH/FTP/本地部署、PHP 的本地文件依赖。**

"所有功能 100% 保留 + Workers 原生 + D1"三者不可同时满足。想 100% 保留功能，只能走 Containers；想要 Workers/Pages 原生，就必须重写并接受少量功能换实现方式。

---

## 1. 项目现状审计

### 1.1 规模与技术栈

| 项目 | 数据 |
|---|---|
| 语言/框架 | PHP 8.2 + ThinkPHP 8 |
| 代码规模 | 165 个 PHP 文件，约 40,897 行 |
| 数据库 | MySQL 5.6+，17 张表（`app/sql/install.sql`） |
| 依赖扩展 | curl、ftp、gd、mbstring、openssl、pdo、sockets、ssh2（+ 运行期强依赖 Swoole） |
| 运行模型 | Nginx + PHP-FPM（Web）+ crontab（certtask 每分钟）+ Supervisor 守护 Swoole 常驻进程（dmtask）+ 文件型 session/cache/log |

### 1.2 功能模块清单（基于源码审计）

| 模块 | 实现方式 | 数量 | 迁移友好度 |
|---|---|---|---|
| DNS 平台客户端 | **全部 HTTP/HTTPS**（curl 或 Guzzle），签名为纯计算 | 22 个平台 | ✅ 高 |
| 云 SDK 客户端 | 底层 curl（HMAC/AWS V4 签名） | 14 个 | ✅ 高 |
| 证书部署目标 | HTTP API 36 + 云 SDK 10 + SSH 2 + FTP 1 + 本地 exec 1 + k8s 1 | 51 个 | ⚠️ 46 高 / 5 难 |
| ACME 证书申请 | HTTP（curl）+ **openssl 扩展** + 临时文件 + 阻塞 sleep | 4 个 CA | ❌ 需重写 |
| 通知渠道 | webhook HTTP（钉钉/飞书/企微/TG/WxPusher/QQ）+ 邮件（Sendcloud/阿里云 DM 为 HTTP，默认分支为 **SMTP socket**） | 多渠道 | ⚠️ webhook 高 / SMTP 需换 |
| MCP 接口 | **JSON-RPC 2.0 over HTTP POST**（非 SSE） | 5 类工具 | ✅ 高 |
| 容灾检测（dmtask） | **Swoole 常驻 + 协程 + 连接池 + ICMP ping / TCP socket** | 常驻进程 | ❌  hardest |
| 定时切换/优选IP/到期提醒 | crontab 每分钟跑的批处理 | 4 个 Service | ✅ 改 Cron Trigger |
| 鉴权 | **自研无状态 cookie + authcode 对称加密**（非 JWT、非服务端 session） | — | ✅ 已无状态，友好 |
| 配置缓存 | config 表 + 文件缓存（`->cache('configs',0)`） | — | ⚠️ 缓存换 KV |
| 备份/恢复 | **现有系统完全没有数据库备份导出功能** | 0 | 🆕 需从零建设 |

---

## 2. 四条路线详细对比

### 路线 A：PHP-WASM 跑在 Workers（官方 php-wasm-worker-template）

**做法**：把 PHP 解释器编译成 WASM，在 Worker 里加载现有 PHP 代码；数据库用 `php-wasm` 的 SQLite 驱动对接 D1；file session/cache/log 改到 KV。

| 维度 | 评价 |
|---|---|
| 保留 PHP 代码 | ✅ 业务代码基本不动 |
| D1 支持 | ⚠️ 需 SQLite 适配层 + 改写约 10 处 MySQL 专有 SQL |
| 定时任务 | ❌ `dmtask` 常驻协程无法运行，仍需用 Cron 重写；WASM 冷启动慢 |
| 扩展缺失 | ❌ ssh2 / sockets / ftp / **Swoole / openssl（部分）** 全部缺失——恰恰是最难的那部分一个没解决 |
| 性能与体积 | ❌ WASM 二进制数 MB，冷启动数百 ms～秒级，Workers CPU 时限下 ACME 签发这类长任务极易超时 |
| 结论 | **看似省事，实则把最难的扩展问题原样留下，还额外背上 WASM 体积/冷启动包袱。不推荐。** |

### 路线 B：TypeScript 全量重写（Workers + Pages + D1 + KV）★ 推荐

**做法**：用 TS 重写业务逻辑，跑在 Workers；静态资源托管在 Pages（或 Workers Assets）；D1 存业务数据，KV 存配置缓存/会话；Cron Trigger 驱动定时任务。

| 维度 | 评价 |
|---|---|
| Worker/Pages 双支持 | ✅ 原生支持，一套代码两种发布形态 |
| D1/KV | ✅ 原生 binding，无网络开销 |
| 功能保留 | ✅ 高保真：22 DNS 平台、46 部署目标、MCP、webhook 全部可迁移 |
| 需重写/换实现 | ⚠️ 4 类（详见第 3 节）：ACME 的 openssl→WebCrypto、dmtask 常驻→Cron+HTTP 探测、SSH/FTP/local 部署→受限、SMTP→HTTP 邮件 API |
| 性能 | ✅ 冷启动极低，无 WASM 负担 |
| 工作量 | ❌ 最大：约 4 万行 PHP 的重写，是全表最大的投入 |
| 结论 | **最贴合你的技术栈要求（Worker+Pages+D1/KV），长期最健康，但工作量大。适合"要真正云原生"的场景。** |

### 路线 C：Cloudflare Containers 跑原 PHP

**做法**：把现有 PHP Docker 镜像直接跑在 Cloudflare Containers，配 D1（走 HTTP API）或外部 MySQL（Hyperdrive / 第三方）。

| 维度 | 评价 |
|---|---|
| 功能 100% 保留 | ✅ 唯一能做到这一点的方案（Swoole/ssh2/ftp/openssl 全在） |
| Worker/Pages | ❌ 不是 Worker/Pages 运行时（虽然可共存），要求"都支持"不满足 |
| D1 | ⚠️ 容器内无原生 D1 binding，需 HTTP API 访问，有延迟与额度成本 |
| 成本 | ❌ Containers 付费，且常驻容器违背"免费 D1"的初衷 |
| 工作量 | ✅ 最小（改配置 + 部署） |
| 结论 | **功能零损失、改动最小，但不满足"Workers/Pages 原生 + 免费 D1"的核心诉求。** |

### 路线 D：折中——PHP 主体 + Workers 边缘增强

**做法**：PHP 主体继续跑在能跑 PHP 的平台（含 Containers），Workers 只做边缘缓存/API 聚合/静态 Pages。

| 维度 | 评价 |
|---|---|
| 功能保留 | ✅ 高 |
| 复杂度 | ❌ 两套系统、两套部署，维护成本最高 |
| 结论 | 一般不推荐，除非有渐进式迁移的现实约束。 |

### 对比总表

| | A. PHP-WASM | B. TS 重写 ★ | C. Containers | D. 折中 |
|---|---|---|---|---|
| Workers 原生 | ✅ | ✅ | ❌ | 部分 |
| Pages 支持 | ✅ | ✅ | ❌ | 部分 |
| D1/KV 原生 | ⚠️ 适配层 | ✅ | ❌ HTTP API | 部分 |
| 功能保留度 | ~85% | ~92% | **100%** | ~95% |
| 常驻容灾任务 | ❌ | ⚠️ 换实现 | ✅ | ✅ |
| 工作量 | 中 | **大** | 小 | 中 |
| 运行成本 | 低 | **最低** | 高 | 中 |

---

## 3. 功能逐项落地映射（关键）

### 3.1 可高保真迁移（纯 HTTP / 无状态）

- **22 个 DNS 平台**：curl/Guzzle → `fetch()`；HMAC-SHA1/V4 签名用 WebCrypto 复现（`client/Aliyun.php:79-98` 等）。
- **MCP 接口**：JSON-RPC 2.0 over POST，几乎原样映射（`McpServer.php:45`、`Mcp.php:17`）。
- **鉴权**：现有 authcode 是无状态 cookie（`common.php:87-127`），用 WebCrypto 实现对称加密即可，登录态模型不变。
- **解析记录 Excel 导入导出**：纯浏览器端 XLSX，与后端无关，不动。
- **webhook 通知**：钉钉/飞书/企微/TG/WxPusher/QQ 全是 HTTP（`MsgNotice.php:239-478`）。
- **46/51 个证书部署目标**：36 个 HTTP API + 10 个云 SDK（底层仍是 HTTP 签名）。
- **定时切换 / CF 优选 IP / 域名到期提醒**：原为 cron 批处理（`Certtask.php`），改 Cron Trigger 调用带密钥的 `/cron` 端点即可（项目已有 `cron_type=1` 的 URL 模式，`System.php:196-217`）。

### 3.2 需要换实现方式（功能可保留，做法改变）

| 功能 | 原实现 | Workers 替代方案 | 影响 |
|---|---|---|---|
| **SSL 证书签发（ACME）** | openssl_pkey_new/csr_new/x509_parse + 临时 openssl.cnf 文件 + sleep 轮询（`ACMEv2.php:37,236`、`ACMECert.php:325,618-646`） | WebCrypto 生成 ECDSA/RSA 密钥与 JWS 签名；CSR/证书解析用纯 JS（PKI.js / asn1js）；账户密钥存 D1/KV；轮询改 `scheduler.wait()` | 功能可在 Worker 内闭环，但这是**最大的重写点**；也可退而求其次把签发放到外部 ACME 服务 |
| **容灾检测（dmtask）** | Swoole `while(true)` + 协程 + `Swoole\ConnectionPool` + ICMP ping / TCP socket（`Dmtask.php:53-84`、`TaskRunner.php:59-63`） | 用 **Cron Trigger（每分钟）+ D1 里 checknexttime 调度** 取代常驻循环；HTTP(S) 检测用 fetch；**ICMP ping 和裸 TCP 检测 Workers 不支持**，需改为 HTTP 健康检查或外部探测服务 | 语义从"秒级推送"变为"分钟级轮询"；TCP/ping 两种检测协议受限 |
| **配置缓存** | `->cache('configs',0)` 文件缓存（`LoadConfig.php:44-51`） | 直接读 D1 + KV 缓存，写配置时主动失效 | 需修正 `config_set` 不清缓存的隐患 |
| **邮件（默认 SMTP）** | PHPMailer `isSMTP()`（`MsgNotice.php:210-231`） | 换用 HTTP 邮件 API（Sendcloud / 阿里云 DM 项目已支持，或 Resend 等） | 需用户配置第三方邮件服务 |

### 3.3 Workers 环境无法实现（ unavoidable 取舍）

| 功能 | 位置 | 说明 |
|---|---|---|
| SSH 证书部署 | `deploy/ssh.php`、`deploy/fnos.php` | ssh2 扩展 + TCP socket，Workers 无 SSH 能力 |
| FTP 证书部署 | `deploy/ftp.php` | ftp 扩展 + TCP socket |
| 本地文件部署 | `deploy/local.php`（含 `exec()`） | 无本地磁盘、无进程执行 |
| 在线升级 / `.env` 安装写入 | `UpdateService.php`、`Install.php:121` | 只读文件系统；改为平台级部署流程（重新 deploy） |
| 秒级容灾轮询 | `Dmtask.php` | Cron Trigger 最小粒度 1 分钟 |

> 这 5 项占全部功能的比例很小（SSH/FTP/local 仅是 51 个部署目标中的 4 个），因此对"所有功能保留"的实际影响可控——**核心的域名解析管理、证书签发、定时任务、MCP、通知都能保住**。

---

## 4. 数据库迁移设计（D1 / SQLite）

### 4.1 SQL 兼容性审计结果

全项目审计后，需要改写的 MySQL 专有语法仅约 10 处，且都好改：

| 语法 | 位置 | D1 改写 |
|---|---|---|
| `SHOW TABLES LIKE` | `common.php:634` | `SELECT name FROM sqlite_master WHERE type='table' AND name=?` |
| `REPLACE INTO`（config_set） | `common.php:245`、`Install.php:39,102` | `INSERT ... ON CONFLICT DO UPDATE` |
| `NOW()` | `Install.php:40,103`、`CertTaskService.php:26,79` | `CURRENT_TIMESTAMP` 或参数绑定 |
| `NOW() + INTERVAL n DAY` | `ExpireNoticeService.php:69,87` | `datetime('now','+N days')` 或 PHP/TS 算好传参 |
| `OPTIMIZE TABLE` | `Dmonitor.php:263` | 删除该行 |
| `select version()` | `Index.php:60` | `SELECT sqlite_version()` |
| 建表 DDL | `install.sql`、`update.sql` 全文 | 转 SQLite DDL（`INTEGER PRIMARY KEY AUTOINCREMENT`、去 `ENGINE/CHARSET/int(11) unsigned`） |

其余大量 `JOIN / whereRaw / LIMIT n,m / fieldRaw` 均为标准 SQL，SQLite 兼容。

### 4.2 备份与恢复设计（你明确要求的功能）

**现状**：项目原本**没有任何数据库备份导出功能**，所以需要新增两端：

1. **导出端**：提供"导出数据库备份"接口，把 D1 的 17 张表导出为 SQLite 兼容的 `.sql` 文件（`CREATE TABLE IF NOT EXISTS` + `INSERT OR REPLACE`），供下载保存。
2. **导入端**：系统设置页新增"导入备份恢复"——上传 `.sql` 备份文件，后端按 `;` 拆分、逐条 `D1 batch` 执行，重建数据。
3. **兼容旧备份**：如果上传的是原 MySQL 版 `mysqldump` 文件，导入时做格式转换：去反引号、`int(11) unsigned`→`INTEGER`、`ENGINE=InnoDB ...`→删除、`REPLACE INTO`→`INSERT OR REPLACE`、`NOW()`/`INTERVAL`→SQLite 写法，从而**让老系统的备份也能恢复到 D1**。
4. **注意事项**：D1 单条语句大小和 batch 条数有限制，大表导入需分批；导入前先做二次确认并覆盖写 `version` 等关键配置。

---

## 5. 工作量估算与实施计划（以路线 B 为例）

| 阶段 | 内容 | 相对工作量 |
|---|---|---|
| P0 基础设施 | TS 工程脚手架、Workers/Pages 双配置、D1 schema（17 表 SQLite 化）、KV 绑定、authcode 鉴权、config 加载 | 中 |
| P1 核心解析 | 用户/权限/域名/账号/解析记录 CRUD + 22 个 DNS 平台客户端 + 批量导入导出 | **大** |
| P2 定时任务 | Cron Trigger 化：定时切换、优选 IP、到期提醒、容灾检测的 HTTP 探测版 | 中 |
| P3 证书 | WebCrypto 版 ACME 签发 + 证书订单/域名/部署 + 46 个部署目标 | **大** |
| P4 增强 | 通知渠道、MCP 接口、Cloudflare 增强功能（tunnel/hostname）、系统设置 | 中 |
| P5 备份恢复 | 数据库导出/导入、MySQL 备份格式转换、恢复校验 | 中 |
| P6 收尾 | 静态资源迁 Pages、端到端测试、部署文档 | 中 |

> 这是数万行级别的重写工程，需要分阶段持续推进，无法一次会话完成。我可以实现一个**可运行的骨架 + 逐阶段填充**，让项目边迁移边保持可用。

---

## 6. 风险与建议

1. **最大风险是工作量**，不是技术可行性——核心难点（ACME、鉴权、SQL）都已有清晰的替代路径。
2. **容灾检测语义变化**：分钟级轮询替代秒级常驻，`ping`/`tcp` 两种检测协议在 Workers 受限，需要产品层面确认是否接受。
3. **SSH/FTP/local 部署**：这 3~4 个部署目标在 Workers 上无解，若用户强依赖，则只有 Containers 路线能 100% 满足。
4. **ACME 长任务**：Worker 的 CPU/时长上限可能让签发流程超时，需拆成多步、用 D1 记录状态机推进。

### 我的建议

- 若**核心诉求是"Worker/Pages + 免费 D1"且能接受少量功能换实现** → 选 **路线 B（TS 重写）**，我可以从 P0 开始搭建可运行骨架，逐阶段迁移。
- 若**核心诉求是"所有功能一个都不能少"** → 选 **路线 C（Containers）**，改动最小、零功能损失，但放弃 Workers 原生与免费 D1 的纯净性。
- 若**想先低成本验证** → 可选 A 做 PoC，但我不推荐作为最终方案。

---

## 附：请确认

1. 是否接受"容灾检测改为分钟级、ping/tcp 改 HTTP 探测"？
2. SSH/FTP/本地部署这 3~4 个目标是否可以放弃或换方案？
3. 备份恢复的导入源，主要是本系统新备份，还是包含历史 MySQL `mysqldump` 文件？
4. 是否接受引入第三方 HTTP 邮件服务替代默认 SMTP？
