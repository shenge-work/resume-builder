/* =============================================================
 * JD 匹配分析（ResumeJd）
 * -------------------------------------------------------------
 * 粘贴目标岗位的 JD，回答三个此前工具完全无法回答的问题：
 *   ① 这份简历覆盖了 JD 的哪些要求？        （已覆盖）
 *   ② 哪些只是「擦边提到」？                （弱覆盖 —— 只出现 1 次，通常意味着不够突出）
 *   ③ 哪些要求完全没写？                    （缺失 —— 投递前最该补的就是这些）
 *
 * 为什么需要它：本工具此前只有「通用体检」（页数 / 完整性 / 量化 / ATS），
 * 完全不看目标岗位 —— 而「一岗一版」恰恰是简历真正起作用的方式。
 *
 * 纯规则、纯前端、零依赖、不联网（AI 方案仍暂停，这里同样用规则顶上）。
 * 只读简历数据（经 window.ResumeEditor.getData()）：不修改数据、不触发保存、不进撤销栈。
 * JD 原文只存在浏览器偏好（localStorage）里，**不写进简历数据、不随简历同步**。
 *
 * 接口：
 *   ResumeJd.extractTerms(jdText)      → [{term,key,count,bonus}]  术语抽取（可单测）
 *   ResumeJd.countHits(term, text)     → number                    匹配计数（可单测）
 *   ResumeJd.analyze(payload, jdText)  → {stats, groups}           纯函数，不碰 DOM
 *   ResumeJd.render(el?) / analyzeNow() / toggle() / clearJd()
 * ============================================================= */
(function (global) {
  'use strict';

  var JD_KEY = 'resume_jd_text_v1';

  /* JD 里高频出现、但不构成「技能要求」的英文通用词 */
  var EN_STOP = {
    the: 1, and: 1, or: 1, to: 1, of: 1, in: 1, a: 1, an: 1, is: 1, are: 1, be: 1, with: 1,
    for: 1, on: 1, at: 1, by: 1, as: 1, we: 1, you: 1, your: 1, our: 1, will: 1, can: 1,
    has: 1, have: 1, it: 1, its: 1, that: 1, this: 1, from: 1, not: 1, but: 1, if: 1, all: 1,
    any: 1, more: 1, than: 1, into: 1, over: 1, per: 1, etc: 1, eg: 1, ie: 1, about: 1,
    other: 1, such: 1, using: 1, use: 1, used: 1, work: 1, works: 1, team: 1, teams: 1,
    good: 1, well: 1, strong: 1, years: 1, year: 1, plus: 1, above: 1, below: 1, must: 1,
    should: 1, need: 1, needs: 1, able: 1, like: 1, also: 1, may: 1, one: 1, two: 1, three: 1,
    new: 1, old: 1, big: 1, small: 1, job: 1, role: 1, responsibility: 1, responsibilities: 1,
    requirement: 1, requirements: 1, qualification: 1, qualifications: 1, preferred: 1,
    we: 1, us: 1, who: 1, what: 1, how: 1, why: 1, when: 1, where: 1, do: 1, does: 1, did: 1
  };

  /* 中文：先剥掉引导词与尾巴词，「熟悉 Java 并发」要留下「并发」本身 */
  var ZH_HEAD = /^(熟悉|精通|掌握|了解|具备|具有|拥有|有|能|可以|可|会|负责|参与|使用|熟练|要求|需要|良好|较强|一定的?|优先考虑|与|和|或|及|对|把|将|在|从|向|为)+/;
  /* 末段是动词性尾巴：剥掉后剩下的才是名词性技能（「算法协作」→「算法」、「云原生部署」→「云原生」） */
  var ZH_TAIL = /(经验|能力|者优先|优先|者|等|等等|相关|工作|以上|以下|方面|方向|知识|技能|要求|背景|优先考虑|协作|推进|落地|搭建|部署|优化|实践|支撑|维护|迭代|调研|跟进|负责|参与|的|了)+$/;
  /* 学历 / 年限 / 年龄这类硬性门槛不属于「技能关键词」，单独排除，避免刷高噪音。
     末段是 JD 的结构性词（来自「任职要求 / 岗位职责 / 公司介绍」这类标题），同样不是技能。 */
  var ZH_QUALIFY = /(本科|硕士|博士|专科|统招|学历|学位|专业|应届|在校|毕业|年|岁以下|岁及以下|周岁|年龄|全职|兼职|实习|沟通|责任心|团队协作|学习能力|任职|岗位|职责|描述|介绍|说明|条件|待遇|薪资|福利|地点|城市|招聘|应聘|投递|面试)/;

  var EN_RE = /[A-Za-z][A-Za-z0-9+#_.\-]{0,19}/g;
  var CLAUSE_SPLIT = /[\n\r。；;！!?？]+/;
  /* 含「.」：JD 的编号列表（"3. 与产品协作"）不切会把编号粘进关键词里 */
  var SEG_SPLIT = /[\n\r，,。；;、：:（）()【】\[\]{}<>\/|·"'.\u201c\u201d\u2018\u2019]+/;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ---------- 术语判定 ---------- */
  function usefulEn(w) {
    var t = String(w || '').replace(/[._\-+#]+$/, '');
    if (!t) return '';
    var low = t.toLowerCase();
    if (EN_STOP[low]) return '';
    if (t.length < 2 && !/^[CRK]$/.test(t)) return '';   // C / R / K 是有效技术词
    if (/^\d+$/.test(t)) return '';
    if (t.indexOf('@') !== -1) return '';                 // 邮箱片段
    return t;
  }
  function usefulZh(seg) {
    /* 顺序要紧：先去空白再剥引导词/尾巴词 —— 否则段首空格（"3. 与产品" 切出来的 " 与产品"）
       会挡住 ^ 锚定的前缀剥离，编号和连词就粘进了关键词。 */
    var t = String(seg || '').replace(/\s+/g, '').trim();
    t = t.replace(ZH_HEAD, '').replace(ZH_TAIL, '').trim();
    if (t.length < 2 || t.length > 10) return '';
    if (ZH_QUALIFY.test(t)) return '';
    if (/[A-Za-z]/.test(t)) return '';                     // 含拉丁字母的一律交给英文提取，避免 "Prompt 工程实践" 这种混血噪音
    if (!/[\u4e00-\u9fa5]/.test(t)) return '';             // 纯数字/符号不算关键词
    return t;
  }

  /* ---------- 术语抽取：按小句走，才能判断该词是否属于「加分项」 ---------- */
  function extractTerms(jdText) {
    var text = String(jdText == null ? '' : jdText);
    if (!text.trim()) return [];
    var map = {};
    var add = function (term, bonus) {
      if (!term) return;
      var key = term.toLowerCase();
      if (map[key]) { map[key].count++; if (bonus) map[key].bonus = true; return; }
      map[key] = { term: term, key: key, count: 1, bonus: !!bonus };
    };

    text.split(CLAUSE_SPLIT).forEach(function (clause) {
      var bonus = /(优先|加分|更佳|nice to have|preferred|plus)/i.test(clause);
      /* 英文先带位置收 token，再把「相邻且中间只有一个空格」的合并成短语（最多 3 个词）。
         不合并的代价是实的：JD 写 "Spring Boot"，会被拆成 Spring / Boot 两个词，
         简历里只出现 Spring 也算两个都覆盖 —— 直接把匹配度刷高。 */
      var toks = [];
      var re = new RegExp(EN_RE.source, 'g');
      var m;
      while ((m = re.exec(clause)) !== null) {
        toks.push({ v: m[0], s: m.index, e: m.index + m[0].length });
      }
      var i = 0;
      while (i < toks.length) {
        var j = i, phrase = toks[i].v;
        while (j + 1 < toks.length && (j - i) < 2
               && toks[j + 1].s - toks[j].e === 1 && /\s/.test(clause.charAt(toks[j].e))) {
          j++;
          phrase += ' ' + toks[j].v;
        }
        add(usefulEn(phrase), bonus);
        i = j + 1;
      }
      clause.split(SEG_SPLIT).forEach(function (seg) { add(usefulZh(seg), bonus); });
    });

    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /* ---------- 匹配计数：英文按词边界（Java 不该命中 JavaScript），中文按子串 ---------- */
  function countHits(term, text) {
    var t = String(term == null ? '' : term);
    var hay = String(text == null ? '' : text);
    if (!t || !hay) return 0;
    if (/^[A-Za-z#+]/.test(t)) {
      // 用前瞻而非消费字符：连续出现 "Java,Java" 也要数到 2 次
      var re = new RegExp('(?:^|[^A-Za-z0-9+#])' + escapeRe(t) + '(?![A-Za-z0-9+#])', 'gi');
      var n = 0;
      while (re.exec(hay) !== null) { n++; if (re.lastIndex === 0) break; }
      return n;
    }
    var c = 0, i = 0;
    while ((i = hay.indexOf(t, i)) !== -1) { c++; i += t.length; }
    return c;
  }

  /* ---------- 把简历按板块收集成纯文本（供逐板块定位命中位置） ---------- */
  function sectionsOf(payload) {
    var data = (payload && payload.data) || {};
    var out = [];
    var walk = function (node, acc) {
      if (node == null) return;
      if (typeof node === 'string') { if (node) acc.push(node); return; }
      if (Array.isArray(node)) { node.forEach(function (n) { walk(n, acc); }); return; }
      if (typeof node === 'object') {
        Object.keys(node).forEach(function (k) {
          // 排除非内容字段：id 是标识、type 是板块类型、logo 是图片数据
          if (k === 'id' || k === 'type' || k === 'logo') return;
          walk(node[k], acc);
        });
      }
    };
    var head = [];
    ['name', 'subtitle', 'meta'].forEach(function (k) { walk(data[k], head); });
    if (Array.isArray(data.contact)) data.contact.forEach(function (c) { walk(c, head); });
    if (head.length) out.push({ title: '基本信息', text: head.join('\n') });
    (Array.isArray(data.sections) ? data.sections : []).forEach(function (sec) {
      var acc = [];
      walk(sec, acc);
      out.push({ title: String((sec && sec.title) || '未命名板块'), text: acc.join('\n') });
    });
    return out;
  }

  /* ---------- 主分析（纯函数，不碰 DOM） ---------- */
  function analyze(payload, jdText) {
    var terms = extractTerms(jdText);
    var secs = sectionsOf(payload);
    var allText = secs.map(function (s) { return s.text; }).join('\n');
    var groups = { covered: [], weak: [], missing: [] };

    terms.forEach(function (t) {
      var hits = countHits(t.term, allText);
      var inSections = [];
      if (hits > 0) {
        secs.forEach(function (s) {
          if (countHits(t.term, s.text) > 0) inSections.push(s.title);
        });
      }
      var item = { term: t.term, hits: hits, bonus: t.bonus, jdCount: t.count, inSections: inSections };
      if (hits >= 2) groups.covered.push(item);
      else if (hits === 1) groups.weak.push(item);
      else groups.missing.push(item);
    });

    /* 排序：把「加分项」沉到后面（不是必须项），同类按 JD 中出现次数降序 */
    var byWeight = function (a, b) {
      if (a.bonus !== b.bonus) return a.bonus ? 1 : -1;
      if (b.jdCount !== a.jdCount) return b.jdCount - a.jdCount;
      return a.term < b.term ? -1 : (a.term > b.term ? 1 : 0);
    };
    groups.covered.sort(byWeight);
    groups.weak.sort(byWeight);
    groups.missing.sort(byWeight);

    var total = terms.length;
    return {
      stats: {
        total: total,
        covered: groups.covered.length,
        weak: groups.weak.length,
        missing: groups.missing.length,
        /* 覆盖分：弱覆盖按半分计 —— 出现过不等于写得突出 */
        score: total ? Math.round(100 * (groups.covered.length + 0.5 * groups.weak.length) / total) : 0
      },
      groups: groups
    };
  }

  /* ---------- JD 文本持久化（浏览器偏好，不进简历数据） ---------- */
  function getJd() {
    try { return global.localStorage ? (global.localStorage.getItem(JD_KEY) || '') : ''; }
    catch (e) { return ''; }
  }
  function setJd(t) {
    try { if (global.localStorage) global.localStorage.setItem(JD_KEY, String(t == null ? '' : t)); }
    catch (e) { /* 隐私模式等写不了，忽略 */ }
  }

  /* ---------- 渲染 ---------- */
  var lastResult = null;

  function chips(list, cls) {
    return list.map(function (it) {
      var meta = it.hits ? (it.hits + ' 处') : '';
      if (it.bonus) meta += (meta ? ' · ' : '') + '加分项';
      return '<span class="jd-chip ' + cls + '" data-term="' + esc(it.term) + '">'
        + esc(it.term) + (meta ? '<i>' + esc(meta) + '</i>' : '') + '</span>';
    }).join('');
  }

  function render(el) {
    if (typeof document === 'undefined') return;
    var box = el || document.getElementById('jdBody');
    if (!box) return;
    var r = lastResult;
    if (!r) {
      box.innerHTML = '<div class="audit-empty">粘贴目标岗位的 JD 后点「分析匹配度」，会列出<b>已覆盖 / 弱覆盖 / 缺失</b>三档关键词。</div>';
      return;
    }
    var s = r.stats;
    if (!s.total) {
      box.innerHTML = '<div class="audit-empty">这份 JD 里没提取到可匹配的关键词 —— 试着多粘一段「任职要求」。</div>';
      return;
    }
    var h = '<div class="audit-stats">'
      + '<span><b>' + s.score + '</b> 分</span>'
      + '<span><b>' + s.covered + '</b> 已覆盖</span>'
      + '<span><b>' + s.weak + '</b> 弱覆盖</span>'
      + '<span><b>' + s.missing + '</b> 缺失</span>'
      + '<span class="audit-sum">共 ' + s.total + ' 个关键词</span>'
      + '</div>';

    h += '<div class="jd-groups">';
    if (r.groups.missing.length) {
      h += '<div class="jd-group"><div class="jd-group-title">缺失（' + r.groups.missing.length + '）'
        + '<span class="jd-group-hint">JD 里有、简历里没有 —— 若确实具备，补进「专业技能」或对应经历</span></div>'
        + '<div class="jd-chips">' + chips(r.groups.missing, 'missing') + '</div></div>';
    }
    if (r.groups.weak.length) {
      h += '<div class="jd-group"><div class="jd-group-title">弱覆盖（' + r.groups.weak.length + '）'
        + '<span class="jd-group-hint">只出现 1 次 —— 通常意味着写了但不够突出</span></div>'
        + '<div class="jd-chips">' + chips(r.groups.weak, 'weak') + '</div></div>';
    }
    if (r.groups.covered.length) {
      h += '<div class="jd-group"><div class="jd-group-title">已覆盖（' + r.groups.covered.length + '）</div>'
        + '<div class="jd-chips">' + chips(r.groups.covered, 'covered') + '</div></div>';
    }
    h += '</div>';

    h += '<div class="audit-foot">'
      + '<button class="mini-btn" onclick="ResumeJd.copyMissing()">复制缺失清单</button>'
      + '<button class="mini-btn" onclick="ResumeJd.analyzeNow()">重新分析</button>'
      + '</div>';
    box.innerHTML = h;
  }

  /* ---------- 取当前简历数据（只读） ---------- */
  function currentPayload() {
    try {
      var ed = global.ResumeEditor;
      return (ed && typeof ed.getData === 'function') ? ed.getData() : null;
    } catch (e) { return null; }
  }

  function analyzeNow() {
    var ta = document.getElementById('jdInput');
    var text = ta ? ta.value : getJd();
    if (ta) setJd(text);
    lastResult = analyze(currentPayload(), text);
    render();
    return lastResult;
  }

  function toggle() {
    var panel = document.getElementById('panel-jd');
    if (!panel) return;
    if (panel.classList.contains('collapsed')) {
      panel.classList.remove('collapsed');
      var ta = document.getElementById('jdInput');
      if (ta && !ta.value) ta.value = getJd();   // 回填上次粘贴的 JD
      analyzeNow();
    } else {
      panel.classList.add('collapsed');
    }
  }

  function clearJd() {
    var ta = document.getElementById('jdInput');
    if (ta) ta.value = '';
    setJd('');
    lastResult = null;
    render();
  }

  /* 把缺失项复制成纯文本：方便拿着它去改简历（或丢给 AI 让它给说法） */
  function copyMissing() {
    if (!lastResult) return '';
    var lines = lastResult.groups.missing.map(function (it) {
      return '- ' + it.term + (it.jdCount > 1 ? '（JD 中提到 ' + it.jdCount + ' 次）' : '');
    });
    var text = lines.length
      ? '目标岗位 JD 中未在简历出现的关键词：\n' + lines.join('\n')
      : '没有缺失项。';
    try {
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text);
      } else if (typeof global.alert === 'function') {
        global.alert(text);
      }
    } catch (e) { /* 剪贴板不可用就算了，不打断流程 */ }
    return text;
  }

  global.ResumeJd = {
    extractTerms: extractTerms,
    countHits: countHits,
    analyze: analyze,
    sectionsOf: sectionsOf,
    getJd: getJd,
    setJd: setJd,
    render: render,
    analyzeNow: analyzeNow,
    toggle: toggle,
    clearJd: clearJd,
    copyMissing: copyMissing,
    last: function () { return lastResult; }
  };
})(typeof window !== 'undefined' ? window : this);
