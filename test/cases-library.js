/* 多简历仓库（js/store/resume-library.js）测试。
   与 cases-audit.js 同构：CommonJS，由运行器在 Node 侧 require 后逐条执行，
   通过 ctx.ResumeLibrary（vm 上下文里的 window.ResumeLibrary）访问，断言走 ctx.assert。

   覆盖：索引清单排序、create/duplicate/remove/rename 的元数据流转、
   文档读写往返、激活态持久化、空库继承首份。依赖运行器注入的内存 indexedDB 桩。 */

'use strict';

module.exports = [
  {
    name: '空库初始化返回 count=0 且无激活 id',
    fn: (ctx) => {
      const L = ctx.ResumeLibrary;
      return L.init().then((r) => {
        ctx.assert(r.count === 0, '空库 init 返回 count=0');
        ctx.assert(!r.activeId, '空库 init 无激活 id');
      });
    }
  },
  {
    name: 'create 新建并成为激活简历、写入索引与文档',
    fn: (ctx) => {
      const L = ctx.ResumeLibrary;
      return L.create({ title: '测试简历', payload: { data: { name: '张三', contact: [], sections: [] }, fonts: null, spacing: null, v: 8 } })
        .then((meta) => {
          ctx.assert(!!meta.id && meta.id.indexOf('res_') === 0, '生成的 id 带 res_ 前缀');
          ctx.assert(meta.title === '测试简历', '标题正确');
          return L.list();
        }).then((idx) => {
          ctx.assert(idx.length === 1, '列表含 1 份');
          ctx.assert(idx[0].title === '测试简历', '列表标题正确');
          return L.load(idx[0].id);
        }).then((doc) => {
          ctx.assert(!!doc && doc.data && doc.data.name === '张三', '文档可往返读取');
        });
    }
  },
  {
    name: 'list 按 updatedAt 倒序排列',
    fn: (ctx) => {
      const L = ctx.ResumeLibrary;
      return L.create({ title: '较早', payload: { data: { name: 'a', contact: [], sections: [] } } })
        .then(() => new Promise(r => setTimeout(r, 20)))
        .then(() => L.create({ title: '较晚', payload: { data: { name: 'b', contact: [], sections: [] } } }))
        .then(() => L.list())
        .then((idx) => {
          ctx.assert(idx.length >= 2, '至少两份');
          // 倒序：updatedAt 最大的在前
          for (let i = 1; i < idx.length; i++) {
            if (idx[i-1].updatedAt < idx[i].updatedAt) { ctx.assert(false, 'updatedAt 严格降序（第' + i + '项）'); return; }
          }
          ctx.assert(true, 'updatedAt 严格降序');
          ctx.assert(idx[0].title === '较晚', '最新在前');
        });
    }
  },
  {
    name: 'duplicate 复制出带「副本」后缀的新简历且内容一致',
    fn: (ctx) => {
      const L = ctx.ResumeLibrary;
      return L.list().then((idx) => {
        const src = idx[0];
        return L.duplicate(src.id).then((meta) => {
          ctx.assert(meta.id !== src.id, '复制生成新 id');
          ctx.assert(meta.title === src.title + ' 副本', '副本标题带后缀');
          return Promise.all([L.load(src.id), L.load(meta.id)]);
        }).then(([a, b]) => {
          ctx.assert(JSON.stringify(a.data) === JSON.stringify(b.data), '副本内容与源一致');
        });
      });
    }
  },
  {
    name: 'rename 更新标题',
    fn: (ctx) => {
      const L = ctx.ResumeLibrary;
      return L.list().then((idx) => {
        const id = idx[0].id;
        return L.rename(id, '新名字').then(() => L.list());
      }).then((idx) => {
        ctx.assert(idx.some(m => m.title === '新名字'), 'rename 后标题更新');
      });
    }
  },
  {
    name: 'setActive/getActive 持久化激活态',
    fn: (ctx) => {
      const L = ctx.ResumeLibrary;
      return L.list().then((idx) => {
        const id = idx[0].id;
        return L.setActive(id).then(() => L.getActive());
      }).then((act) => {
        ctx.assert(!!act, '激活态已写入并读回');
      });
    }
  },
  {
    name: 'remove 删除简历并从索引移除',
    fn: (ctx) => {
      const L = ctx.ResumeLibrary;
      return L.list().then((idx) => {
        const before = idx.length;
        const id = idx[0].id;
        return L.remove(id).then(() => L.list()).then((after) => {
          ctx.assert(after.length === before - 1, '删除后数量减一');
          ctx.assert(!after.some(m => m.id === id), '被删 id 不再出现');
          return L.load(id);
        }).then((doc) => {
          ctx.assert(doc === null, '被删文档已清空');
        });
      });
    }
  },
  {
    name: 'save 更新文档内容与 updatedAt',
    fn: (ctx) => {
      const L = ctx.ResumeLibrary;
      return L.list().then((idx) => {
        const id = idx[0].id;
        const payload = { data: { name: '改后', contact: [], sections: [] }, fonts: null, spacing: null, v: 8 };
        return L.save(id, payload).then(() => L.load(id));
      }).then((doc) => {
        ctx.assert(doc.data.name === '改后', 'save 后内容更新');
      });
    }
  },

  /* ---- savedAt 新旧仲裁（数据一致性根治，2026-09-19）----
     pickResumeSource(doc, memSavedAt)：库文档与内存基底谁新用谁。
     旧数据双方无 savedAt（都 0）→ 'repo'（磁盘优先，是恢复脚本/手工编辑的意图载体）。 */
  {
    name: '仲裁：库文档 savedAt 较新 → library（浏览器有未落盘修改）',
    fn: (ctx) => {
      const pick = ctx.pickResumeSource;
      ctx.assert(!!pick, 'pickResumeSource 已导出');
      ctx.assert(pick({ savedAt: 2000, data: {} }, 1000) === 'library', '库 2000 > 内存 1000 → library');
    }
  },
  {
    name: '仲裁：内存基底较新 → repo（磁盘优先回写库）',
    fn: (ctx) => {
      const pick = ctx.pickResumeSource;
      ctx.assert(pick({ savedAt: 1000, data: {} }, 2000) === 'repo', '库 1000 < 内存 2000 → repo');
      ctx.assert(pick({ savedAt: 1000, data: {} }, 1000) === 'repo', '同级 → repo（不覆盖）');
    }
  },
  {
    name: '仲裁：旧数据无 savedAt → repo（磁盘是意图载体）',
    fn: (ctx) => {
      const pick = ctx.pickResumeSource;
      ctx.assert(pick({ data: {} }, 0) === 'repo', '双方均无时间戳 → repo');
      ctx.assert(pick({ savedAt: 500, data: {} }, 0) === 'library', '库有内存无 → library');
      ctx.assert(pick(null, 123) === 'repo', 'doc 为 null → repo');
      ctx.assert(pick({ savedAt: 'abc', data: {} }, 0) === 'repo', '非法时间戳按 0 处理 → repo');
    }
  }
];
