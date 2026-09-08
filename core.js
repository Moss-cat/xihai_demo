"use strict";
/* ================= 嘻嗨校园 · 多页面共享核心（index/main/meeting/student_council 共用） ================= */
/* 常量必须与 index.html 保持一致 */
window.APP = "vcmeet2026";
window.BROKER = "wss://broker.hivemq.com:8884/mqtt";
window.ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
function fmtTime(ts) {
  const d = new Date(ts), p = x => String(x).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const ROLE_LABEL = { teacher: "教师", student: "学生", parent: "家长", admin: "管理员" };
const GRADE_LABEL = { 1: "一年级", 2: "二年级", 3: "三年级", 4: "四年级", 5: "五年级", 6: "六年级", 7: "七年级", 8: "八年级", 9: "九年级", 10: "高一", 11: "高二", 12: "高三" };
const gradeLabel = g => GRADE_LABEL[+g] || (g + "年级");
/* ================= 班级字母制（每级最多 5 班：A-E） ================= */
/* "6B" 解析为 {grade:6, cls:"B"}；不合法返回 null */
const clsNorm = c => String(c ?? "").trim().toUpperCase();
function parseClassStr(s) {
  const m = String(s ?? "").trim().toUpperCase().match(/^(\d{1,2})([A-E])$/);
  if (!m || +m[1] < 1 || +m[1] > 12) return null;
  return { grade: +m[1], cls: m[2] };
}
/* 两个 {grade, cls} 是否同班（字母大小写不敏感） */
const sameCls = (a, b) => !!a && !!b && (+a.grade) === (+b.grade) && clsNorm(a.cls) === clsNorm(b.cls);
const LS = {
  /* 会话 */
  session: () => { try { return JSON.parse(localStorage.getItem(APP + "_session") || "null"); } catch (e) { return null; } },
  setSession: v => localStorage.setItem(APP + "_session", JSON.stringify(v)),
  clearSession: () => localStorage.removeItem(APP + "_session"),
  devid: () => {
    let v = localStorage.getItem(APP + "_devid");
    if (!v) { v = Math.random().toString(36).slice(2, 10); localStorage.setItem(APP + "_devid", v); }
    return v;
  },
  user: () => localStorage.getItem(APP + "_user") || "",
  setUser: v => localStorage.setItem(APP + "_user", v),
  /* 主题 / 语言（全站记忆） */
  theme: () => localStorage.getItem(APP + "_theme") || "auto",
  setTheme: v => localStorage.setItem(APP + "_theme", v),
  lang: () => localStorage.getItem(APP + "_lang") || "zh",
  setLang: v => localStorage.setItem(APP + "_lang", v),
  /* 好友 / 定时会议 / 好友申请（按用户名区分，跨设备不互串） */
  f: n => { try { return JSON.parse(localStorage.getItem(APP + "_f_" + n) || "[]"); } catch (e) { return []; } },
  sf: (n, v) => localStorage.setItem(APP + "_f_" + n, JSON.stringify(v)),
  sched: n => { try { return JSON.parse(localStorage.getItem(APP + "_s_" + n) || "[]"); } catch (e) { return []; } },
  ssched: (n, v) => localStorage.setItem(APP + "_s_" + n, JSON.stringify(v)),
  reqs: n => { try { return JSON.parse(localStorage.getItem(APP + "_r_" + n) || "[]"); } catch (e) { return []; } },
  sreqs: (n, v) => localStorage.setItem(APP + "_r_" + n, JSON.stringify(v)),
  autof: (n, k) => localStorage.getItem(APP + "_af_" + n + "_" + k) || "",
  sautof: (n, k, v) => localStorage.setItem(APP + "_af_" + n + "_" + k, v),
  /* 家长发给班主任的申请（班主任本地缓存，权威状态在 retained APP/prq 主题） */
  preq: n => { try { return JSON.parse(localStorage.getItem(APP + "_prq_" + n) || "[]"); } catch (e) { return []; } },
  spreq: (n, v) => localStorage.setItem(APP + "_prq_" + n, JSON.stringify(v)),
  /* GIF 表情包收藏（按用户名区分，data URL 数组） */
  st: n => { try { return JSON.parse(localStorage.getItem(APP + "_st_" + n) || "[]"); } catch (e) { return []; } },
  sst: (n, v) => localStorage.setItem(APP + "_st_" + n, JSON.stringify(v))
};
/* 启动会议：写入启动信息并跳转 meeting.html（家长不允许视频会议） */
function launchMeeting(cfg) {
  const s = LS.session();
  if (s && s.role === "parent") {
    try { toast("家长账号不支持视频会议", "warn", 5000); } catch (e) { alert("家长账号不支持视频会议"); }
    return;
  }
  sessionStorage.setItem(APP + "_launch", JSON.stringify(cfg));
  location.href = "meeting.html";
}
/* 密码哈希（与 index.html 逐字节一致） */
async function hashPw(name, pw) {
  const src = APP + "|" + name + "|" + pw;
  if (window.isSecureContext && window.crypto && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {}
  }
  let h = [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x41c6ce57];
  for (let r = 0; r < 16; r++) {
    for (let i = 0; i < src.length; i++) {
      const c = src.charCodeAt(i) + r * 131;
      h[0] = Math.imul(h[0] ^ c, 16777619) >>> 0;
      h[1] = Math.imul(h[1] + c, 2246822519) >>> 0;
      h[2] = (h[2] ^ Math.imul(c + i, 2654435761)) >>> 0;
      h[3] = (Math.imul(h[3] + c, 668265263) ^ r) >>> 0;
    }
  }
  return h.map(x => x.toString(16).padStart(8, "0")).join("");
}
/* ================= 主题：深色 / 浅色 / 跟随时间 ================= */
function applyTheme() {
  const t = LS.theme();
  let eff = t;
  if (t === "auto") { const h = new Date().getHours(); eff = (h >= 7 && h < 19) ? "light" : "dark"; }
  document.documentElement.dataset.theme = eff;
}
/* ================= 语言：中文 / English（页面用 bindLang(dict) 注入词条后调用 applyLang） ================= */
let __I18N = {};
let LANG = "zh";
function bindLang(dict) { __I18N = dict || {}; LANG = LS.lang() === "en" ? "en" : "zh"; }
function t(k) {
  const d = __I18N[k];
  if (!d) return k;
  return LANG === "en" ? (d.en !== undefined ? d.en : d.zh) : d.zh;
}
function applyLang() {
  document.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll("[data-ph]").forEach(el => { el.placeholder = t(el.dataset.ph); });
  document.querySelectorAll("[data-title]").forEach(el => { el.title = t(el.dataset.title); });
  const lv = $("langSel"); if (lv) lv.value = LS.lang();
  const tv = $("themeSel"); if (tv) tv.value = LS.theme();
}
/* ================= 弹窗 ================= */
function toast(text, kind = "", ms = 4200) {
  const d = document.createElement("div");
  d.className = "toast " + kind;
  d.innerHTML = `<div class="tt">${text}</div>`;
  $("toasts").appendChild(d);
  if (ms > 0) setTimeout(() => d.remove(), ms);
  return d;
}
function actionToast(html, buttons, stay = false) {
  const d = toast(html, "", stay ? 0 : 30000);
  const bar = document.createElement("div");
  bar.className = "btns";
  buttons.forEach(b => {
    const btn = document.createElement("button");
    btn.textContent = b.label;
    if (b.cls) btn.className = b.cls;
    btn.onclick = () => { if (!b.keep) d.remove(); b.fn && b.fn(d); };
    bar.appendChild(btn);
  });
  d.appendChild(bar);
  return d;
}
function reasonPrompt(title, cb) {
  const d = toast(title, "warn", 0);
  const ta = document.createElement("textarea");
  ta.placeholder = "请填写理由（必填）";
  d.appendChild(ta);
  const bar = document.createElement("div");
  bar.className = "btns";
  const ok = document.createElement("button");
  ok.textContent = "确认";
  ok.className = "primary";
  ok.onclick = () => {
    if (!ta.value.trim()) { ta.placeholder = "理由不能为空，请填写"; ta.focus(); return; }
    d.remove(); cb(ta.value.trim());
  };
  const no = document.createElement("button");
  no.textContent = "取消";
  no.onclick = () => d.remove();
  bar.append(ok, no);
  d.appendChild(bar);
}
function promptModal(title, okLabel, cb) {
  const d = toast(title, "", 0);
  const ta = document.createElement("textarea");
  ta.placeholder = "请输入…";
  d.appendChild(ta);
  const bar = document.createElement("div");
  bar.className = "btns";
  const ok = document.createElement("button");
  ok.textContent = okLabel || "确定";
  ok.className = "primary";
  ok.onclick = () => {
    if (!ta.value.trim()) { ta.focus(); return; }
    d.remove(); cb(ta.value.trim());
  };
  const no = document.createElement("button");
  no.textContent = "取消";
  no.onclick = () => d.remove();
  bar.append(ok, no);
  d.appendChild(bar);
}
/* ================= 在线状态小助手 ================= */
const PRES = {};            // name -> 是否在线（聚合各设备）
function presenceKey(name, dev, online) {
  PRES[name] = PRES[name] || {};
  if (dev) { PRES[name][dev] = !!online; }
  else { PRES[name] = { _all: !!online }; }
  return PRES[name]._all || (Object.keys(PRES[name]).some(d => d !== "_all" && PRES[name][d]));
}
/* ================= 聊天增强：表情包 + @提及（main / council 共用） ================= */
const EMOJI_GROUPS = [
  { n: "表情", e: ["😀","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","😉","😍","🥰","😘","😋","😜","🤪","🤨","🧐","🤓","😎","🥳","😏","😴","🤤","😪","😭","😥","🙄","😤","😠","🤯","😳","🥵","🥶","😱","😨","🤗","🤔","🤭","🤫","😶","😐","😑","🤐","😷","🤒","🤕","🥴","😵","🤠"] },
  { n: "手势", e: ["👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👋","✋","🖖","👏","🙌","🤲","🙏","💪","✍️","🤳"] },
  { n: "心情", e: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💯","💢","💥","💫","💦","🎉","🎊","✨","⭐","🔥","💤"] },
  { n: "动物", e: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦆","🦉","🦄","🐝","🐛","🦋","🐢","🐠","🐙"] },
  { n: "食物", e: ["🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥕","🌽","🍞","🥐","🍰","🎂","🍪","🍬","🍫","🍿","🧋","☕","🥤","🍦"] },
  { n: "学习", e: ["📚","📖","📝","✏️","🖊️","📎","📐","📏","🔖","🏫","👩‍🏫","👨‍🏫","👩‍🎓","👨‍🎓","🧮","🔬","🌍","🎨","🎹","⚽","🏀","🏆","🥇","🏅","🎮","🔔"] }
];
/* 样式注入（两个页面 CSS 独立，统一由 core.js 注入聊天增强样式） */
(function injectChatCss() {
  const st = document.createElement("style");
  st.textContent = `
  .emojiPanel{position:fixed;z-index:300;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:8px 10px;width:312px;max-height:250px;overflow-y:auto}
  .emojiPanel h5{font-size:11px;color:var(--sub);margin:6px 2px 4px;font-weight:normal}
  .emojiGrid{display:grid;grid-template-columns:repeat(8,1fr);gap:2px}
  .emojiGrid button{border:none;background:none;font-size:20px;padding:4px 0;border-radius:6px;line-height:1.4}
  .emojiGrid button:hover{background:var(--panel2)}
  .mentionBox{position:fixed;z-index:300;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:4px;min-width:160px;max-height:200px;overflow-y:auto}
  .mentionBox .mi{padding:6px 10px;font-size:13px;border-radius:6px;cursor:pointer;white-space:nowrap}
  .mentionBox .mi.on,.mentionBox .mi:hover{background:var(--panel2)}
  .atmark{color:var(--accent);font-weight:bold;background:rgba(79,140,255,.18);border-radius:4px;padding:0 3px}
  /* GIF 表情包 */
  .gifPanel{position:fixed;z-index:300;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:8px;width:312px;max-height:280px;overflow-y:auto}
  .gifHead{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--sub);padding:2px 2px 6px}
  .gifAdd{border:1px dashed var(--line);background:none;color:var(--accent);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer}
  .gifGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .gifCell{position:relative}
  .gifCell img{width:100%;height:62px;object-fit:cover;border-radius:8px;cursor:pointer;background:var(--panel2)}
  .gifCell img:hover{outline:2px solid var(--accent)}
  .gifDel{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;background:#e5484d;color:#fff;font-size:12px;line-height:18px;padding:0;cursor:pointer}
  .gifEmpty{grid-column:1/-1;font-size:12px;color:var(--sub);padding:14px 4px;text-align:center;line-height:1.8}
  .gifmsg{max-width:200px;max-height:200px;border-radius:10px;display:block;margin:2px 0;cursor:zoom-in;background:var(--panel2)}
  .gifbar{margin-top:2px}
  .gifsave{border:1px solid var(--line);background:none;color:var(--accent);border-radius:6px;font-size:11px;padding:2px 8px;cursor:pointer}
  .gifsaved{font-size:11px}
  .gifprev{max-width:180px;max-height:180px;border-radius:8px;display:block;margin:4px 0}
  .gifZoom{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;cursor:zoom-out}
  .gifZoom img{max-width:92vw;max-height:92vh;border-radius:8px}
  `;
  document.head.appendChild(st);
})();
/* 在光标处插入文本 */
function insertAtCursor(input, txt) {
  const s = input.selectionStart || 0, e = input.selectionEnd || 0;
  input.value = input.value.slice(0, s) + txt + input.value.slice(e);
  const np = s + txt.length;
  input.focus();
  try { input.setSelectionRange(np, np); } catch (err) {}
}
/* ================= 表情面板 ================= */
let __emojiPanel = null;
function closeEmojiPanel() { if (__emojiPanel) { __emojiPanel.remove(); __emojiPanel = null; } }
document.addEventListener("click", e => { if (__emojiPanel && !__emojiPanel.contains(e.target) && e.target.__isEmojiBtn !== true) closeEmojiPanel(); }, true);
/* 给输入框绑一个 😊 按钮：弹出表情面板，点击表情插入光标处 */
function attachEmoji(input, btn) {
  btn.__isEmojiBtn = true;
  btn.addEventListener("click", e => {
    e.stopPropagation();
    if (__emojiPanel && __emojiPanel.__for === input) { closeEmojiPanel(); return; }
    closeEmojiPanel();
    const p = document.createElement("div");
    p.className = "emojiPanel";
    p.__for = input;
    EMOJI_GROUPS.forEach(g => {
      const h = document.createElement("h5"); h.textContent = g.n; p.appendChild(h);
      const grid = document.createElement("div"); grid.className = "emojiGrid";
      g.e.forEach(em => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = em;
        b.onclick = () => insertAtCursor(input, em);
        grid.appendChild(b);
      });
      p.appendChild(grid);
    });
    document.body.appendChild(p);
    const r = btn.getBoundingClientRect();
    const pw = 312, ph = Math.min(250, p.offsetHeight || 250);
    let x = Math.min(r.left, window.innerWidth - pw - 8);
    let y = r.top - ph - 8;
    if (y < 8) y = r.bottom + 8;
    p.style.left = Math.max(8, x) + "px";
    p.style.top = y + "px";
    __emojiPanel = p;
  });
}
/* ================= @提及（输入 @ 弹出成员下拉） ================= */
let MENTION_INPUT = null;   // 当前打开 @ 下拉的输入框（供发送回车判断）
function mentionOpen(input) { return MENTION_INPUT === input; }
/* getMembers: 返回可 @ 的名单（含"全体成员"等特殊项由调用方决定） */
function attachMention(input, getMembers) {
  let box = null, items = [], idx = 0, start = -1;
  const hide = () => {
    if (box) { box.remove(); box = null; }
    items = []; idx = 0; start = -1;
    if (MENTION_INPUT === input) MENTION_INPUT = null;
  };
  const pick = nm => {
    if (start < 0) { hide(); return; }
    input.value = input.value.slice(0, start) + "@" + nm + " " + input.value.slice(input.selectionStart || 0);
    const np = start + nm.length + 2;
    hide();
    input.focus();
    try { input.setSelectionRange(np, np); } catch (e) {}
  };
  const render = () => {
    if (!box) { box = document.createElement("div"); box.className = "mentionBox"; document.body.appendChild(box); }
    box.innerHTML = "";
    items.forEach((nm, i) => {
      const d = document.createElement("div");
      d.className = "mi" + (i === idx ? " on" : "");
      d.textContent = "@" + nm;
      d.onclick = () => pick(nm);
      box.appendChild(d);
    });
    const r = input.getBoundingClientRect();
    const h = Math.min(200, items.length * 31 + 8);
    box.style.left = Math.max(8, r.left) + "px";
    box.style.top = Math.max(8, r.top - h - 6) + "px";
    box.style.width = Math.max(160, Math.min(260, r.width)) + "px";
    MENTION_INPUT = input;
  };
  input.addEventListener("input", () => {
    const v = input.value, pos = input.selectionStart || 0;
    const m = v.slice(0, pos).match(/@([^\s@]{0,16})$/);
    if (!m) { hide(); return; }
    const q = m[1].toLowerCase();
    items = Array.from(new Set((getMembers() || []).filter(nm => nm && nm.toLowerCase().includes(q)))).slice(0, 6);
    if (!items.length) { hide(); return; }
    idx = 0;
    start = pos - m[1].length - 1;
    render();
  });
  input.addEventListener("blur", () => setTimeout(hide, 150));
  input.addEventListener("keydown", e => {
    if (e.isComposing || e.keyCode === 229) return; // 输入法组合中（含选字回车）不拦截
    if (!box || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); idx = (idx + 1) % items.length; render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); idx = (idx - 1 + items.length) % items.length; render(); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); pick(items[idx]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); hide(); }
  });
}
/* 消息文本渲染：转义后高亮 @名字（names 为本群成员名单） */
function renderRich(text, names) {
  let html = esc(text || "");
  const toks = Array.from(new Set(((names || []).concat(["全体成员", "管理员"])).filter(Boolean)));
  toks.sort((a, b) => b.length - a.length);
  toks.forEach(nm => {
    const en = esc(nm);
    const re = new RegExp("@" + en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w\\u4e00-\\u9fa5])", "g");
    html = html.replace(re, mm => `<span class="atmark">${mm}</span>`);
  });
  return html;
}
/* 提取文本中被 @ 到的成员名（要求 @名字 后不紧跟文字，避免"王"误匹配"@王小明"） */
function mentionedOf(text, names) {
  const t = String(text || "");
  return Array.from(new Set((names || []).filter(nm => {
    if (!nm) return false;
    const key = "@" + nm;
    let i = t.indexOf(key);
    while (i >= 0) {
      const after = t.charAt(i + key.length);
      if (!/[\w\u4e00-\u9fa5]/.test(after)) return true;
      i = t.indexOf(key, i + 1);
    }
    return false;
  })));
}
/* ================= GIF 动图表情包（收藏 + 面板 + 粘贴发送，main / council 共用） ================= */
const GIF_MAX = 500 * 1024;   // 单张 data URL ≤ ~700KB（500KB 原图），过大 MQTT 传输慢
const STICKER_MAX = 30;       // 收藏上限（localStorage 5MB 限制）
/* 读取本地图片文件 → data URL（校验类型与大小） */
function readGifFile(file) {
  return new Promise(res => {
    if (!file) { res({ ok: false, err: "未选择文件" }); return; }
    if (!/^image\/(gif|png|webp|jpeg)$/.test(file.type)) { res({ ok: false, err: "只支持 GIF / PNG / WebP / JPG 图片" }); return; }
    if (file.size > GIF_MAX) { res({ ok: false, err: "图片超过 500KB，请压缩后再试" }); return; }
    const fr = new FileReader();
    fr.onload = () => res({ ok: true, url: fr.result });
    fr.onerror = () => res({ ok: false, err: "文件读取失败" });
    fr.readAsDataURL(file);
  });
}
/* 收藏管理（存当前登录用户的 LS） */
function stickerAdd(url) {
  const n = LS.user();
  if (!n) return { ok: false, err: "未登录，无法保存" };
  if (!/^data:image\/(gif|png|webp|jpeg);base64,/.test(String(url || ""))) return { ok: false, err: "图片格式不受支持" };
  if (url.length > GIF_MAX * 1.45) return { ok: false, err: "图片超过 500KB，无法收藏" };
  const list = LS.st(n);
  if (list.includes(url)) return { ok: true };
  if (list.length >= STICKER_MAX) return { ok: false, err: `表情包收藏已满（${STICKER_MAX} 张），请先删除一些` };
  list.push(url);
  try { LS.sst(n, list); } catch (e) { return { ok: false, err: "本地存储空间不足，无法保存" }; }
  return { ok: true };
}
function stickerHas(url) { return LS.st(LS.user()).includes(url); }
function stickerDel(url) {
  const n = LS.user();
  LS.sst(n, LS.st(n).filter(u => u !== url));
}
/* 选择文件后的处理流程：直接发送 / 存入收藏 / 两者都要 */
function stickerPickFlow(onSend) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/gif,image/png,image/webp,image/jpeg";
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    readGifFile(f).then(r => {
      if (!r.ok) { toast(r.err, "warn", 5000); return; }
      actionToast(`<img class="gifprev" src="${r.url}">这张表情包要怎么处理？`, [
        { label: "直接发送", cls: "primary", fn: () => onSend(r.url) },
        { label: "存入收藏", fn: () => { const a = stickerAdd(r.url); toast(a.ok ? "已存入我的表情包" : a.err, a.ok ? "ok" : "warn", 3200); } },
        { label: "发送并收藏", fn: () => { stickerAdd(r.url); onSend(r.url); } }
      ]);
    });
  };
  inp.click();
}
/* GIF 面板：展示收藏网格，点击即发送；右上角添加文件；每张可删除 */
let __gifPanel = null;
function closeGifPanel() { if (__gifPanel) { __gifPanel.remove(); __gifPanel = null; } }
document.addEventListener("click", e => { if (__gifPanel && !__gifPanel.contains(e.target) && e.target.__isGifBtn !== true) closeGifPanel(); }, true);
function attachSticker(btn, send) {
  btn.__isGifBtn = true;
  btn.addEventListener("click", e => {
    e.stopPropagation();
    if (__gifPanel && __gifPanel.__btn === btn) { closeGifPanel(); return; }
    closeGifPanel();
    const p = document.createElement("div");
    p.className = "gifPanel";
    p.__btn = btn;
    const build = () => {
      p.innerHTML = "";
      const head = document.createElement("div");
      head.className = "gifHead";
      head.innerHTML = `<span>🎬 我的表情包</span>`;
      const add = document.createElement("button");
      add.type = "button"; add.className = "gifAdd"; add.textContent = "＋ 添加";
      add.onclick = ev => { ev.stopPropagation(); stickerPickFlow(send); };
      head.appendChild(add);
      p.appendChild(head);
      const grid = document.createElement("div");
      grid.className = "gifGrid";
      const list = LS.st(LS.user());
      if (!list.length) grid.innerHTML = '<div class="gifEmpty">还没有收藏的表情包<br>点右上「＋ 添加」本地 GIF 文件<br>或把图片直接<b>粘贴</b>到输入框发送</div>';
      list.forEach(url => {
        const cell = document.createElement("div");
        cell.className = "gifCell";
        const im = document.createElement("img");
        im.src = url; im.loading = "lazy"; im.alt = "表情";
        im.onclick = () => { closeGifPanel(); send(url); };
        const del = document.createElement("button");
        del.type = "button"; del.className = "gifDel"; del.textContent = "×"; del.title = "删除这张";
        del.onclick = ev => { ev.stopPropagation(); stickerDel(url); build(); };
        cell.append(im, del);
        grid.appendChild(cell);
      });
      p.appendChild(grid);
    };
    build();
    document.body.appendChild(p);
    const r = btn.getBoundingClientRect();
    const pw = 312, ph = Math.min(280, p.offsetHeight || 280);
    let x = Math.min(r.left, window.innerWidth - pw - 8);
    let y = r.top - ph - 8;
    if (y < 8) y = r.bottom + 8;
    p.style.left = Math.max(8, x) + "px";
    p.style.top = y + "px";
    __gifPanel = p;
  });
}
/* 输入框粘贴图片 → 直接以表情包格式发送 */
function attachGifPaste(input, send) {
  input.addEventListener("paste", e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (!f) continue;
        e.preventDefault();
        readGifFile(f).then(r => {
          if (!r.ok) { toast(r.err, "warn", 5000); return; }
          actionToast(`<img class="gifprev" src="${r.url}">把粘贴的图片作为表情包发送？`, [
            { label: "发送", cls: "primary", fn: () => send(r.url) },
            { label: "发送并收藏", fn: () => { stickerAdd(r.url); send(r.url); } }
          ]);
        });
        return;
      }
    }
  });
}
/* GIF 消息体渲染（发送者不显示收藏按钮）+ 事件绑定 */
function gifBodyHtml(m, mine) {
  const fav = mine ? "" : (stickerHas(m.gif) ? '<span class="muted gifsaved">⭐ 已收藏</span>' : '<button type="button" class="gifsave">⭐ 收藏</button>');
  return `<img class="gifmsg" src="${esc(m.gif)}" loading="lazy" alt="GIF">${fav ? `<div class="gifbar">${fav}</div>` : ""}`;
}
function bindGifSave(el) {
  el.querySelectorAll(".gifsave").forEach(b => {
    b.onclick = () => {
      const box = b.closest(".msg");
      const img = box && box.querySelector(".gifmsg");
      if (!img) return;
      const r = stickerAdd(img.src);
      if (r.ok) { b.outerHTML = '<span class="muted gifsaved">⭐ 已收藏</span>'; toast("已加入我的表情包", "ok", 2500); }
      else toast(r.err, "warn", 4500);
    };
  });
}
/* 点击 GIF 消息放大查看 */
document.addEventListener("click", e => {
  const im = e.target.closest && e.target.closest("img.gifmsg");
  if (!im) return;
  const ov = document.createElement("div");
  ov.className = "gifZoom";
  const big = document.createElement("img");
  big.src = im.src;
  ov.appendChild(big);
  ov.onclick = () => ov.remove();
  document.body.appendChild(ov);
});
