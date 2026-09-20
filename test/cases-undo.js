/* cases-undo.js —— 撤销栈按简历隔离（#7）+ 输入框放行原生撤销
 * 走 ResumeEditor 公共 API（与 cases-menu / cases-jd 同构），不依赖 lexical 绑定。 */
module.exports = [
  {
    name: '撤销栈按简历隔离：切到 r2 后撤销不会回滚 r1 的内容',
    fn(ctx){
      const RB = ctx.ResumeEditor;
      ctx.assert(typeof RB.undo === 'function' && typeof RB.setActiveResumeId === 'function',
        '撤销 / 切换 id API 已暴露');

      // 准备 r1 的两步历史：快照都捕获的是 r1 当时数据
      RB.setActiveResumeId('r1');
      let d = RB.getData().data;
      d.name = 'A0';
      RB.recordHistory('action');      // 快照 A0
      d.name = 'A1';
      RB.recordHistory('action');      // 快照 A1（此时 data = A0）
      d.name = 'A2';                   // 当前 data = A2（尚未进栈）

      // 切到 r2（仅改激活 id；真实 switchResume 还会把 r2 文档载入 data，本测试只验证「栈是否按 id 隔离」）
      RB.setActiveResumeId('r2');
      RB.undo();                       // 在 r2 上撤销：r2 自己的栈为空 → 应为 no-op
      ctx.assert(RB.getData().data.name === 'A2',
        '切到 r2 后按撤销不会把上一份（r1）的内容改回来（旧实现会回滚成 A1）');

      // r1 的栈仍独立完整：切回 r1 能逐步撤销
      RB.setActiveResumeId('r1');
      RB.undo();
      ctx.assert(RB.getData().data.name === 'A1', '切回 r1 后撤销恢复 r1 自己的上一步（A1）');
      RB.undo();
      ctx.assert(RB.getData().data.name === 'A0', 'r1 连续撤销到最初（A0）');
    }
  },
  {
    name: '单简历内撤销/重做仍正确（回归：隔离改造未破坏基本栈）',
    fn(ctx){
      const RB = ctx.ResumeEditor;
      RB.setActiveResumeId('solo');
      let d = RB.getData().data;
      const n0 = d.name;
      RB.recordHistory('action'); d.name = n0 + '#1';
      RB.recordHistory('action'); d.name = n0 + '#2';
      RB.undo();
      ctx.assert(RB.getData().data.name === n0 + '#1', '单份内撤销一步');
      RB.undo();
      ctx.assert(RB.getData().data.name === n0, '单份内再撤一步回到原值');
      RB.redo();
      ctx.assert(RB.getData().data.name === n0 + '#1', '单份内重做一步');
    }
  },
  {
    name: '输入框 / contenteditable 内放行浏览器原生撤销（isEditableTarget 契约）',
    fn(ctx){
      const RB = ctx.ResumeEditor;
      ctx.assert(typeof RB.isEditableTarget === 'function', 'isEditableTarget 已暴露');
      const mk = (tag, opts) => Object.assign({ tagName: (tag || 'DIV').toUpperCase(), dataset: {} }, opts || {});
      ctx.assert(RB.isEditableTarget(mk('input')) === true, 'INPUT 视为可编辑');
      ctx.assert(RB.isEditableTarget(mk('textarea')) === true, 'TEXTAREA 视为可编辑');
      ctx.assert(RB.isEditableTarget(mk('div', { isContentEditable: true })) === true, 'contenteditable 视为可编辑');
      ctx.assert(RB.isEditableTarget(mk('button')) === false, 'BUTTON 视为不可编辑');
      ctx.assert(RB.isEditableTarget(mk('div')) === false, '普通 DIV 视为不可编辑');
      ctx.assert(RB.isEditableTarget(null) === false, 'null target 安全返回 false');
    }
  }
];
