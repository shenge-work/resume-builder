/* =============================================================
 * js/ui/notifier.js —— 应用内消息通知中心
 * -----------------------------------------------------------------------------
 * 用途：集中展示自动同步（飞书）、导入导出、健康告警等异步消息。
 *       铃铛带未读角标，点开下拉看列表；消息持久化到 localStorage，
 *       关闭软件再开仍在。最多保留 50 条，超出丢弃最旧。
 *
 * 对外全局：global.ResumeNotifier = { notify, unreadCount, togglePanel, ... }
 * 不依赖任何其他业务模块，被 feishu-sync（自动同步告警）与 app.js 调用。
 * ============================================================= */
(function (global) {
'use strict';

const STORE_KEY = 'resume_notifications_v1';
const MAX_ITEMS = 50;
// 错误/同文案去重窗口（毫秒）：连续相同错误不反复刷屏
const ERROR_DEDUP_MS = 30 * 1000;

let items = load();
let lastErrorKey = '';
let lastErrorAt = 0;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS))); } catch (e) {}
}
function uid() {
  return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* type: info / success / warn / error */
function notify(type, title, body) {
  type = ['info', 'success', 'warn', 'error'].indexOf(type) >= 0 ? type : 'info';
  title = String(title == null ? '' : title);
  body = String(body == null ? '' : body);
  // 错误去重：同 type+title+body 在窗口内只记一次
  const key = type + '|' + title + '|' + body;
  const now = Date.now();
  if (type === 'error' && key === lastErrorKey && (now - lastErrorAt) < ERROR_DEDUP_MS) {
    return;
  }
  lastErrorKey = key;
  lastErrorAt = now;
  items.unshift({ id: uid(), type, title, body, at: now, read: false });
  if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
  persist();
  render();
}

function unreadCount() {
  return items.filter(it => !it.read).length;
}

/* ---------- DOM：铃铛 + 下拉面板 ---------- */
function bellEl() { return document.getElementById('notifBell'); }
function panelEl() {
  let el = document.getElementById('notifPanel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'notifPanel';
  el.className = 'notif-panel';
  el.hidden = true;
  el.innerHTML =
    '<div class="notif-panel-head">' +
    '  <span class="notif-panel-title">消息通知</span>' +
    '  <span class="notif-panel-ops">' +
    '    <button type="button" id="notifMarkAll" title="全部标为已读">全部已读</button>' +
    '    <button type="button" id="notifClearAll" title="清空全部消息">清空</button>' +
    '  </span>' +
    '</div>' +
    '<div class="notif-panel-list" id="notifList"></div>';
  document.body.appendChild(el);
  el.querySelector('#notifMarkAll').addEventListener('click', function () {
    items.forEach(it => { it.read = true; });
    persist(); render();
  });
  el.querySelector('#notifClearAll').addEventListener('click', function () {
    items = [];
    persist(); render();
  });
  // 点面板外关闭
  document.addEventListener('click', function (e) {
    if (el.hidden) return;
    if (el.contains(e.target)) return;
    const b = bellEl();
    if (b && b.contains(e.target)) return;
    el.hidden = true;
  });
  return el;
}

function render() {
  const bell = bellEl();
  if (bell) {
    const n = unreadCount();
    let badge = bell.querySelector('.notif-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notif-badge';
        bell.appendChild(badge);
      }
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = false;
    } else if (badge) {
      badge.hidden = true;
    }
  }
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const list = panel.querySelector('#notifList');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="notif-empty">暂无消息</div>';
    return;
  }
  list.innerHTML = items.map(it =>
    '<div class="notif-item type-' + it.type + (it.read ? ' read' : '') + '" data-id="' + it.id + '">' +
    '  <div class="notif-item-head">' +
    '    <span class="notif-item-title">' + esc(it.title) + '</span>' +
    '    <span class="notif-item-time">' + fmtTime(it.at) + '</span>' +
    '  </div>' +
    (it.body ? '<div class="notif-item-body">' + esc(it.body) + '</div>' : '') +
    '</div>'
  ).join('');
  // 点开列表项即标已读
  list.querySelectorAll('.notif-item').forEach(row => {
    row.addEventListener('click', function () {
      const id = row.getAttribute('data-id');
      const it = items.find(x => x.id === id);
      if (it) { it.read = true; persist(); render(); }
    });
  });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function togglePanel() {
  const panel = panelEl();
  panel.hidden = !panel.hidden;
  if (!panel.hidden) render();
}

/* 铃铛按钮点击（挂在 tools 面板头；手机端同步页也放一个入口） */
document.addEventListener('click', function (e) {
  const bell = e.target && e.target.closest ? e.target.closest('#notifBell') : null;
  if (bell) { e.preventDefault(); togglePanel(); }
});

/* 暴露给业务层 */
global.ResumeNotifier = {
  notify: notify,
  unreadCount: unreadCount,
  togglePanel: togglePanel,
  /* 测试用 */
  _items: function () { return items; },
  _clear: function () { items = []; persist(); render(); }
};

/* 初次渲染（铃铛存在时刷新角标） */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
}
}) (typeof window !== 'undefined' ? window : globalThis);
