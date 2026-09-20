/* =============================================================
 * 经历素材库（ResumeSnippets，A5：STAR 片段复用）
 * -------------------------------------------------------------
 * 把一段段 STAR（情境 Situation-任务 Task-行动 Action-结果 Result）经历作为
 * 可复用片段存起来，投不同岗位时按需勾选、组装进简历 —— 资深求职者的真实工作流：
 * 同一段经历投不同岗位，侧重写法不同，不该每份简历从零重写。
 *
 * 存储：localStorage（浏览器偏好层，与简历数据分离、不随飞书同步）。
 *   数据体积小、纯前端、零依赖。
 *
 * 纯函数可单测：
 *   normalizeTags(arr)        → 去重、去空、trim 的标签数组
 *   matchSnippets(snippets, terms) → 按「命中关键词数」降序的匹配结果（供 JD 派生推荐）
 *   makeSnippet(title, tags, content) → 构造片段对象
 *
 * 门面接口：
 *   ResumeSnippets.list() / add() / remove(id) / get(id) / count()
 * ============================================================= */
(function (global) {
  'use strict';

  var KEY = 'resume_snippets_v1';

  /* ---------- 纯函数 ---------- */
  function normalizeTags(arr) {
    if (!Array.isArray(arr)) return [];
    var seen = {};
    var out = [];
    arr.forEach(function (t) {
      var s = String(t == null ? '' : t).trim();
      if (s && !seen[s]) { seen[s] = true; out.push(s); }
    });
    return out;
  }

  function makeSnippet(title, tags, content) {
    return {
      id: 'snip_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: String(title == null ? '' : title).trim() || '未命名片段',
      tags: normalizeTags(tags),
      content: String(content == null ? '' : content).trim(),
      updatedAt: Date.now()
    };
  }

  /* 匹配：把「JD 缺失关键词」当作检索词，返回按命中数降序的片段列表。
     命中规则：片段标题 + 内容 + 标签 里出现关键词即 +1（关键词按子串匹配，英文不区分大小写）。 */
  function matchSnippets(snippets, terms) {
    var list = Array.isArray(snippets) ? snippets : [];
    var ts = (terms || []).map(function (t) { return String(t || '').trim().toLowerCase(); }).filter(Boolean);
    if (!ts.length) return [];
    return list.map(function (s) {
      var hay = (String(s.title || '') + '\n' + String(s.content || '') + '\n' + (s.tags || []).join(' ')).toLowerCase();
      var hit = 0;
      ts.forEach(function (t) { if (t && hay.indexOf(t) !== -1) hit++; });
      return { snippet: s, hit: hit };
    }).filter(function (r) { return r.hit > 0; })
      .sort(function (a, b) { return b.hit - a.hit; });
  }

  /* ---------- 存储门面 ---------- */
  function readAll() {
    try {
      var raw = global.localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeAll(arr) {
    try { global.localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) { /* 配额满等：吞掉 */ }
    return arr;
  }

  var ResumeSnippets = {
    /* 纯函数（可单测） */
    normalizeTags: normalizeTags,
    matchSnippets: matchSnippets,
    makeSnippet: makeSnippet,

    list: function () {
      return readAll().slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    },
    get: function (id) {
      var arr = readAll();
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
      return null;
    },
    add: function (title, tags, content) {
      var arr = readAll();
      var s = makeSnippet(title, tags, content);
      arr.push(s);
      writeAll(arr);
      return s;
    },
    remove: function (id) {
      var arr = readAll().filter(function (s) { return s.id !== id; });
      writeAll(arr);
      return arr;
    },
    count: function () { return readAll().length; },

    /* 供测试 / 调试 */
    _key: KEY,
    _reset: function () {
      try { global.localStorage.removeItem(KEY); } catch (e) {}
    }
  };

  global.ResumeSnippets = ResumeSnippets;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

/* CommonJS 导出（供测试 require 纯函数） */
if (typeof module !== 'undefined' && module.exports) {
  var _g = (typeof globalThis !== 'undefined' ? globalThis : this);
  module.exports = {
    normalizeTags: _g.ResumeSnippets.normalizeTags,
    matchSnippets: _g.ResumeSnippets.matchSnippets,
    makeSnippet: _g.ResumeSnippets.makeSnippet
  };
}
