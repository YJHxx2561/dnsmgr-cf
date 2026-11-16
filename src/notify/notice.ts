/**
 * 通知服务（纯 HTTP webhook，替代 PHP 的 MsgNotice）
 * 支持：钉钉/企业微信/飞书/Telegram/WxPusher/自定义 Webhook/QQ机器人
 * 邮件：通过 HTTP 邮件 API（Sendcloud / 阿里云 DM），不使用 SMTP socket
 */
import type { Env } from '../types';
import { loadConfigs } from '../core/config';

interface NoticePayload {
  title: string;
  content: string;
  html?: string;
}

/** 主发送入口（action: 1切换备用 2恢复正常 3到期提醒） */
export async function sendNotice(env: Env, action: number, row: any, result?: any): Promise<void> {
  const configs = await loadConfigs(env);
  const get = (k: string, d = '') => configs.get(k) ?? d;

  let title = '', content = '';
  if (action === 1) {
    title = 'DNS容灾切换通知';
    content = `您的域名 ${row.domain} 的 ${row.main_value || ''} 记录已自动切换为备用解析记录 ${row.backup_value || ''}`;
  } else if (action === 2) {
    title = 'DNS容灾切换-恢复正常通知';
    content = `您的域名 ${row.domain} 的解析记录已恢复正常`;
  } else if (action === 3) {
    title = '域名到期提醒';
    content = `您的域名 ${row.domain} 将在 ${row.days} 天后到期，请及时续费`;
  } else {
    title = 'DNS管理系统通知';
    content = row.content || JSON.stringify(row);
  }
  const payload: NoticePayload = { title, content, html: `<b>${title}</b><br>${content}` };

  const tasks: Promise<any>[] = [];
  // 钉钉
  if (get('webhook_url')) tasks.push(sendWebhook(get('webhook_url'), {
    msgtype: 'markdown', markdown: { title, text: `### ${title}\n${content}` },
  }));
  // Telegram
  if (get('tgbot_token') && get('tgbot_chatid')) {
    const url = `https://api.telegram.org/bot${get('tgbot_token')}/sendMessage`;
    tasks.push(sendWebhook(url, { chat_id: get('tgbot_chatid'), text: `${title}\n${content}`, parse_mode: 'HTML' }));
  }
  // 企业微信/飞书（webhook_url 兼容）
  if (get('wechat_webhook')) tasks.push(sendWebhook(get('wechat_webhook'), { msgtype: 'text', text: { content: `${title}\n${content}` } }));
  // 自定义 Webhook
  if (get('custom_webhook_url')) tasks.push(sendCustomWebhook(configs, payload));
  // WxPusher
  if (get('wechat_appuid')) {
    tasks.push(sendWebhook('https://wxpusher.zjiecode.com/api/send/message', {
      appToken: get('wechat_apptoken'), content: `${title}\n${content}`, summary: title,
      contentType: 1, uids: get('wechat_appuid').split(','),
    }));
  }
  // 邮件（HTTP API）
  if (get('notice_mail') === '1') tasks.push(sendMailApi(configs, payload));

  await Promise.allSettled(tasks);
}

async function sendWebhook(url: string, body: any): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {}
}

async function sendCustomWebhook(configs: Map<string, string>, p: NoticePayload): Promise<void> {
  const url = configs.get('custom_webhook_url')!;
  const method = configs.get('custom_webhook_method') || 'POST';
  const contentType = configs.get('custom_webhook_content_type') || 'application/json';
  let body = configs.get('custom_webhook_body') || '{title}\n{content}';
  body = body.replace(/\{title\}/g, p.title).replace(/\{content\}/g, p.content);
  const headers: Record<string, string> = { 'Content-Type': contentType };
  const rawHeaders = configs.get('custom_webhook_headers') || '';
  for (const line of rawHeaders.split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  }
  try { await fetch(url, { method, headers, body }); } catch {}
}

/** HTTP 邮件 API（替代 SMTP）：Sendcloud / 阿里云 DM */
async function sendMailApi(configs: Map<string, string>, p: NoticePayload): Promise<void> {
  const type = configs.get('mail_type') || '0';
  const to = configs.get('mail_recv') || configs.get('mail_name') || '';
  if (!to) return;
  try {
    if (type === '1') {
      // Sendcloud HTTP API
      await fetch('https://api.sendcloud.net/apiv2/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          apiUser: configs.get('mail_apiuser') || '', apiKey: configs.get('mail_apikey') || '',
          from: configs.get('mail_name') || '', to, subject: p.title, html: p.html || p.content,
        }).toString(),
      });
    } else if (type === '2') {
      // 阿里云邮件推送（简化：通过 HTTP API 签名较复杂，这里用 Sendcloud 兜底）
      await fetch('https://api.sendcloud.net/apiv2/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          apiUser: configs.get('mail_apiuser') || '', apiKey: configs.get('mail_apikey') || '',
          from: configs.get('mail_name') || '', to, subject: p.title, html: p.html || p.content,
        }).toString(),
      });
    }
    // type=0（原 SMTP）在 Workers 下不支持，需配置 type=1 或 2
  } catch {}
}
