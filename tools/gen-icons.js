#!/usr/bin/env node
'use strict';
/*
 * gen-icons.js —— 生成 src-tauri/icons/ 下的占位图标（灰阶，契合项目黑白灰调性）
 * -----------------------------------------------------------------------------
 * 一次性脚本（保留以便重新生成）：`node tools/gen-icons.js`
 * 只用 Node 内置 zlib 手写 PNG 编码（IHDR / IDAT / IEND + CRC32），
 * 再手写 ICO 容器（6 字节头 + 16 字节目录项 + 内嵌 PNG）与 ICNS 容器（4 字节 magic +
 * 长度 + 若干「类型 + 长度 + PNG」条目），不依赖任何第三方库与 imagemagick。
 *
 * 图形语言：灰阶简历纸——深灰外框 + 近黑标题块 + 中灰副条 + 灰正文行，
 * 全部取自项目既有灰阶集合（#f5f5f5 / #cfcfcf / #8c8c8c / #595959 / #2b2b2b / #333），无 PII。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'src-tauri', 'icons');

/* ---------- CRC32（PNG 块校验） ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* ---------- PNG 编码：8 位灰阶（color type 0） ---------- */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const head = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(head), 0);
  return Buffer.concat([len, head, crc]);
}

/* Tauri 要求 bundle.icon 里的 PNG 必须是 **RGBA（colorType=6）**：
   灰度（colorType=0）或 RGB（colorType=2）都会让 tauri::generate_context! 过程宏 panic
   （实测报错：icon <path> is not RGBA）。故这里统一输出 8bit RGBA，alpha 恒为不透明。 */
function encodeRgbaPng(size, gray) {
  const stride = size * 4 + 1; // 每行 = 1 字节 filter + size 个 RGBA 像素
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const g = gray[y * size + x];
      const o = rowStart + 1 + x * 4;
      raw[o] = g;       // R
      raw[o + 1] = g;   // G
      raw[o + 2] = g;   // B
      raw[o + 3] = 255; // A（不透明）
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA（Tauri 强制要求，勿改成 0/2）
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 绘制：灰阶「简历纸」（单位坐标，画布恒为 16×16 单位） ---------- */
const PALETTE = {
  paper: 0xf5,
  frame: 0x33,
  title: 0x2b,
  sub: 0x8c,
  body: 0x59,
  soft: 0xcf
};

function render(size) {
  const u = size / 16;
  const gray = new Uint8Array(size * size).fill(PALETTE.paper);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    gray[y * size + x] = c;
  };
  // 单位矩形（左上 x0,y0 到右下 x1,y1，含边界）
  const rect = (x0, y0, x1, y1, c) => {
    const ax = Math.round(x0 * u), ay = Math.round(y0 * u);
    const bx = Math.round(x1 * u), by = Math.round(y1 * u);
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) put(x, y, c);
  };

  rect(1, 1, 15, 15, PALETTE.frame);            // 深灰外框
  rect(2, 2, 14, 14, PALETTE.paper);            // 纸面
  rect(3, 3, 10, 4.6, PALETTE.title);           // 标题块（近黑）
  rect(3, 5.2, 5.6, 7.6, PALETTE.soft);         // 头像占位块
  rect(6.2, 5.4, 12.6, 6.2, PALETTE.sub);       // 副标题条
  rect(6.2, 6.6, 11, 7.4, PALETTE.sub);
  rect(3, 8.6, 12.6, 9.4, PALETTE.body);        // 正文行（长短交替）
  rect(3, 10, 12.6, 10.8, PALETTE.body);
  rect(3, 11.4, 9.5, 12.2, PALETTE.body);
  return gray;
}

function pngOf(size) {
  return encodeRgbaPng(size, render(size));
}

/* ---------- ICO 容器（多目录项，每项内嵌 PNG） ---------- */
function buildIco(entries) {
  const n = entries.length;
  // ICO 头部与目录项均为**小端**（与 PNG/ICNS 的大端不同）
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(n, 4);
  const dirTotal = 16 * n;
  let offset = 6 + dirTotal;
  const dirs = entries.map(({ size, data }) => {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size; // width（0 表示 256）
    d[1] = size >= 256 ? 0 : size; // height
    d[2] = 0; // palette count
    d[3] = 0; // reserved
    d.writeUInt16LE(1, 4); // color planes
    d.writeUInt16LE(32, 6); // bits per pixel
    d.writeUInt32LE(data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += data.length;
    return d;
  });
  return Buffer.concat([head, ...dirs, ...entries.map(e => e.data)]);
}

/* ---------- ICNS 容器（4 字符类型 + 长度 + PNG） ---------- */
const ICNS_TYPES = { 512: 'ic09', 256: 'ic08', 128: 'ic07', 32: 'ic11' };
function buildIcns(pngs) {
  const parts = pngs.map(({ size, data }) => {
    const type = ICNS_TYPES[size];
    if (!type) return null;
    const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.alloc(4), data]);
    body.writeUInt32BE(body.length, 4);
    return body;
  }).filter(Boolean);
  const body = Buffer.concat(parts);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length + 8, 0); // ICNS 头部长度含自身 8 字节
  return Buffer.concat([Buffer.from('icns', 'ascii'), len, body]);
}

/* ---------- 主流程 ---------- */
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sizes = [32, 128, 256, 512];
  const made = sizes.map(size => ({ size, data: pngOf(size) }));
  const map = Object.fromEntries(made.map(x => [x.size, x.data]));

  const files = [
    ['32x32.png', map[32]],
    ['128x128.png', map[128]],
    ['128x128@2x.png', map[256]],
    ['icon.png', map[512]],
    ['icon.ico', buildIco([made[0], made[1], made[2]])],
    ['icon.icns', buildIcns(made.slice().sort((a, b) => b.size - a.size))]
  ];
  for (const [name, buf] of files) {
    fs.writeFileSync(path.join(OUT_DIR, name), buf);
    console.log(`[gen-icons] ${name.padEnd(16)} ${String(buf.length).padStart(7)} bytes`);
  }
  console.log('[gen-icons] 图标已生成 → src-tauri/icons/');
}

main();
