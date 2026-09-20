/* 本地写服务（tools/serve.js）的 HTTP 冒烟测试。
   与其它 cases-*.js 同构（CommonJS + ctx.assert + 可返回 Promise），但有一条根本区别：
   它**真的把 serve.js 当子进程起起来，打真实 HTTP 请求**，而不是像 run.js 的其它
   serve.js 断言那样只把源码读成字符串做正则匹配。

   为什么必须有这一层：2026-09-20 发现的一处 ReferenceError（u 在 try 块内声明、
   却被块外接口读取）会让整个服务进程在一次普通 GET 请求后直接退出，而当时 371 条
   断言全绿——因为所有断言都只匹配源码文本，从不执行它。本文件就是那个盲区的补丁。

   ⚠️ 副作用控制：测试会写 data/resumes/。开始前备份既有 index.json，结束时还原；
   若目录原本不存在，则只清理本测试创建的文件。绝不触碰用户的简历数据。 */

'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8100 + Math.floor(Math.random() * 800); // 避开默认 8000 / 常被占用的端口
const LIB_DIR = path.join(ROOT, 'data', 'resumes');
const LIB_INDEX = path.join(LIB_DIR, 'index.json');
const TEST_ID = 'http-smoke-tmp';
const READY_TIMEOUT = 8000;

let proc = null;
let readyPromise = null;
let indexBackup = null;
let libDirExisted = false;
let serverLog = '';

function request(method, urlPath, body) {
  return new Promise((resolve) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: urlPath, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch (e) { /* 非 JSON 响应（如 HTML）保持 null */ }
        resolve({ status: res.statusCode, json, raw: buf });
      });
    });
    req.on('error', (e) => resolve({ status: 0, json: null, raw: '', error: e.message }));
    if (payload !== null) req.write(payload);
    req.end();
  });
}

/* 起服务并等到真的能响应 200；后续所有用例共用同一个进程（模块级单例）。 */
function start() {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve) => {
    libDirExisted = fs.existsSync(LIB_DIR);
    if (fs.existsSync(LIB_INDEX)) indexBackup = fs.readFileSync(LIB_INDEX, 'utf8');

    proc = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.js')], {
      cwd: ROOT,
      env: Object.assign({}, process.env, { PORT: String(PORT) }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const eat = (c) => { serverLog += String(c); };
    proc.stdout.on('data', eat);
    proc.stderr.on('data', eat);

    const t0 = Date.now();
    const poll = () => {
      request('GET', '/').then((r) => {
        if (r.status === 200) return resolve({ ok: true });
        if (Date.now() - t0 > READY_TIMEOUT) return resolve({ ok: false, error: r.error || ('HTTP ' + r.status) });
        setTimeout(poll, 120);
      });
    };
    poll();
  });
  return readyPromise;
}

/* 杀子进程 + 还原简历库目录（备份优先，其次只删本测试创建的文件）。 */
function stop() {
  try { if (proc) proc.kill('SIGTERM'); } catch (e) { /* 已退出 */ }
  proc = null;
  try {
    if (indexBackup !== null) {
      fs.writeFileSync(LIB_INDEX, indexBackup, 'utf8');           // 还原用户既有清单
    } else if (!libDirExisted && fs.existsSync(LIB_DIR)) {
      for (const f of fs.readdirSync(LIB_DIR)) {
        if (f === 'index.json' || f.indexOf('http-smoke') === 0) {
          fs.rmSync(path.join(LIB_DIR, f), { force: true });
        }
      }
      if (fs.readdirSync(LIB_DIR).length === 0) fs.rmdirSync(LIB_DIR);
    }
    // 本测试写过的临时文档（若目录原本已存在，单独清掉）
    fs.rmSync(path.join(LIB_DIR, TEST_ID + '.json'), { force: true });
  } catch (e) { /* 清理失败不影响测试结论 */ }
}

/* 进程意外退出也要收尾，否则会留下孤儿服务进程占着端口。 */
process.on('exit', () => { try { if (proc) proc.kill('SIGTERM'); } catch (e) {} });

module.exports = [
  {
    name: '服务能在随机端口启动并就绪',
    fn: async (ctx) => {
      const r = await start();
      ctx.assert(r.ok, 'serve.js 启动后 8 秒内可响应 GET /（实际：' + (r.error || '超时') + '）');
      ctx.assert(/已启动/.test(serverLog), '启动日志包含「已启动」提示');
    }
  },
  {
    name: 'GET /api/library/index 正常返回且进程存活',
    fn: async (ctx) => {
      const r = await request('GET', '/api/library/index');
      ctx.assert(r.status === 200, '索引接口返回 200（实际 ' + r.status + '）');
      ctx.assert(r.json && 'index' in r.json, '响应体含 index 字段');
      const alive = await request('GET', '/');
      ctx.assert(alive.status === 200, '上一请求后服务仍存活');
    }
  },
  {
    name: 'GET /api/library/doc 是启动必经路径，不得崩服务（P0 回归）',
    fn: async (ctx) => {
      const r = await request('GET', '/api/library/doc?id=' + TEST_ID);
      // 这条断言是本次修复的核心探针：修复前该请求抛 ReferenceError 杀进程，
      // 表现为 status=0（连接被拒）；若异常被进程级兜底接住则表现为 status=500。
      ctx.assert(r.status === 200, '按 id 读取文档返回 200（实际 ' + r.status + '，不得为 0/500）');
      ctx.assert(r.json && 'doc' in r.json, '响应体含 doc 字段（不存在时允许为 null）');
      const alive = await request('GET', '/');
      ctx.assert(alive.status === 200, '该请求后服务仍存活（修复前此处进程已退出）');
      ctx.assert(!/\[未捕获异常\]/.test(serverLog), '服务端日志未出现未捕获异常');
    }
  },
  {
    name: 'POST /api/library/index 可写入清单',
    fn: async (ctx) => {
      const r = await request('POST', '/api/library/index', {
        items: [{ id: TEST_ID, title: 'HTTP 冒烟测试', updatedAt: 1 }], activeId: TEST_ID
      });
      ctx.assert(r.status === 200, '写清单返回 200（实际 ' + r.status + '）');
      ctx.assert(r.json && r.json.ok === true, '响应体 ok=true');
    }
  },
  {
    name: 'POST /api/library/doc 写入后能原样读回',
    fn: async (ctx) => {
      const doc = {
        savedAt: 1,
        data: { name: '测试者', contact: [], sections: [{ type: 'text', title: '冒烟', content: '占位' }] },
        fonts: null, spacing: null, v: 8
      };
      const w = await request('POST', '/api/library/doc?id=' + TEST_ID, doc);
      ctx.assert(w.status === 200, '写文档返回 200（实际 ' + w.status + '）');
      const r = await request('GET', '/api/library/doc?id=' + TEST_ID);
      ctx.assert(r.status === 200, '读回返回 200');
      ctx.assert(!!r.json && !!r.json.doc, '读回的 doc 非空');
      ctx.assert(r.json.doc.data.name === '测试者', '姓名往返一致');
      ctx.assert(r.json.doc.data.sections[0].content === '占位', '板块内容往返一致');
      ctx.assert(!!r.json.doc.savedAt, '写盘具备 savedAt 时间戳（数据仲裁依赖它）');
    }
  },
  {
    name: '非法 id 被拒绝，且不产生越权文件',
    fn: async (ctx) => {
      const bad = ['../../etc/passwd', '../../evil', '', 'a'.repeat(200), 'bad id!', 'a/b', '.'];
      for (const id of bad) {
        // 必须经 encodeURIComponent：含空格等字符的原始 id 无法直接进 HTTP 请求行
        const r = await request('GET', '/api/library/doc?id=' + encodeURIComponent(id));
        ctx.assert(r.status === 400, '非法 id「' + (id.length > 20 ? id.slice(0, 20) + '…' : id || '(空)') + '」返回 400（实际 ' + r.status + '）');
      }
      ctx.assert(!fs.existsSync(path.join(ROOT, 'data', 'evil.json')), '未在 data/ 下写出越权文件');
      const alive = await request('GET', '/');
      ctx.assert(alive.status === 200, '一批非法请求后服务仍存活');
    }
  },
  {
    name: '凭证文件绝不经静态服务下发',
    fn: async (ctx) => {
      for (const p of ['/sync.config.json', '/sync.oauth.json', '/sync.state.json']) {
        const r = await request('GET', p);
        ctx.assert(r.status === 403, p + ' 返回 403（实际 ' + r.status + '）');
      }
    }
  },
  {
    name: '非法载荷返回 400 而非 500（错误分类正确）',
    fn: async (ctx) => {
      const r = await request('POST', '/api/library/doc?id=' + TEST_ID, { notADoc: true });
      ctx.assert(r.status === 400, '缺少 data 的载荷返回 400（实际 ' + r.status + '）');
      const r2 = await request('GET', '/api/library/doc' + encodeURIComponent('') + '?id=');
      ctx.assert(r2.status === 400, '空 id 返回 400（实际 ' + r2.status + '）');
    }
  },
  {
    name: 'GET /api/library/info 如实上报存储事实（数据体检）',
    fn: async (ctx) => {
      const r = await request('GET', '/api/library/info');
      ctx.assert(r.status === 200, '存储信息接口返回 200（实际 ' + r.status + '）');
      const j = r.json || {};
      ctx.assert(j.ok === true, 'ok=true');
      ctx.assert(typeof j.base === 'string' && j.base.indexOf('data') !== -1,
        'base 指向本机数据目录（实际 ' + j.base + '）');
      ctx.assert(typeof j.docCount === 'number', 'docCount 为数字');
      ctx.assert(typeof j.dirExists === 'boolean', 'dirExists 为布尔');
      ctx.assert('lastWriteAt' in j, '含 lastWriteAt（无写入时为 null —— 不编造时间）');
      ctx.assert('legacyExists' in j, '含 legacyExists（用于提示旧的单份数据是否仍在）');
      const alive = await request('GET', '/');
      ctx.assert(alive.status === 200, '该请求后服务仍存活');
    }
  },

  {
    name: 'DELETE 删除文档后读回为 null',
    fn: async (ctx) => {
      const d = await request('DELETE', '/api/library/doc?id=' + TEST_ID);
      ctx.assert(d.status === 200, '删除返回 200（实际 ' + d.status + '）');
      const r = await request('GET', '/api/library/doc?id=' + TEST_ID);
      ctx.assert(r.status === 200 && r.json && !r.json.doc, '删除后读回 doc 为 null');
    }
  },
  {
    name: '收尾：关闭服务并还原简历库目录',
    fn: async (ctx) => {
      stop();
      ctx.assert(proc === null, '服务子进程已关闭');
      ctx.assert(indexBackup !== null || !fs.existsSync(path.join(LIB_DIR, TEST_ID + '.json')), '测试文档已清理，未污染用户数据');
      ctx.assert(!/\[未处理的 Promise 拒绝\]/.test(serverLog), '全程无未处理的 Promise 拒绝');
    }
  }
];
