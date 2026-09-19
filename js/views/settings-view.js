/* =============================================================
 * SettingsView —— 设置页（P2）
 * -------------------------------------------------------------
 * 从现有 modal 迁出的分组页面：飞书同步 / 外观 / 数据 / 关于。
 * 飞书配置表单已内联（替代原 #feishuConfigModal）。
 * ============================================================= */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 飞书配置内联表单（原 #feishuConfigModal 的内容，id 全部保留，app.js 直接 getElementById） */
  var FEISHU_FORM_HTML =
    '<div class="fs-form">' +
    '  <div class="fs-hint">' +
    '    <b>方式一（推荐）扫码授权</b>：以「用户身份」直接授权读写你自己的云盘/文档；' +
    '<b>方式二</b>：<b>扫码注册个人应用</b>——飞书自动为你创建应用并保存 App ID / App Secret，无需在开放平台手动抄写。' +
    '  </div>' +

    /* 方式一 OAuth */
    '  <div class="fs-card">' +
    '    <div class="fs-card-title">方式一 · 扫码授权</div>' +
    '    <div id="oauthStatus" class="fs-status">直接点击「扫码授权」，用手机飞书扫码即可绑定（无需填写下方字段）</div>' +
    '    <div id="oauthQrWrap" class="fs-qr-wrap" style="display:none;">' +
    '      <div id="oauthQr" class="fs-qr"></div>' +
    '      <div class="fs-qr-hint">用手机飞书扫码，在飞书中确认授权</div>' +
    '    </div>' +
    '    <div class="fs-btn-row">' +
    '      <button type="button" class="lib-btn primary" id="oauthStartBtn" onclick="ResumeEditor.startFeishuOauth()">扫码授权</button>' +
    '      <button type="button" class="lib-btn" onclick="ResumeEditor.refreshFeishuOauth()">刷新状态</button>' +
    '      <button type="button" class="lib-btn" onclick="ResumeEditor.revokeFeishuOauth()">解除授权</button>' +
    '    </div>' +
    '  </div>' +

    /* 方式二 扫码注册 */
    '  <div class="fs-card">' +
    '    <div class="fs-card-title">方式二 · 扫码注册个人应用</div>' +
    '    <div class="fs-card-desc">用手机飞书扫描下方二维码，飞书会为你在后台<b>自动创建一个「个人应用」</b>并授权云盘/文档权限；应用的 App ID / App Secret 会自动保存，<b>无需在开放平台手动抄写</b>。</div>' +
    '    <div id="regQrWrap" class="fs-qr-wrap" style="display:none;">' +
    '      <div id="regQr" class="fs-qr"></div>' +
    '      <div class="fs-qr-hint">用手机飞书 App 扫描上方二维码，确认创建应用</div>' +
    '      <div id="regStatus" class="fs-status">等待扫码…</div>' +
    '    </div>' +
    '    <div class="fs-btn-row">' +
    '      <button type="button" class="lib-btn primary" id="regStartBtn" onclick="ResumeEditor.startFeishuRegister()">扫码注册个人应用</button>' +
    '      <button type="button" class="lib-btn" id="regCancelBtn" style="display:none;" onclick="ResumeEditor.cancelFeishuRegister()">取消</button>' +
    '    </div>' +
    '    <div id="regResult" class="fs-status" style="display:none;"></div>' +
    '  </div>' +

    /* 应用身份字段 */
    '  <div class="fs-card">' +
    '    <div class="fs-card-title">同步目标设置（应用身份同步用）</div>' +
    '    <div class="fs-card-desc">已扫码注册后这些项通常无需改动；<b>手动粘贴已有应用</b>仅在复用既有应用时需要。</div>' +
    '    <label class="fs-field"><span>App ID（形如 cli_xxx）</span><input id="cfgAppId" placeholder="cli_xxxxxxxxxxxx"></label>' +
    '    <label class="fs-field"><span>App Secret（已设置时留空表示不修改）</span><input id="cfgAppSecret" type="password" placeholder="首次配置必填"></label>' +
    '    <label class="fs-field"><span>飞书域名（如 xxx.feishu.cn）</span><input id="cfgDomain" placeholder="feishu.cn"></label>' +
    '    <label class="fs-field"><span>云盘目标文件夹 folder_token（存到根目录填 0）</span><input id="cfgFolder" placeholder="0"></label>' +
    '    <label class="fs-field"><span>备份文档标题</span><input id="cfgDocTitle" placeholder="简历数据备份"></label>' +
    '    <label class="fs-field"><span>云盘文件名</span><input id="cfgFileName" placeholder="resume.json"></label>' +
    '    <label class="fs-check"><input type="checkbox" id="cfgDryRun"> <span>dry-run 模式（走完整链路但不真实写入飞书，用于先验证流程）</span></label>' +
    '    <div id="cfgProbeStatus" class="fs-status" style="display:none;"></div>' +
    '    <div class="fs-note">所需权限 scope：<b>docx:document</b>、<b>drive:drive</b>（或 drive:file），并完成租户授权。配置保存在本机 gitignored 的 sync.config.json，凭证不会进入浏览器存储或简历数据文件。</div>' +
    '    <div class="fs-btn-row">' +
    '      <button type="button" class="lib-btn" id="cfgProbeBtn" onclick="ResumeEditor.probeFeishuConfig()">自动探测并绑定</button>' +
    '      <button type="button" class="lib-btn primary" id="cfgSaveBtn" onclick="ResumeEditor.saveFeishuConfig()">保存配置</button>' +
    '    </div>' +
    '  </div>' +
    '</div>';

  var SettingsView = {
    root: null,

    onEnter: function () {
      if (!this.root) this.root = global.ResumeLayout.getViewRoot();
      document.body.classList.remove('route-editor');
      document.body.classList.add('route-library');
      this.render();
      // 渲染完后填飞书配置字段（openFeishuConfig 现在只填字段，不弹 modal）
      if (global.ResumeEditor && global.ResumeEditor.openFeishuConfig) {
        global.ResumeEditor.openFeishuConfig();
      }
    },

    onLeave: function () {
      if (this.root) this.root.innerHTML = '';
    },

    render: function () {
      var self = this;
      var root = this.root;

      var themeMode = (global.ResumeTheme && global.ResumeTheme.getMode)
        ? global.ResumeTheme.getMode() : 'auto';
      var paperDark = (global.ResumeTheme && global.ResumeTheme.paperFollows)
        ? global.ResumeTheme.paperFollows() : true;

      root.innerHTML =
        '<div class="settings-page">' +
        '  <div class="settings-header">' +
        '    <button type="button" class="settings-back" data-nav="/library">← 返回</button>' +
        '    <h1 class="settings-title">设置</h1>' +
        '  </div>' +

        '  <div class="settings-body">' +

        /* 飞书同步 */
        '  <section class="settings-section">' +
        '    <h2 class="settings-h2">飞书同步</h2>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title">立即上报</div>' +
        '        <div class="settings-row-desc">把当前简历数据推到飞书</div>' +
        '      </div>' +
        '      <button type="button" class="lib-btn" id="setReportBtn">上报到飞书</button>' +
        '    </div>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title">拉取最新</div>' +
        '        <div class="settings-row-desc">从飞书云端拉取当前简历的最新版本（覆盖本地，可撤销）</div>' +
        '      </div>' +
        '      <button type="button" class="lib-btn" id="setPullBtn">拉取最新</button>' +
        '    </div>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title">历史版本</div>' +
        '        <div class="settings-row-desc">查看飞书云端的历史版本并恢复</div>' +
        '      </div>' +
        '      <button type="button" class="lib-btn" id="setHistoryBtn">查看历史版本</button>' +
        '    </div>' +
        FEISHU_FORM_HTML +
        '  </section>' +

        /* 外观 */
        '  <section class="settings-section">' +
        '    <h2 class="settings-h2">外观</h2>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title">界面主题</div>' +
        '        <div class="settings-row-desc">编辑器外壳的明暗</div>' +
        '      </div>' +
        '      <div class="settings-seg">' +
        '        <button type="button" data-theme="auto"' + (themeMode === 'auto' ? ' class="on"' : '') + '>跟随系统</button>' +
        '        <button type="button" data-theme="light"' + (themeMode === 'light' ? ' class="on"' : '') + '>日间</button>' +
        '        <button type="button" data-theme="dark"' + (themeMode === 'dark' ? ' class="on"' : '') + '>夜间</button>' +
        '      </div>' +
        '    </div>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title">纸张跟随夜间</div>' +
        '        <div class="settings-row-desc">夜间模式下预览里的简历纸张也变暗（导出仍是白纸）</div>' +
        '      </div>' +
        '      <label class="settings-switch">' +
        '        <input type="checkbox" id="setPaperDark"' + (paperDark ? ' checked' : '') + '>' +
        '        <span class="settings-switch-ui"></span>' +
        '      </label>' +
        '    </div>' +
        '  </section>' +

        /* 数据 */
        '  <section class="settings-section">' +
        '    <h2 class="settings-h2">数据</h2>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title">导出数据</div>' +
        '        <div class="settings-row-desc">把当前简历数据导出为 JSON 文件备份</div>' +
        '      </div>' +
        '      <button type="button" class="lib-btn" id="setExportBtn">导出 JSON</button>' +
        '    </div>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title">导入数据</div>' +
        '        <div class="settings-row-desc">从此前导出的 JSON 恢复</div>' +
        '      </div>' +
        '      <button type="button" class="lib-btn" id="setImportBtn">导入 JSON</button>' +
        '    </div>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title danger">清空本地</div>' +
        '        <div class="settings-row-desc">清空浏览器本地保存，回到内置初始数据</div>' +
        '      </div>' +
        '      <button type="button" class="lib-btn danger" id="setClearBtn">清空本地</button>' +
        '    </div>' +
        '  </section>' +

        /* 关于 */
        '  <section class="settings-section">' +
        '    <h2 class="settings-h2">关于</h2>' +
        '    <div class="settings-row">' +
        '      <div class="settings-row-text">' +
        '        <div class="settings-row-title">简历工作台</div>' +
        '        <div class="settings-row-desc">纯前端简历编辑器 · 零后端 · 数据可移植</div>' +
        '      </div>' +
        '    </div>' +
        '  </section>' +

        '  </div>' +
        '</div>';

      // 绑定事件
      root.querySelector('.settings-back').addEventListener('click', function (e) {
        e.preventDefault();
        global.ResumeRouter.navigate('/library');
      });

      root.querySelector('#setReportBtn').addEventListener('click', function () {
        if (global.ResumeEditor && global.ResumeEditor.reportToFeishu) {
          global.ResumeEditor.reportToFeishu();
        }
      });
      root.querySelector('#setPullBtn').addEventListener('click', function () {
        if (global.ResumeEditor && global.ResumeEditor.pullFromFeishu) {
          global.ResumeEditor.pullFromFeishu();
        }
      });
      root.querySelector('#setHistoryBtn').addEventListener('click', function () {
        global.ResumeRouter.navigate('/history');
      });

      // 主题切换
      root.querySelectorAll('[data-theme]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var mode = btn.getAttribute('data-theme');
          if (global.ResumeEditor && global.ResumeEditor.setThemeMode) {
            global.ResumeEditor.setThemeMode(mode);
          }
          root.querySelectorAll('[data-theme]').forEach(function (b) {
            b.classList.toggle('on', b === btn);
          });
        });
      });
      // 纸张暗色
      root.querySelector('#setPaperDark').addEventListener('change', function (e) {
        if (global.ResumeEditor && global.ResumeEditor.togglePaperTheme) {
          global.ResumeEditor.togglePaperTheme();
        }
      });

      // 数据操作
      root.querySelector('#setExportBtn').addEventListener('click', function () {
        if (global.ResumeEditor && global.ResumeEditor.exportJSON) {
          global.ResumeEditor.exportJSON();
        }
      });
      root.querySelector('#setImportBtn').addEventListener('click', function () {
        var fi = document.getElementById('importFile');
        if (fi) fi.click();
      });
      root.querySelector('#setClearBtn').addEventListener('click', function () {
        if (global.ResumeEditor && global.ResumeEditor.clearSaved) {
          global.ResumeEditor.clearSaved();
        }
      });
    }
  };

  global.SettingsView = SettingsView;
})(window);
