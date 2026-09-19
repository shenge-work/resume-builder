/* =============================================================
 * provider.js · 浏览器侧 AI 调用层（P1）
 * -------------------------------------------------------------
 * 唯一出口：POST /api/ai/chat（SSE）。本模块负责：
 *   1. 状态 / 连通性探测
 *   2. SSE 流式读取 → onChunk(text) 回调
 *   3. AbortController 中断
 *
 * 纯函数 parseSSEBuffer(buffer) 抽到模块顶层，便于单测。
 * ============================================================= */
(function (global) {
  'use strict';

  /* 纯函数：解析一段 SSE 文本。返回：
   *   { deltas: ['增量文本', ...], done: bool, error: null|'...', remaining: '未读完的尾巴' }
   * 调用方维护一个 buffer：每次把新到的 chunk 拼到 buffer 末尾，然后调本函数。
   * 处理完后把返回的 remaining 留作下次的起始 buffer。
   */
  function parseSSEBuffer(buffer) {
    var deltas = [];
    var done = false;
    var error = null;
    if (typeof buffer !== 'string' || !buffer) {
      return { deltas: deltas, done: done, error: error, remaining: '' };
    }
    var raw = buffer.replace(/\r/g, '');
    var lines = raw.split('\n');
    var remaining = lines.pop() || '';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      // SSE 注释行（以 : 开头）直接忽略
      if (line.charAt(0) === ':') continue;
      if (line.indexOf('data: ') !== 0) continue;
      var payload = line.slice(6).trim();
      if (payload === '[DONE]') { done = true; continue; }
      try {
        var obj = JSON.parse(payload);
        if (obj && obj.error) {
          error = (obj.error && obj.error.message) || JSON.stringify(obj.error);
          continue;
        }
        var choice = obj && obj.choices && obj.choices[0];
        var text = choice && choice.delta && choice.delta.content;
        if (typeof text === 'string' && text) deltas.push(text);
      } catch (e) { /* 非 JSON 行忽略 */ }
    }
    return { deltas: deltas, done: done, error: error, remaining: remaining };
  }

  var ResumeAI = {
    /* 探测本地转发层状态（不打上游） */
    async status() {
      try {
        var r = await fetch('/api/ai/status', { cache: 'no-store' });
        if (!r.ok) return { configured: false, error: 'HTTP ' + r.status };
        return await r.json();
      } catch (e) {
        return { configured: false, error: String(e && e.message || e), offline: true };
      }
    },

    /* 发一条 ping 测连通性（会消耗少量 token） */
    async test() {
      try {
        var r = await fetch('/api/ai/test', { method: 'POST' });
        return await r.json();
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    },

    /* 流式对话。opts:
     *   { messages, model, temperature, onChunk(text), onDone(), signal }
     * 返回完整文本（拼接所有 onChunk），便于非流式场景直接用。
     */
    async chat(opts) {
      opts = opts || {};
      var onChunk = opts.onChunk || function () {};
      var onDone = opts.onDone || function () {};
      var resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: opts.messages || [],
          model: opts.model || undefined,
          temperature: typeof opts.temperature === 'number' ? opts.temperature : undefined,
          stream: true
        }),
        signal: opts.signal
      });

      if (!resp.ok) {
        var text = await resp.text().catch(function () { return ''; });
        var msg = 'HTTP ' + resp.status;
        try { var j = JSON.parse(text); if (j.error) msg = j.error; } catch (e) { if (text) msg = text.slice(0, 200); }
        throw new Error(msg);
      }

      var reader = resp.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';
      var full = '';
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        buffer += decoder.decode(r.value, { stream: true });
        var parsed = parseSSEBuffer(buffer);
        buffer = parsed.remaining;
        for (var i = 0; i < parsed.deltas.length; i++) {
          full += parsed.deltas[i];
          onChunk(parsed.deltas[i]);
        }
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.done) break;
      }
      onDone();
      return full;
    },

    parseSSEBuffer: parseSSEBuffer
  };

  global.ResumeAI = ResumeAI;
})(window);
