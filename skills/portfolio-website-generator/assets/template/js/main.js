/* ════════════════════════════════════════════════════════
   江屿求职作品集 · 交互脚本
   导航 / 滚动进场 / 数字滚动 / 技能条 / 项目模态框 / Toast
   ════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 1. 移动端菜单 ─────────────────────────── */
  const menuBtn = document.getElementById('menuBtn');
  const nav = document.getElementById('nav');

  function closeMenu() {
    nav.classList.remove('open');
    menuBtn.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  menuBtn.addEventListener('click', function () {
    const isOpen = nav.classList.toggle('open');
    menuBtn.classList.toggle('open', isOpen);
    menuBtn.setAttribute('aria-expanded', String(isOpen));
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeMenu();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1024) closeMenu();
  });

  /* ── 2. 导航当前区高亮 ─────────────────────── */
  const sections = ['about', 'objective', 'education', 'experience', 'projects', 'skills', 'awards', 'contact']
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  const navLinks = Array.prototype.slice.call(nav.querySelectorAll('a[data-sec]'));

  function highlightNav() {
    const pos = window.scrollY + window.innerHeight * 0.32;
    let currentId = '';
    sections.forEach(function (sec) {
      if (sec.offsetTop <= pos) currentId = sec.id;
    });
    navLinks.forEach(function (link) {
      link.classList.toggle('active', link.dataset.sec === currentId);
    });
  }
  window.addEventListener('scroll', highlightNav, { passive: true });
  highlightNav();

  /* ── 3. 滚动进场动画 ───────────────────────── */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ── 4. 数字滚动动画 ───────────────────────── */
  function animateCount(el) {
    var target = parseInt(el.dataset.count, 10) || 0;
    var suffix = el.dataset.suffix || '';
    var duration = 1100;
    var start = null;
    function tick(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  var countEls = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    countEls.forEach(function (el) { countObserver.observe(el); });
  } else {
    countEls.forEach(function (el) {
      el.textContent = el.dataset.count + (el.dataset.suffix || '');
    });
  }

  /* ── 5. 技能条填充 ─────────────────────────── */
  var skillBars = document.querySelectorAll('.skill-bar i');
  if ('IntersectionObserver' in window) {
    var barObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var bar = entry.target;
          setTimeout(function () { bar.style.width = 'calc(' + bar.dataset.w + '% - 6px)'; }, 120);
          barObserver.unobserve(bar);
        }
      });
    }, { threshold: 0.4 });
    skillBars.forEach(function (bar) { barObserver.observe(bar); });
  } else {
    skillBars.forEach(function (bar) { bar.style.width = 'calc(' + bar.dataset.w + '% - 6px)'; });
  }

  /* ── 6. 项目详情数据 ───────────────────────── */
  var PROJECTS = [
    {
      no: 'P-01',
      img: 'images/project-1.jpg',
      badge: '校园创业金奖',
      year: '2024.03 — 2024.11 · 团队 3 人 · 担任前端负责人',
      title: '拾光 LIGHTDECK — 校园二手书循环平台',
      desc: '从宿舍楼下的书堆出发做的产品：学长学姐毕业甩卖课本，学弟学妹按书况三折起买入。覆盖微信小程序与 Web 双端，跑通了「扫码上架 — 议价 — 校内面交/代寄」的完整闭环。',
      points: [
        '独立完成小程序全部 21 个页面与组件层，基于 uni-app 一套代码同时输出 Web 端；',
        '设计「书况分级」拍照上架流程：调用相机 + 图片压缩（平均 2.4MB → 180KB），上架耗时中位数 42 秒；',
        '用 Node.js + MySQL 搭配简单 Redis 缓存实现订单与站内信服务，支撑开学季 380+ QPS 峰值；',
        '拉了 6 个院系的社群做冷启动，靠「毕业季摆摊 + 线上专区」两周做到 1100+ 成交。'
      ],
      stack: 'Vue3 · uni-app · Pinia · Node.js(Express) · MySQL · Redis · 微信云开发',
      stats: [
        { v: '3,200+', s: '注册用户' },
        { v: '1,100+', s: '累计成交订单' },
        { v: '¥4.6w', s: '帮同学省下的书费' }
      ]
    },
    {
      no: 'P-02',
      img: 'images/project-2.jpg',
      badge: '国家级二等奖 · 优秀毕设',
      year: '2024.09 — 2025.05 · 个人项目 · 毕业设计',
      title: '墨阵 INKGRID — AI 书法陪练 Web 应用',
      desc: '给想练字又没条件请老师的人做的陪练应用：在屏幕上或用纸写完拍照上传，系统逐笔分析起收笔、结构与章法，给出可执行的改进建议。也是我的毕业设计，盲评 92 分。',
      points: [
        'Canvas 高频采样手写轨迹（240Hz），压感/速度/角度三通道重建笔画形态；',
        '用 MediaPipe 检测手部关键点辅助运笔姿势提醒，LSTM 对笔画序列打分，单字评分与教师标注一致率 91.3%；',
        '内置 1,860 个常用字的标准字库（取自开源书法数据集并人工校对），支持九宫格/米字格/空白三种练习模式；',
        '离线优先架构：核心练字功能在断网时可用，同步走 IndexedDB 队列。'
      ],
      stack: 'React · TypeScript · Canvas · MediaPipe · TensorFlow.js(LSTM) · IndexedDB · Vite',
      stats: [
        { v: '91.3%', s: '评分与教师一致率' },
        { v: '1,860', s: '内置标准字库' },
        { v: '92 分', s: '毕设盲评成绩' }
      ]
    },
    {
      no: 'P-03',
      img: 'images/project-3.jpg',
      badge: '课程设计满分',
      year: '2025.03 — 2025.06 · 3 人小组 · 前端 & 数据负责',
      title: '城市脉搏 CITYPULSE — 杭州公共出行可视化大屏',
      desc: '面向城市数据爱好者的课程设计：把杭州市开放数据平台的地铁客流、公共自行车与实时天气接入同一块大屏，用动画讲清楚「这座城市正在怎么流动」。',
      points: [
        'WebSocket + 后端节流推送，前端增量渲染，1.2 万个点位下稳定 60fps；',
        'ECharts 深度定制：地铁线网用自绘 SVG 图层叠加，客流热力与运营时刻表联动；',
        'Python 脚本每日凌晨拉取并清洗开放数据，入库 PostgreSQL，接口平均响应 90ms；',
        '答辩现场演示「跨年夜地铁大客流回放」，课程设计成绩 100 分。'
      ],
      stack: 'React · ECharts · WebSocket · SVG · Python(FastAPI) · PostgreSQL',
      stats: [
        { v: '60fps', s: '1.2万点位渲染' },
        { v: '3 类', s: '实时数据源联动' },
        { v: '100 分', s: '课程设计成绩' }
      ]
    },
    {
      no: 'P-04',
      img: 'images/project-4.jpg',
      badge: '开源项目 · 1.2k Stars',
      year: '2024.05 — 至今 · 个人开源 · 持续维护',
      title: '纸鸢 KITE UI — 轻量 React 组件库',
      desc: '想要一个「按需加载时 Tree-shaking 干净、无障碍属性完整、样式钩子够用」的组件库，没找到特别合适的就自己写了一个。命名来自杭州春天的风筝：轻，但牵得住。',
      points: [
        '28 个常用组件全部完成键盘交互与 ARIA 属性，Dialog/Select 等复杂组件均有焦点圈管理；',
        'Rollup + dts 打包，按需引入产物平均 4.8KB(gzip)，样式采用 CSS Variables 主题注入；',
        '文档站基于自研 Markdown 驱动方案，组件示例即测试用例（Playwright 截图比对）；',
        '处理社区 Issue 130+、合并外部 PR 23 个，npm 周下载 900+，被 3 个校内项目采用。'
      ],
      stack: 'TypeScript · React · Rollup · dts · CSS Variables · Playwright · GitHub Actions',
      stats: [
        { v: '1.2k', s: 'GitHub Stars' },
        { v: '28 个', s: '组件数量' },
        { v: '4.8KB', s: '按需平均体积' }
      ]
    }
  ];

  /* ── 7. 项目模态框 ─────────────────────────── */
  var modal = document.getElementById('projModal');
  var modalImg = document.getElementById('modalImg');
  var modalNo = document.getElementById('modalNo');
  var modalBadge = document.getElementById('modalBadge');
  var modalYear = document.getElementById('modalYear');
  var modalTitle = document.getElementById('modalTitle');
  var modalDesc = document.getElementById('modalDesc');
  var modalPoints = document.getElementById('modalPoints');
  var modalStack = document.getElementById('modalStack');
  var modalStats = document.getElementById('modalStats');
  var lastFocused = null;

  function openModal(index) {
    var p = PROJECTS[index];
    if (!p) return;
    modalImg.src = p.img;
    modalImg.alt = p.title + ' 项目封面';
    modalNo.textContent = p.no;
    modalBadge.textContent = p.badge;
    modalYear.textContent = p.year;
    modalTitle.textContent = p.title;
    modalDesc.textContent = p.desc;
    modalPoints.innerHTML = p.points.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    modalStack.textContent = p.stack;
    modalStats.innerHTML = p.stats.map(function (st) {
      return '<div><strong>' + st.v + '</strong><span>' + st.s + '</span></div>';
    }).join('');
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.querySelector('.modal-close').focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('.proj-card').forEach(function (card) {
    card.addEventListener('click', function () {
      openModal(parseInt(card.dataset.proj, 10));
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(parseInt(card.dataset.proj, 10));
      }
    });
  });
  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  /* ── 8. Toast（简历下载提示）──────────────── */
  var toast = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }
  document.querySelectorAll('a[download]').forEach(function (link) {
    link.addEventListener('click', function () {
      showToast('简历已开始下载 — 如未触发，请右键「链接另存为」');
    });
  });

})();
