-- ============================================================================
-- dnsmgr D1 (SQLite) 数据库结构
-- 由 app/sql/install.sql (MySQL) 精确转换为 SQLite 语法：
--   - int(11) unsigned NOT NULL auto_increment -> INTEGER PRIMARY KEY AUTOINCREMENT
--   - ENGINE=InnoDB DEFAULT CHARSET=utf8mb4  -> 移除（SQLite 默认 UTF-8）
--   - KEY `xxx` (`col`)                       -> CREATE INDEX
--   - datetime / tinyint / varchar / text     -> SQLite 亲和类型
-- 表前缀固定为 dnsmgr_，与原系统一致，方便历史数据导入。
-- ============================================================================

DROP TABLE IF EXISTS dnsmgr_config;
CREATE TABLE dnsmgr_config (
  `key`   TEXT PRIMARY KEY,
  `value` TEXT
);
INSERT INTO dnsmgr_config (`key`,`value`) VALUES
  ('version','1049'),('notice_mail','0'),('notice_wxtpl','0'),
  ('mail_smtp','smtp.qq.com'),('mail_port','465');

DROP TABLE IF EXISTS dnsmgr_account;
CREATE TABLE dnsmgr_account (
  `id`      INTEGER PRIMARY KEY AUTOINCREMENT,
  `type`    TEXT NOT NULL,
  `name`    TEXT NOT NULL,
  `config`  TEXT,
  `remark`  TEXT,
  `addtime` TEXT
);

DROP TABLE IF EXISTS dnsmgr_domain;
CREATE TABLE dnsmgr_domain (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `aid`         INTEGER NOT NULL,
  `cid`         INTEGER NOT NULL DEFAULT 0,
  `name`        TEXT NOT NULL,
  `thirdid`     TEXT,
  `addtime`     TEXT,
  `is_hide`     INTEGER NOT NULL DEFAULT 0,
  `is_sso`      INTEGER NOT NULL DEFAULT 0,
  `recordcount` INTEGER NOT NULL DEFAULT 0,
  `remark`      TEXT,
  `is_notice`   INTEGER NOT NULL DEFAULT 0,
  `regtime`     TEXT,
  `expiretime`  TEXT,
  `checktime`   TEXT,
  `noticetime`  TEXT,
  `checkstatus` INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_domain_name ON dnsmgr_domain(`name`);
CREATE INDEX idx_domain_cid  ON dnsmgr_domain(`cid`);

DROP TABLE IF EXISTS dnsmgr_user;
CREATE TABLE dnsmgr_user (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `username`    TEXT NOT NULL,
  `password`    TEXT NOT NULL,
  `is_api`      INTEGER NOT NULL DEFAULT 0,
  `apikey`      TEXT,
  `level`       INTEGER NOT NULL DEFAULT 0,
  `regtime`     TEXT,
  `lasttime`    TEXT,
  `totp_open`   INTEGER NOT NULL DEFAULT 0,
  `totp_secret` TEXT,
  `status`      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_user_username ON dnsmgr_user(`username`);

DROP TABLE IF EXISTS dnsmgr_permission;
CREATE TABLE dnsmgr_permission (
  `id`     INTEGER PRIMARY KEY AUTOINCREMENT,
  `uid`    INTEGER NOT NULL,
  `domain` TEXT NOT NULL,
  `sub`    TEXT
);
CREATE INDEX idx_permission_uid ON dnsmgr_permission(`uid`);

DROP TABLE IF EXISTS dnsmgr_log;
CREATE TABLE dnsmgr_log (
  `id`      INTEGER PRIMARY KEY AUTOINCREMENT,
  `uid`     INTEGER NOT NULL,
  `action`  TEXT NOT NULL,
  `domain`  TEXT NOT NULL DEFAULT '',
  `data`    TEXT,
  `addtime` TEXT NOT NULL
);
CREATE INDEX idx_log_uid    ON dnsmgr_log(`uid`);
CREATE INDEX idx_log_domain ON dnsmgr_log(`domain`);

DROP TABLE IF EXISTS dnsmgr_dmtask;
CREATE TABLE dnsmgr_dmtask (
  `id`            INTEGER PRIMARY KEY AUTOINCREMENT,
  `did`           INTEGER NOT NULL,
  `rr`            TEXT NOT NULL,
  `recordid`      TEXT NOT NULL,
  `type`          INTEGER NOT NULL DEFAULT 0,
  `main_value`    TEXT,
  `backup_value`  TEXT,
  `checktype`     INTEGER NOT NULL DEFAULT 0,
  `checkurl`      TEXT,
  `tcpport`       INTEGER,
  `frequency`     INTEGER NOT NULL,
  `cycle`         INTEGER NOT NULL DEFAULT 3,
  `timeout`       INTEGER NOT NULL DEFAULT 2,
  `remark`        TEXT,
  `proxy`         INTEGER NOT NULL DEFAULT 0,
  `cdn`           INTEGER NOT NULL DEFAULT 0,
  `addtime`       INTEGER NOT NULL DEFAULT 0,
  `checktime`     INTEGER NOT NULL DEFAULT 0,
  `checknexttime` INTEGER NOT NULL DEFAULT 0,
  `switchtime`    INTEGER NOT NULL DEFAULT 0,
  `errcount`      INTEGER NOT NULL DEFAULT 0,
  `status`        INTEGER NOT NULL DEFAULT 0,
  `active`        INTEGER NOT NULL DEFAULT 0,
  `recordinfo`    TEXT
);
CREATE INDEX idx_dmtask_did ON dnsmgr_dmtask(`did`);

DROP TABLE IF EXISTS dnsmgr_dmlog;
CREATE TABLE dnsmgr_dmlog (
  `id`     INTEGER PRIMARY KEY AUTOINCREMENT,
  `taskid` INTEGER NOT NULL,
  `action` INTEGER NOT NULL DEFAULT 0,
  `errmsg` TEXT,
  `date`   TEXT
);
CREATE INDEX idx_dmlog_taskid ON dnsmgr_dmlog(`taskid`);
CREATE INDEX idx_dmlog_date   ON dnsmgr_dmlog(`date`);

DROP TABLE IF EXISTS dnsmgr_optimizeip;
CREATE TABLE dnsmgr_optimizeip (
  `id`         INTEGER PRIMARY KEY AUTOINCREMENT,
  `did`        INTEGER NOT NULL,
  `rr`         TEXT NOT NULL,
  `type`       INTEGER NOT NULL DEFAULT 0,
  `ip_type`    TEXT NOT NULL,
  `cdn_type`   INTEGER NOT NULL DEFAULT 1,
  `recordnum`  INTEGER NOT NULL DEFAULT 2,
  `ttl`        INTEGER NOT NULL DEFAULT 600,
  `remark`     TEXT,
  `addtime`    TEXT NOT NULL,
  `updatetime` TEXT,
  `status`     INTEGER NOT NULL DEFAULT 0,
  `active`     INTEGER NOT NULL DEFAULT 0,
  `errmsg`     TEXT
);
CREATE INDEX idx_optimizeip_did ON dnsmgr_optimizeip(`did`);

DROP TABLE IF EXISTS dnsmgr_cert_account;
CREATE TABLE dnsmgr_cert_account (
  `id`      INTEGER PRIMARY KEY AUTOINCREMENT,
  `type`    TEXT NOT NULL,
  `name`    TEXT NOT NULL,
  `config`  TEXT,
  `ext`     TEXT,
  `remark`  TEXT,
  `deploy`  INTEGER NOT NULL DEFAULT 0,
  `addtime` TEXT
);

DROP TABLE IF EXISTS dnsmgr_cert_order;
CREATE TABLE dnsmgr_cert_order (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `aid`         INTEGER NOT NULL,
  `keytype`     TEXT,
  `keysize`     TEXT,
  `addtime`     TEXT,
  `updatetime`  TEXT,
  `processid`   TEXT,
  `issuetime`   TEXT,
  `expiretime`  TEXT,
  `issuer`      TEXT,
  `status`      INTEGER NOT NULL DEFAULT 0,
  `error`       TEXT,
  `isauto`      INTEGER NOT NULL DEFAULT 0,
  `retry`       INTEGER NOT NULL DEFAULT 0,
  `retry2`      INTEGER NOT NULL DEFAULT 0,
  `retrytime`   TEXT,
  `islock`      INTEGER NOT NULL DEFAULT 0,
  `locktime`    TEXT,
  `issend`      INTEGER NOT NULL DEFAULT 0,
  `info`        TEXT,
  `dns`         TEXT,
  `fullchain`   TEXT,
  `privatekey`  TEXT
);

DROP TABLE IF EXISTS dnsmgr_cert_domain;
CREATE TABLE dnsmgr_cert_domain (
  `id`     INTEGER PRIMARY KEY AUTOINCREMENT,
  `oid`    INTEGER NOT NULL,
  `domain` TEXT NOT NULL,
  `sort`   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_cert_domain_oid ON dnsmgr_cert_domain(`oid`);

DROP TABLE IF EXISTS dnsmgr_cert_deploy;
CREATE TABLE dnsmgr_cert_deploy (
  `id`        INTEGER PRIMARY KEY AUTOINCREMENT,
  `aid`       INTEGER NOT NULL,
  `oid`       INTEGER NOT NULL,
  `issuetime` TEXT,
  `config`    TEXT,
  `remark`    TEXT,
  `addtime`   TEXT,
  `lasttime`  TEXT,
  `processid` TEXT,
  `status`    INTEGER NOT NULL DEFAULT 0,
  `error`     TEXT,
  `active`    INTEGER NOT NULL DEFAULT 0,
  `retry`     INTEGER NOT NULL DEFAULT 0,
  `retrytime` TEXT,
  `islock`    INTEGER NOT NULL DEFAULT 0,
  `locktime`  TEXT,
  `issend`    INTEGER NOT NULL DEFAULT 0,
  `info`      TEXT
);

DROP TABLE IF EXISTS dnsmgr_cert_cname;
CREATE TABLE dnsmgr_cert_cname (
  `id`      INTEGER PRIMARY KEY AUTOINCREMENT,
  `domain`  TEXT NOT NULL,
  `did`     INTEGER NOT NULL,
  `rr`      TEXT NOT NULL,
  `addtime` TEXT,
  `status`  INTEGER NOT NULL DEFAULT 0
);

DROP TABLE IF EXISTS dnsmgr_sctask;
CREATE TABLE dnsmgr_sctask (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `did`         INTEGER NOT NULL,
  `rr`          TEXT NOT NULL,
  `recordid`    TEXT NOT NULL,
  `type`        INTEGER NOT NULL DEFAULT 0,
  `cycle`       INTEGER NOT NULL DEFAULT 0,
  `switchtype`  INTEGER NOT NULL DEFAULT 0,
  `switchdate`  TEXT,
  `switchtime`  TEXT,
  `value`       TEXT,
  `line`        TEXT,
  `addtime`     INTEGER NOT NULL DEFAULT 0,
  `updatetime`  INTEGER NOT NULL DEFAULT 0,
  `nexttime`    INTEGER NOT NULL DEFAULT 0,
  `active`      INTEGER NOT NULL DEFAULT 0,
  `recordinfo`  TEXT,
  `remark`      TEXT
);
CREATE INDEX idx_sctask_did ON dnsmgr_sctask(`did`);

DROP TABLE IF EXISTS dnsmgr_domain_alias;
CREATE TABLE dnsmgr_domain_alias (
  `id`   INTEGER PRIMARY KEY AUTOINCREMENT,
  `did`  INTEGER NOT NULL,
  `name` TEXT NOT NULL
);
CREATE INDEX idx_domain_alias_did  ON dnsmgr_domain_alias(`did`);
CREATE INDEX idx_domain_alias_name ON dnsmgr_domain_alias(`name`);

DROP TABLE IF EXISTS dnsmgr_domain_category;
CREATE TABLE dnsmgr_domain_category (
  `id`      INTEGER PRIMARY KEY AUTOINCREMENT,
  `name`    TEXT NOT NULL,
  `remark`  TEXT,
  `sort`    INTEGER NOT NULL DEFAULT 0,
  `addtime` TEXT
);
CREATE INDEX idx_domain_category_sort ON dnsmgr_domain_category(`sort`);
