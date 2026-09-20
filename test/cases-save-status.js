/* 保存状态条（js/ui/save-status.js）测试 + 存储降级通知的行为验证 + 接线断言。
   与其它 cases-*.js 同构（CommonJS + ctx.assert + 可返回 Promise）。

   这一组特别针对「静默失败」这类**没有报错、只是不说话**的缺陷：
     · 状态机的每个态是否真的产出**不同**文案（防止退化成永远显示「已保存」）；
     · 存储层写盘失败时，降级通知是否真的发出（这是本次新增的唯一可感知通道，
       此前 http 失败会被静默降级、并以「成功」返回，上层连 catch 都进不去）；
     · 五个接线点是否齐全（index.html / build-single 白名单 / app.js 三态 / CSS / store API），
       漏任何一处都是「静默缺功能」，与项目里 verify:assets 要防的是同一类失效。 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SAMPLE_DOC = {
  savedAt: 1,
  data: { name: '测试者', contact: [], sections: [] },
  fonts: null, spacing: null, v: 8
};

/* 在**完全隔离**的 vm 沙箱里加载一份 ResumeLibrary，并让 fetch 必然失败。
   不共用运行器的主上下文：降级会改写模块级的 _backend / _lsFallback，
   在共享上下文里做这件事会污染其它用例（此前实测把 library 的往返读取用例带红了）。 */
function makeFailingDiskLib() {
  const store = new Map();
  const sandbox = {
    console, JSON, Date, Math, Object, Array, String, Number, Boolean, Promise, Error, RegExp,
    setTimeout, clearTimeout, parseInt, parseFloat, isNaN,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); }
    },
    fetch: () => Promise.reject(new Error('disk unavailable')),
    indexedDB: undefined,
    location: {},
    document: { getElementById: () => null }
  };
  sandbox.window = sandbox;   // IIFE 取 (typeof window !== 'undefined' ? window : this)
  vm.createContext(sandbox);
  vm.runInContext(read('js/store/resume-library.js'), sandbox, { filename: 'resume-library.js' });
  return sandbox.ResumeLibrary;
}

module.exports = [
  /* ---------- 一、状态机纯逻辑 ---------- */
  {
    name: '初态为 idle 且无文案',
    fn: (ctx) => {
      const S = ctx.SaveStatus;
      S._reset();
      ctx.assert(S.state() === 'idle', "初态为 'idle'");
      ctx.assert(S.text() === '', 'idle 不产出文案（状态条整体隐藏）');
    }
  },
  {
    name: '编辑中 / 保存中两态文案可区分',
    fn: (ctx) => {
      const S = ctx.SaveStatus;
      S.markEditing();
      ctx.assert(S.state() === 'editing' && S.text() === '编辑中…', 'markEditing → 「编辑中…」');
      S.markSaving();
      ctx.assert(S.state() === 'saving' && S.text() === '保存中…', 'markSaving → 「保存中…」');
    }
  },
  {
    name: '已保存态带 HH:MM 时刻',
    fn: (ctx) => {
      const S = ctx.SaveStatus;
      S.markSaved();
      const t = S.text();
      ctx.assert(S.state() === 'saved', "状态为 'saved'");
      ctx.assert(t.indexOf('已保存') !== -1, '文案含「已保存」（实际：「' + t + '」）');
      ctx.assert(/\d{2}:\d{2}/.test(t), '文案带 HH:MM 时刻（实际：「' + t + '」）');
    }
  },
  {
    name: '失败态说清「失败」并给出重试入口',
    fn: (ctx) => {
      const S = ctx.SaveStatus;
      S.markFailed('磁盘只读');
      const t = S.text();
      ctx.assert(S.state() === 'failed', "状态为 'failed'");
      ctx.assert(t.indexOf('保存失败') !== -1, '文案含「保存失败」');
      ctx.assert(t.indexOf('重试') !== -1, '文案提示可重试');
      ctx.assert(t.indexOf('磁盘只读') !== -1, '带上具体原因，便于用户判断');
    }
  },
  {
    name: '降级态必须说清「只暂存在本浏览器」',
    fn: (ctx) => {
      const S = ctx.SaveStatus;
      S.markDegraded();
      const t = S.text();
      ctx.assert(S.state() === 'degraded', "状态为 'degraded'");
      ctx.assert(t.indexOf('磁盘写入失败') !== -1, '文案点明磁盘写入失败');
      ctx.assert(t.indexOf('本浏览器') !== -1, '文案点明改动只暂存在本浏览器（不落盘）');
      ctx.assert(t.indexOf('重试') !== -1, '提供重试入口');
    }
  },
  {
    name: '启动说明态原样呈现',
    fn: (ctx) => {
      const S = ctx.SaveStatus;
      S.markInfo('✓ 已从仓库 data/resume.json 加载');
      ctx.assert(S.state() === 'info', "状态为 'info'");
      ctx.assert(S.text() === '✓ 已从仓库 data/resume.json 加载', '文案原样呈现');
    }
  },
  {
    name: '五个状态文案两两不同（防状态机退化成一句话）',
    fn: (ctx) => {
      const S = ctx.SaveStatus;
      const seen = [];
      const snap = (fn) => { fn(); seen.push(S.text()); };
      snap(() => S.markEditing());
      snap(() => S.markSaving());
      snap(() => S.markSaved());
      snap(() => S.markFailed('x'));
      snap(() => S.markDegraded());
      const uniq = {};
      seen.forEach((t) => { uniq[t] = 1; });
      ctx.assert(Object.keys(uniq).length === 5, '5 个态产出 5 种不同文案（实际 ' + Object.keys(uniq).length + ' 种）');
      ctx.assert(seen[2] !== seen[4], '「已保存」与「降级告警」文案绝不相同 —— 否则降级会被成功提示掩盖');
    }
  },
  {
    name: 'init 在无 DOM 环境下不抛错',
    fn: (ctx) => {
      let threw = null;
      try { ctx.SaveStatus.init(); } catch (e) { threw = e; }
      ctx.assert(threw === null, 'init 不抛错（实际：' + (threw && threw.message) + '）');
    }
  },

  /* ---------- 二、存储降级通知的真实行为（不只是文本匹配）---------- */
  {
    name: '写盘失败会切到 localStorage 并发出一次降级通知',
    fn: async (ctx) => {
      const L = makeFailingDiskLib();
      let degradeCount = 0;
      L.onDegrade(() => { degradeCount++; });
      const r = await L.save('degrade-probe', SAMPLE_DOC);
      ctx.assert(degradeCount === 1, '降级恰好通知一次（实际 ' + degradeCount + ' 次）');
      ctx.assert(L.isDegraded() === true, 'isDegraded() 为 true');
      ctx.assert(L.backendKind() === 'localstorage', "backendKind() 变更为 'localstorage'");
      ctx.assert(!!r, '降级后本次保存仍以「成功」返回 —— 正因如此，上层只能靠通知感知失败');
      ctx.assert(L._stores && typeof L._stores._resetBackend === 'function', '提供 _resetBackend 测试钩子');
    }
  },
  {
    name: 'retryDisk 能清掉降级锁并如实报告此前状态',
    fn: async (ctx) => {
      const L = makeFailingDiskLib();
      await L.save('degrade-probe', SAMPLE_DOC);
      ctx.assert(L.isDegraded() === true, '前置条件：已进入降级态');
      const was = L.retryDisk();
      ctx.assert(was === true, 'retryDisk 返回「此前确实处于降级态」');
      ctx.assert(L.isDegraded() === false, 'retryDisk 后降级锁已清除（下次读写会重新尝试磁盘）');
    }
  },
  {
    name: '未降级时 retryDisk 如实返回 false',
    fn: (ctx) => {
      const L = makeFailingDiskLib();
      ctx.assert(L.isDegraded() === false, '新实例处于正常（未降级）态');
      ctx.assert(L.retryDisk() === false, 'retryDisk 返回 false（此前并不处于降级态）');
    }
  },

  /* ---------- 三、接线断言（漏一处就是静默缺功能）---------- */
  {
    name: 'index.html 引入状态条脚本并含容器，且早于 app.js',
    fn: (ctx) => {
      const html = read('index.html');
      ctx.assert(/id="saveBar"/.test(html), '包含状态条容器 #saveBar');
      ctx.assert(/class="save-bar-text"/.test(html), '包含文案节点 .save-bar-text');
      ctx.assert(/class="save-bar-retry"/.test(html), '包含重试按钮 .save-bar-retry');
      ctx.assert(/role="status"/.test(html) && /aria-live="polite"/.test(html), '带 role=status + aria-live（读屏可感知保存结果）');
      ctx.assert(/<script src="js\/ui\/save-status\.js"><\/script>/.test(html), '引入了 js/ui/save-status.js');
      // 用完整 script 标签定位：注释里也会出现同名字符串，裸 indexOf 会命中注释而误判
      const tag = (f) => html.indexOf('<script src="' + f + '"></script>');
      ctx.assert(tag('js/ui/save-status.js') !== -1, 'save-status.js 以 script 标签引入');
      ctx.assert(tag('js/ui/save-status.js') < tag('js/app.js'),
        'save-status.js 在 app.js 之前加载（否则 app.js 解构时拿不到）');
      ctx.assert(tag('js/store/resume-library.js') < tag('js/ui/save-status.js'),
        'save-status.js 在存储层之后加载（init 时要注册降级回调）');
    }
  },
  {
    name: 'build-single.js 白名单已登记（否则单文件版静默缺功能）',
    fn: (ctx) => {
      const build = read('tools/build-single.js');
      ctx.assert(/js\/ui\/save-status\.js/.test(build), '白名单含 js/ui/save-status.js');
    }
  },
  {
    name: 'app.js 三态与重试接线齐全',
    fn: (ctx) => {
      const app = read('js/app.js');
      ctx.assert(/SaveStatus\.markSaving\(\)/.test(app), 'saveState 标记「保存中」');
      ctx.assert(/SaveStatus\.markSaved\(\)/.test(app), '成功路径标记「已保存」');
      ctx.assert(/SaveStatus\.markFailed\(/.test(app), '失败路径标记「保存失败」');
      ctx.assert(/SaveStatus\.markDegraded\(\)/.test(app), '降级路径标记「降级告警」');
      ctx.assert(/SaveStatus\.init\(\)/.test(app), '启动时 init 状态条');
      ctx.assert(/SaveStatus\.onRetry\(retrySave\)/.test(app), '重试按钮接上 retrySave');
      ctx.assert(/function retrySave\(/.test(app), 'retrySave 已实现');
      ctx.assert(/retryDisk\(\)/.test(app), '重试会先清降级锁（否则重试是空动作）');
      ctx.assert(/isDegradedNow\(\)/.test(app), '降级态判断已实现');
      ctx.assert(/if\(isDegradedNow\(\)\) SaveStatus\.markDegraded\(\)/.test(app),
        '已保存 / 降级判定处优先呈现降级（否则「已保存」会盖掉告警）');
      ctx.assert(/SaveStatus\.markSaved\(\)\s*:/.test(app) || /else SaveStatus\.markSaved\(\)/.test(app),
        '非降级时才显示「已保存」');
    }
  },
  {
    name: '存储层暴露 onDegrade / isDegraded / retryDisk 三个接口',
    fn: (ctx) => {
      const lib = read('js/store/resume-library.js');
      ctx.assert(/onDegrade:/.test(lib), '暴露 onDegrade（注册降级回调）');
      ctx.assert(/isDegraded:/.test(lib), '暴露 isDegraded（查询降级态）');
      ctx.assert(/retryDisk:/.test(lib), '暴露 retryDisk（清锁重试）');
      ctx.assert(/_degradeHandler/.test(lib), '降级处确实调用了回调（不是只声明未接线）');
      ctx.assert(/if \(typeof _degradeHandler === 'function'\)/.test(lib), '调用前做了函数校验');
    }
  },
  {
    name: '样式存在且打印隐藏',
    fn: (ctx) => {
      const css = read('css/style.css');
      ctx.assert(/\.save-bar\{/.test(css), '有 .save-bar 基础样式');
      ctx.assert(/\.save-bar\[hidden\]\{display:none;\}/.test(css), 'hidden 时确实不占位（否则空条常驻）');
      ctx.assert(/data-state="failed"/.test(css) && /data-state="degraded"/.test(css), '失败 / 降级态有独立视觉');
      ctx.assert(/@media print\{\.save-bar\{display:none/.test(css), '打印时隐藏状态条（不污染简历）');
      ctx.assert(/--ui-faint|--ui-text/.test(css), '配色走 --ui-* 变量（守住灰阶与暗色主题）');
    }
  },
  {
    name: '数据体检已接线：接口 / 设置页渲染 / 重新检测按钮',
    fn: (ctx) => {
      const sv = read('js/views/settings-view.js');
      ctx.assert(/\/api\/library\/info/.test(sv), '设置页会请求 /api/library/info');
      ctx.assert(/storageCheckBody/.test(sv), '含数据体检容器 #storageCheckBody');
      ctx.assert(/setStorageCheckBtn/.test(sv), '含「重新检测」按钮');
      ctx.assert(/renderStorageCheck\(root\)/.test(sv), '进入设置页即渲染一次（不是停着等用户点）');
      ctx.assert(/isDegraded\(\)/.test(sv), '降级态会在体检里点明（否则显示「本地文件」而实际存在浏览器里）');
      ctx.assert(/未连接本地写服务/.test(sv), '拿不到磁盘事实时明确标注「未知」，不编造路径');
      ctx.assert(/typeof fetch !== 'function'/.test(sv), '无 fetch 环境有保护（否则桌面壳 / 单文件版直接抛错）');

      const srv = read('tools/serve.js');
      ctx.assert(/pathname === '\/api\/library\/info'/.test(srv), 'serve.js 提供 /api/library/info');
      ctx.assert(/legacyExists/.test(srv), '接口上报旧单份数据是否仍存在');
      ctx.assert(/lastWriteAt/.test(srv), '接口上报最近写盘时间');
    }
  }
];
