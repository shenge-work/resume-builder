/* =============================================================
 * TrackerView —— 投递追踪（P3）
 * -------------------------------------------------------------
 * 纯本地 CRUD：记录每份简历投到了哪些公司、到哪一步。
 * 数据存 localStorage（key: resume_tracker_v1），不建后端。
 *
 * 状态机：
 *   applied(已投递) → written(笔试中) → interview1(一面) → interview2(二面)
 *     → hr(HR面) → offer(Offer)
 *   任意状态可 → rejected(已拒) / gaveup(放弃)
 * ============================================================= */
(function (global) {
  'use strict';

  var LS_KEY = 'resume_tracker_v1';

  var STATUS = {
    applied:    { label: '已投递', color: '#888' },
    written:    { label: '笔试中', color: '#3370ff' },
    interview1: { label: '一面',   color: '#3370ff' },
    interview2: { label: '二面',   color: '#3370ff' },
    hr:         { label: 'HR面',  color: '#7c3aed' },
    offer:      { label: 'Offer',  color: '#16a34a' },
    rejected:   { label: '已拒',   color: '#c0392b' },
    gaveup:     { label: '放弃',   color: '#999' }
  };
  var STATUS_ORDER = ['applied','written','interview1','interview2','hr','offer','rejected','gaveup'];

  var CHANNELS = ['内推','BOSS直聘','官网','猎头','校招','其他'];

  function loadAll() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveAll(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function genId() {
    return 'tk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(Number(ts));
    var m = (d.getMonth() + 1).toString().padStart(2, '0');
    var day = d.getDate().toString().padStart(2, '0');
    return m + '-' + day;
  }
  function fmtDateTime(ts) {
    if (!ts) return '';
    var d = new Date(Number(ts));
    return (d.getMonth()+1) + '/' + d.getDate() + ' ' +
      d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function statusLabel(k) { return (STATUS[k] && STATUS[k].label) || k; }
  function statusColor(k) { return (STATUS[k] && STATUS[k].color) || '#888'; }

  var TrackerView = {
    root: null,
    list: [],
    editingId: null,   // null=新建，字符串=编辑某条

    onEnter: function () {
      if (!this.root) this.root = global.ResumeLayout.getViewRoot();
      document.body.classList.remove('route-editor');
      document.body.classList.add('route-library');
      this.list = loadAll();
      this.render();
    },

    onLeave: function () {
      this.closeEditor();
      if (this.root) this.root.innerHTML = '';
    },

    render: function () {
      var self = this;
      var list = this.list;

      // 统计
      var now = new Date();
      var thisMonth = list.filter(function (r) {
        var d = new Date(r.appliedAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
      var active = list.filter(function (r) {
        return ['applied','written','interview1','interview2','hr'].indexOf(r.status) >= 0;
      }).length;
      var offers = list.filter(function (r) { return r.status === 'offer'; }).length;

      var rowsHtml = list.length ? list.slice().sort(function (a, b) {
        return (b.appliedAt || 0) - (a.appliedAt || 0);
      }).map(function (r) {
        return '<tr data-id="' + esc(r.id) + '">' +
          '<td class="tk-resume">' + esc(r.resumeTitle || '—') + '</td>' +
          '<td>' + esc(r.company) + '</td>' +
          '<td>' + esc(r.position) + '</td>' +
          '<td>' + esc(r.channel || '') + '</td>' +
          '<td><span class="tk-status" style="color:' + statusColor(r.status) + '">' +
              statusLabel(r.status) + '</span></td>' +
          '<td>' + fmtDate(r.appliedAt) + '</td>' +
          '<td class="tk-ops">' +
            '<button type="button" class="tk-op" data-act="edit">编辑</button>' +
            '<button type="button" class="tk-op danger" data-act="del">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('') :
      '<tr><td colspan="7" class="tk-empty">还没有投递记录。点右上角「＋ 新建记录」开始追踪。</td></tr>';

      this.root.innerHTML =
        '<div class="tk-page">' +
        '  <div class="settings-header">' +
        '    <button type="button" class="settings-back" data-nav="/library">← 返回</button>' +
        '    <h1 class="settings-title">投递追踪</h1>' +
        '    <div style="flex:1"></div>' +
        '    <button type="button" class="lib-btn primary" id="tkNewBtn">＋ 新建记录</button>' +
        '  </div>' +

        '  <div class="tk-stats">' +
        '    <div class="tk-stat"><div class="tk-stat-num">' + thisMonth + '</div><div class="tk-stat-label">本月投递</div></div>' +
        '    <div class="tk-stat"><div class="tk-stat-num">' + active + '</div><div class="tk-stat-label">在流程中</div></div>' +
        '    <div class="tk-stat"><div class="tk-stat-num">' + offers + '</div><div class="tk-stat-label">Offer</div></div>' +
        '  </div>' +

        '  <div class="tk-table-wrap">' +
        '    <table class="tk-table">' +
        '      <thead><tr>' +
        '        <th>简历版本</th><th>公司</th><th>岗位</th><th>渠道</th>' +
        '        <th>状态</th><th>投递日期</th><th></th>' +
        '      </tr></thead>' +
        '      <tbody>' + rowsHtml + '</tbody>' +
        '    </table>' +
        '  </div>' +

        /* 编辑弹层 */
        '  <div class="tk-modal" id="tkModal">' +
        '    <div class="tk-modal-box">' +
        '      <div class="tk-modal-bar">' +
        '        <span id="tkModalTitle">新建记录</span>' +
        '        <span style="flex:1"></span>' +
        '        <button type="button" class="tk-x" id="tkCancelBtn">取消</button>' +
        '      </div>' +
        '      <div class="tk-modal-body">' +
        '        <label class="tk-field"><span>公司</span><input type="text" id="tkCompany" placeholder="如 字节跳动"></label>' +
        '        <label class="tk-field"><span>岗位</span><input type="text" id="tkPosition" placeholder="如 后端工程师"></label>' +
        '        <label class="tk-field"><span>渠道</span>' +
        '          <select id="tkChannel">' + CHANNELS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
        '        </label>' +
        '        <label class="tk-field"><span>状态</span>' +
        '          <select id="tkStatus">' +
        STATUS_ORDER.map(function (k) { return '<option value="' + k + '">' + STATUS[k].label + '</option>'; }).join('') +
        '          </select>' +
        '        </label>' +
        '        <label class="tk-field"><span>关联简历</span><input type="text" id="tkResume" placeholder="如 简历标题 · 目标岗位"></label>' +
        '        <label class="tk-field"><span>备注</span><textarea id="tkNote" rows="2" placeholder="可选"></textarea></label>' +
        '      </div>' +
        '      <div class="tk-modal-foot">' +
        '        <button type="button" class="lib-btn primary" id="tkSaveBtn">保存</button>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      // 返回
      this.root.querySelector('.settings-back').addEventListener('click', function (e) {
        e.preventDefault();
        global.ResumeRouter.navigate('/library');
      });
      // 新建
      this.root.querySelector('#tkNewBtn').addEventListener('click', function () {
        self.openEditor(null);
      });
      // 行内编辑/删除
      this.root.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
        tr.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-act]');
          if (!btn) return;
          var id = tr.getAttribute('data-id');
          if (btn.getAttribute('data-act') === 'edit') self.openEditor(id);
          else if (btn.getAttribute('data-act') === 'del') self.deleteRow(id);
        });
      });
      // modal 按钮
      this.root.querySelector('#tkCancelBtn').addEventListener('click', function () { self.closeEditor(); });
      this.root.querySelector('#tkSaveBtn').addEventListener('click', function () { self.saveEditor(); });
      // 点遮罩关闭
      this.root.querySelector('#tkModal').addEventListener('click', function (e) {
        if (e.target.id === 'tkModal') self.closeEditor();
      });
    },

    openEditor: function (id) {
      this.editingId = id;
      var modal = this.root.querySelector('#tkModal');
      this.root.querySelector('#tkModalTitle').textContent = id ? '编辑记录' : '新建记录';

      var r = null;
      if (id) {
        r = this.list.filter(function (x) { return x.id === id; })[0];
      }
      this.root.querySelector('#tkCompany').value = r ? r.company : '';
      this.root.querySelector('#tkPosition').value = r ? r.position : '';
      this.root.querySelector('#tkChannel').value = r ? (r.channel || CHANNELS[0]) : CHANNELS[0];
      this.root.querySelector('#tkStatus').value = r ? r.status : 'applied';
      this.root.querySelector('#tkResume').value = r ? (r.resumeTitle || '') : '';
      this.root.querySelector('#tkNote').value = r ? (r.note || '') : '';

      modal.style.display = 'flex';
    },

    closeEditor: function () {
      var modal = this.root.querySelector('#tkModal');
      if (modal) modal.style.display = 'none';
      this.editingId = null;
    },

    saveEditor: function () {
      var company = this.root.querySelector('#tkCompany').value.trim();
      var position = this.root.querySelector('#tkPosition').value.trim();
      if (!company || !position) {
        alert('公司和岗位必填'); return;
      }
      var data = {
        company: company,
        position: position,
        channel: this.root.querySelector('#tkChannel').value,
        status: this.root.querySelector('#tkStatus').value,
        resumeTitle: this.root.querySelector('#tkResume').value.trim(),
        note: this.root.querySelector('#tkNote').value.trim(),
        updatedAt: Date.now()
      };

      if (this.editingId) {
        // 编辑
        this.list = this.list.map(function (r) {
          return r.id === this.editingId ? Object.assign({}, r, data) : r;
        }, this);
      } else {
        // 新建
        this.list.push(Object.assign({
          id: genId(),
          appliedAt: Date.now()
        }, data));
      }
      saveAll(this.list);
      this.closeEditor();
      this.render();
    },

    deleteRow: function (id) {
      var r = this.list.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      if (!confirm('删除投递记录「' + r.company + ' · ' + r.position + '」？')) return;
      this.list = this.list.filter(function (x) { return x.id !== id; });
      saveAll(this.list);
      this.render();
    }
  };

  global.TrackerView = TrackerView;
})(window);
