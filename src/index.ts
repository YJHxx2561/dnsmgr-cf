/**
 * dnsmgr Cloudflare Worker 主入口
 * 统一处理：HTTP 请求路由、Cron Trigger 定时任务、静态资源(Pages/Assets)
 */
import type { Env } from './types';
import { Router } from './core/router';
import { json, fail, html, redirect, text } from './core/response';
import { configGet, isInstalled } from './core/config';

// 路由模块
import { registerAuthRoutes } from './routes/auth';
import {
  userData, userOp, logData, accountData, accountOp, domainData, domainOp, domainList,
  recordData, recordAdd, recordUpdate, recordDelete, recordStatus, recordRemark, recordBatch,
} from './routes/core';
import { registerBackupRoutes } from './routes/backup';
import {
  systemSet, systemConfigs, systemInfo, cleanCache,
  dmtaskData, dmtaskOp, dmlogData, staskData, staskOp, optimizeipData, optimizeipOp,
  categoryData, categoryOp, certAccountData, certAccountOp, certOrderData, certDeployData,
  certCnameData, certCnameOp, certOrderProcess, certOrderAdd, dmonitorClean,
} from './routes/system';
import { handleMcp } from './services/mcp';
import { runCronTasks } from './services/cron';
import { checkPermission } from './auth/middleware';

const router = new Router();

/* ---------------------- 无需登录的路由 ---------------------- */
registerAuthRoutes(router);
router.get('/cron', async (ctx) => {
  // URL 模式触发：校验 key（与 PHP cron_type=1 一致）
  const key = ctx.url.searchParams.get('key');
  const cronKey = await configGet(ctx.env, 'cron_key', '');
  if (cronKey && key !== cronKey) return fail('Invalid cron key', -1);
  const logs = await runCronTasks(ctx.env);
  return json({ code: 0, msg: 'success!', data: logs });
}, { authType: 'none' });

router.any('/mcp', handleMcp, { authType: 'mcp' });

/* ---------------------- 首页/仪表盘 ---------------------- */
router.get('/', systemInfo, { auth: true });
router.get('/index/index', systemInfo, { auth: true });
router.any('/test', async (ctx) => json({ code: 0, data: { ok: true, platform: 'Cloudflare Workers' } }), { auth: true });
router.get('/cleancache', cleanCache, { auth: true });

/* ---------------------- 用户/日志 ---------------------- */
router.post('/user/data', userData, { auth: true });
router.post('/user/op', userOp, { auth: true });
router.post('/log/data', logData, { auth: true });

/* ---------------------- DNS 账户 ---------------------- */
router.post('/account/data', accountData, { auth: true });
router.post('/account/:action', accountOp, { auth: true });

/* ---------------------- 域名 ---------------------- */
router.post('/domain/data', domainData, { auth: true });
router.post('/domain/op', domainOp, { auth: true });
router.post('/domain/list', domainList, { auth: true });
router.post('/domain/category/data', categoryData, { auth: true });
router.post('/domain/category/:action', categoryOp, { auth: true });
router.get('/domain/category/list', categoryData, { auth: true });

/* ---------------------- 解析记录（实时拉取） ---------------------- */
router.post('/record/data/:id', recordData, { auth: true });
router.post('/record/add/:id', recordAdd, { auth: true });
router.post('/record/update/:id', recordUpdate, { auth: true });
router.post('/record/delete/:id', recordDelete, { auth: true });
router.post('/record/status/:id', recordStatus, { auth: true });
router.post('/record/remark/:id', recordRemark, { auth: true });
router.post('/record/batch/:id', recordBatch, { auth: true });
router.post('/record/log/:id', async (ctx) => {
  // 平台操作日志
  const { getProviderByAccount } = await import('./dns/factory');
  const d = await (await import('./db/database')).db(ctx.env, 'domain').where('id', Number(ctx.params.id)).find();
  if (!d) return json({ total: 0, rows: [] });
  const p = await getProviderByAccount(ctx.env, d.aid, d.name, d.thirdid);
  const r = p ? await p.getDomainRecordLog(Math.floor(Number(ctx.body.offset || 0) / Math.max(1, Number(ctx.body.limit || 10))) + 1, Number(ctx.body.limit || 10)) : null;
  return r ? json(r) : json({ total: 0, rows: [] });
}, { auth: true });

/* ---------------------- 容灾检测 ---------------------- */
router.get('/dmonitor/overview', async (ctx) => json({
  code: 0, data: {
    task_count: await (await import('./db/database')).db(ctx.env, 'dmtask').count(),
    log_count: await (await import('./db/database')).db(ctx.env, 'dmlog').count(),
  },
}), { auth: true });
router.post('/dmonitor/task/data', dmtaskData, { auth: true });
router.post('/dmonitor/task/log/data/:id', dmlogData, { auth: true });
router.post('/dmonitor/task/:action', dmtaskOp, { auth: true });
router.post('/dmonitor/clean', dmonitorClean, { auth: true });
router.any('/dmtask/status', async () => json({ code: 0, data: { running: true, mode: 'cron' } }), { authType: 'none' });

/* ---------------------- 定时切换 ---------------------- */
router.post('/schedule/stask/data', staskData, { auth: true });
router.post('/schedule/stask/:action', staskOp, { auth: true });

/* ---------------------- 优选IP ---------------------- */
router.post('/optimizeip/opiplist/data', optimizeipData, { auth: true });
router.post('/optimizeip/opipform/:action', optimizeipOp, { auth: true });
router.any('/optimizeip/status', async () => json({ code: 0, data: { running: true, mode: 'cron' } }), { authType: 'none' });

/* ---------------------- 证书 ---------------------- */
router.get('/cert/certaccount', certAccountData, { auth: true });
router.post('/cert/account/data', certAccountData, { auth: true });
router.post('/cert/account/:action', certAccountOp, { auth: true });
router.get('/cert/certorder', certOrderData, { auth: true });
router.post('/cert/order/data', certOrderData, { auth: true });
router.post('/cert/order/process', certOrderProcess, { auth: true });
router.post('/cert/order/add', certOrderAdd, { auth: true });
router.get('/cert/deploytask', certDeployData, { auth: true });
router.post('/cert/deploy/data', certDeployData, { auth: true });
router.get('/cert/cname', certCnameData, { auth: true });
router.post('/cert/cname/data', certCnameData, { auth: true });
router.post('/cert/cname/:action', certCnameOp, { auth: true });

/* ---------------------- 系统设置 ---------------------- */
router.get('/system/loginset', systemConfigs, { auth: true });
router.get('/system/noticeset', systemConfigs, { auth: true });
router.get('/system/proxyset', systemConfigs, { auth: true });
router.get('/system/cronset', systemConfigs, { auth: true });
router.get('/system/configs', systemConfigs, { auth: true });
router.post('/system/set', systemSet, { auth: true });

/* ---------------------- 备份恢复 ---------------------- */
registerBackupRoutes(router);

/* ---------------------- API 接口（API Key 鉴权） ---------------------- */
router.post('/api/domain', domainData, { authType: 'api' });
router.post('/api/domain/:id', async (ctx) => {
  const d = await (await import('./db/database')).db(ctx.env, 'domain').where('id', Number(ctx.params.id)).find();
  return d ? json({ code: 0, data: d }) : fail('域名不存在', -1);
}, { authType: 'api' });
router.post('/api/record/data/:id', recordData, { authType: 'api' });
router.post('/api/record/add/:id', recordAdd, { authType: 'api' });
router.post('/api/record/update/:id', recordUpdate, { authType: 'api' });
router.post('/api/record/delete/:id', recordDelete, { authType: 'api' });
router.post('/api/record/status/:id', recordStatus, { authType: 'api' });

/* ---------------------- Worker 导出 ---------------------- */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 静态资源（Assets / Pages）：仅 GET/HEAD 且看起来是静态文件请求时才交给 Assets，
    // 避免消费掉 API 请求的 body。
    const isStatic = /\.(html?|css|js|json|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|txt|map)$/i.test(url.pathname);
    if (env.ASSETS && (request.method === 'GET' || request.method === 'HEAD') && isStatic) {
      const assetResponse = await env.ASSETS.fetch(request.clone() as any).catch(() => null);
      if (assetResponse && assetResponse.status !== 404) return assetResponse;
    }

    return router.handle(request, env, ctx);
  },

  /** Cron Trigger 入口 */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCronTasks(env));
  },
};
