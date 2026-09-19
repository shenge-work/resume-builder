/* =============================================================
 * panel.js · 右侧 AI 面板壳（阶段 1）
 * -------------------------------------------------------------
 * 阶段 1 只做：
 *   - 全局抽屉容器（fixed 右侧，360px，可关闭）
 *   - 配置状态显示（未配置 / 已配置）
 *   - 「测试连接」按钮
 *   - ⌘K / Ctrl+K 全局开关
 *
 * 阶段 2 再接：范围条 / 动作按钮 / 流式输出区 / Diff 卡片。
 * ============================================================= */
(function (global) {
  'use strict';

  var PANEL_ID = 'ai-panel';
  var LS_PREF = 'resume_studio_ai_v1';

  function readPref() {
    try { return JSON.parse(localStorage.getItem(LS_PREF) || '{}'); }
    catch (e) { return {}; }
  }
  function writePref(patch) {
    try {
      var cur = readPref();
      localStorage.setItem(LS_PREF, JSON.stringify(Object.assign(cur, patch)));
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var AIPanel = {
    root: null,
    open: false,

    init: function () {
      if (this.root) return;
      var wrap = document.createElement('div');
      wrap.id = PANEL_ID;
      wrap.className = 'ai-panel closed';
      wrap.innerHTML =
        '<div class="ai-panel-bar">' +
        '  <span class="ai-panel-title">AI 助手</span>' +
        '  <span style="flex:1"></span>' +
        '  <button type="button" class="ai-panel-test" id="aiTestBtn">测试连接</button>' +
        '  <button type="button" class="ai-panel-close" id="aiCloseBtn">×</button>' +
        '</div>' +
        '<div class="ai-panel-body" id="aiPanelBody">' +
        '  <div class="ai-loading">正在读取配置…</div>' +
        '</div>';
      document.body.appendChild(wrap);
      this.root = wrap;

      wrap.querySelector('#aiCloseBtn').addEventListener('click', () => this.toggle(false));
      wrap.querySelector('#aiTestBtn').addEventListener('click', () => this.runTest());

      // 快捷键：⌘K / Ctrl+K
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          this.toggle();
        }
      });

      // 启动时读一次状态（异步，不阻塞）
      this.refreshStatus();
    },

    toggle: function (force) {
      this.open = typeof force === 'boolean' ? force : !this.open;
      this.root.classList.toggle('closed', !this.open);
      this.root.classList.toggle('open', this.open);
      writePref({ panelOpen: this.open });
      if (this.open) this.refreshStatus();
    },

    body: function () { return this.root.querySelector('#aiPanelBody'); },

    refreshStatus: async function () {
      var body = this.body();
      body.innerHTML = '<div class="ai-loading">正在读取配置…</div>';
      var s = await global.ResumeAI.status();
      if (s.offline || !s.configured) {
        body.innerHTML =
          '<div class="ai-empty">' +
          '  <div class="ai-empty-title">AI 尚未接入</div>' +
          '  <div class="ai-empty-text">' +
          '    ' + (s.offline
              ? '本地服务未运行。请在项目根目录执行 <code>npm start</code> 后刷新本页。'
              : '请在项目根目录创建 <code>ai.config.json</code>（可从 <code>ai.config.example.json</code> 复制），填入你的模型厂商 API Key 后刷新页面。') +
          '  </div>' +
          '  <div class="ai-empty-text ai-empty-muted">' +
          '    你的 Key 只保存在本机 <code>ai.config.json</code>（已加入 .gitignore），不会随仓库上传；' +
          '简历内容也只发往你配置的模型厂商。' +
          '  </div>' +
          '</div>';
        return;
      }
      var pref = readPref();
      var tier = pref.modelTier || 'fast';
      var hasStrong = s.models && s.models.strong;
      var u = s.usage || {};
      var lastAt = u.lastAt ? new Date(u.lastAt).toLocaleTimeString() : '—';
      body.innerHTML =
        '<div class="ai-status">' +
        '  <div class="ai-status-row"><span>厂商</span><b>' + esc(s.provider) + '</b></div>' +
        '  <div class="ai-status-row"><span>端点</span><code>' + esc(s.baseURL) + '</code></div>' +
        '  <div class="ai-status-row"><span>温度</span><b>' + (typeof s.temperature === 'number' ? s.temperature : '0.4') + '</b></div>' +
        '  <div class="ai-status-row"><span>模型档位</span>' +
        '    <div class="ai-tier">' +
        '      <button type="button" data-tier="fast"' + (tier === 'fast' ? ' class="on"' : '') + '>' + esc(s.models && s.models.fast ? s.models.fast : 'fast') + '</button>' +
        (hasStrong ? '      <button type="button" data-tier="strong"' + (tier === 'strong' ? ' class="on"' : '') + '>' + esc(s.models.strong) + '</button>' : '') +
        '    </div>' +
        '  </div>' +
        '  <div class="ai-status-row"><span>本次用量</span><b>' + (u.requests || 0) + ' 次请求 / ' + (u.errors || 0) + ' 错误</b></div>' +
        '  <div class="ai-status-row"><span>上次使用</span><b>' + esc(lastAt) + '</b></div>' +
        '  <div class="ai-status-row"><span>Node</span><code>' + esc(s.nodeVersion) + '</code></div>' +
        '  <div class="ai-ready-hint">连接配置就绪。划词润色、条目改写等功能将在阶段 2 接入。</div>' +
        '</div>';
      // 模型档位切换
      var self = this;
      body.querySelectorAll('[data-tier]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          writePref({ modelTier: btn.getAttribute('data-tier') });
          body.querySelectorAll('[data-tier]').forEach(function (b) { b.classList.toggle('on', b === btn); });
        });
      });
    },

    runTest: async function () {
      var btn = this.root.querySelector('#aiTestBtn');
      btn.disabled = true;
      btn.textContent = '测试中…';
      try {
        var r = await global.ResumeAI.test();
        if (r.ok) {
          btn.textContent = '✓ ' + r.latencyMs + 'ms';
        } else {
          btn.textContent = '✗ 失败';
          alert('测试失败：' + (r.error || JSON.stringify(r)));
        }
      } catch (e) {
        btn.textContent = '✗ 错误';
        alert('测试错误：' + e.message);
      }
      setTimeout(() => { btn.textContent = '测试连接'; btn.disabled = false; }, 2000);
    }
  };

  global.AIPanel = AIPanel;

  // 自动初始化（面板是全局抽屉，不随路由走）
  function start() { AIPanel.init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
