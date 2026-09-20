/* 性能回归（#9）：drawPageGuides 经 requestAnimationFrame 合并，避免每键 renderPreview 同步重画分页线。
   纯 Node、零依赖；在隔离 vm 上下文里跑，断言走 ctx.assert。

   失效面：若合并守卫（_guideRaf）被删，连续 renderPreview 会每键各调度一次 rAF →
   本用例断言 rafCalls.length === 1 会变红（变异测试可证伪）。 */

'use strict';

module.exports = [
  { name: '分页线rAF合并', fn: function (ctx) {
    const X = ctx.ResumeRender;
    ctx.assert(typeof X.renderPreview === 'function', 'renderPreview 可访问（#9 可测前提）');
    // 桩 rAF：只捕获「被调度了几次」，不真正执行（不触发微任务），便于统计合并效果。
    // 必须桩在 vm 全局（ctx.global）上，scheduleDrawPageGuides 在 vm 内解析 requestAnimationFrame。
    const vmGlobal = ctx.global || ctx;
    let rafCalls = [];
    const origRaf = vmGlobal.requestAnimationFrame;
    vmGlobal.requestAnimationFrame = function (cb) { rafCalls.push(cb); return rafCalls.length; };
    try {
      X.renderPreview();
      X.renderPreview();
      X.renderPreview();
    } catch (e) {
      vmGlobal.requestAnimationFrame = origRaf;
      ctx.assert(false, '连续 3 次 renderPreview 不应抛错（' + (e && e.message ? e.message : e) + '）');
      return;
    }
    vmGlobal.requestAnimationFrame = origRaf;
    ctx.assert(rafCalls.length === 1,
      '连续 3 次 renderPreview 只调度 1 次 rAF（分页线重画合并到单帧），实际 ' + rafCalls.length + ' 次');
    // 执行合并后的那一帧：drawPageGuides 真正跑一次（验证合并的是有效调用，而非丢调用）
    if (rafCalls.length === 1) {
      try { rafCalls[0](); } catch (e) { ctx.assert(false, '合并帧执行 drawPageGuides 不应抛错（' + (e && e.message ? e.message : e) + '）'); }
    }
  }},

  { name: '预览缩放rAF合并', fn: function (ctx) {
    const X = ctx.ResumeRender;
    ctx.assert(typeof X.schedulePreviewScale === 'function', 'schedulePreviewScale 可访问（第 3 层可测前提）');
    // 桩 rAF：只捕获「被调度了几次」，不真正执行 applyPreviewScale（避免触发 reflow 读数）。
    const vmGlobal = ctx.global || ctx;
    let rafCalls = [];
    const origRaf = vmGlobal.requestAnimationFrame;
    vmGlobal.requestAnimationFrame = function (cb) { rafCalls.push(cb); return rafCalls.length; };
    try {
      // 模拟 MutationObserver + ResizeObserver + resize + orientationchange 的连续高频触发
      X.schedulePreviewScale();
      X.schedulePreviewScale();
      X.schedulePreviewScale();
      X.schedulePreviewScale();
    } catch (e) {
      vmGlobal.requestAnimationFrame = origRaf;
      ctx.assert(false, '连续 4 次 schedulePreviewScale 不应抛错（' + (e && e.message ? e.message : e) + '）');
      return;
    }
    vmGlobal.requestAnimationFrame = origRaf;
    ctx.assert(rafCalls.length === 1,
      '连续 4 次 schedulePreviewScale 只调度 1 次 rAF（缩放 reflow 合并到单帧），实际 ' + rafCalls.length + ' 次');
  }},
];
