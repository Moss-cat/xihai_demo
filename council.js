"use strict";
/* ================= 嘻嗨校园 · 学生会群（student_council.html） ================= */
const sess = LS.session();
if (!sess || !sess.name || !sess.uid) { location.replace("index.html"); }
let me = { uid: sess ? sess.uid : "", name: sess ? sess.name : "", dev: LS.devid(), school: sess ? (sess.school || "") : "", role: sess ? (sess.role || "") : "" };
let client = null;
let schoolRec = null;
let cnDoc = null;      // {name, members:[学生名], reqs:[], meeting:{}}
let isAdmin = false;
let isMember = false;
const CHAT = `${APP}/cnchat/${me.school}`;
const DOC = `${APP}/cn/${me.school}`;
function renderGate() {
  $("gate").classList.remove("hidden");
  $("scr-council").classList.add("hidden");
  $("gateMsg").textContent = isAdmin
    ? "加载中，请稍候…"
    : "你不是本校学生会成员（管理员自动在群内；学生需由管理员拉入）。";
}
$("gateBack").onclick = () => location.href = "main.html";
$("backBtn").onclick = () => location.href = "main.html";
$("connState").textContent = "连接中…";
function connect() {
  if (typeof mqtt === "undefined") {
    $("connState").textContent = "通信库加载失败，请刷新重试";
    toast("MQTT 通信库加载失败（网络受限？），请刷新页面重试", "warn", 12000);
    return;
  }
  client = mqtt.connect(BROKER, {
    clientId: APP + "_cn_" + me.uid + "_" + me.dev + "_" + Math.random().toString(36).slice(2, 6),
    keepalive: 30, clean: true, connectTimeout: 8000,
    will: { topic: `${APP}/u/${me.name}/${me.dev}`, payload: JSON.stringify({ uid: me.uid, dev: me.dev, online: false }), retain: true, qos: 0 }
  });
  client.on("connect", () => {
    $("connState").textContent = "已连接";
    client.subscribe(`${APP}/school/${me.school}`);
    client.subscribe(`${APP}/cn/${me.school}`);
    client.subscribe(`${APP}/msg/${me.name}`);
    client.subscribe(`${APP}/fr/${me.name}/+`);
    client.subscribe(`${APP}/u/${me.name}/${me.dev}`);
    client.publish(`${APP}/u/${me.name}/${me.dev}`, JSON.stringify({ uid: me.uid, dev: me.dev, online: true }), { retain: true });
    setTimeout(() => { /* 慢网络兜底 */ client.subscribe(`${APP}/school/${me.school}`); client.subscribe(`${APP}/cn/${me.school}`); }, 5000);
  });
  client.on("reconnect", () => { $("connState").textContent = "重连中…"; });
  client.on("offline", () => { $("connState").textContent = "离线"; });
  client.on("error", () => { $("connState").textContent = "连接异常…"; });
  client.on("message", (topic, payload) => {
    let m; try { m = JSON.parse(payload.toString()); } catch (e) { return; }
    if (topic === `${APP}/school/${me.school}`) { if (m && m.name) { schoolRec = m; window.__ROSTER__ = (schoolRec.members) || []; } checkMember(); return; }
    if (topic === DOC) { if (m && m.name) cnDoc = m; else cnDoc = null; checkMember(); return; }
    if (topic === CHAT) return onChat(m);
    if (topic.startsWith(APP + "/u/")) {
      const parts = topic.split("/");
      if (parts.length >= 3) { presenceKey(parts[2], parts[3] || "", m ? m.online : false); renderMembers(); }
      return;
    }
    if (topic.startsWith(APP + "/fr/")) {
      const parts = topic.split("/");
      if (parts.length === 4 && parts[2] === me.name && m && m.t) {
        try { client.publish(topic, "", { retain: true, qos: 1 }); } catch (e) {}
        if (m.from === me.uid && m.dev === me.dev) return;
        m.fromName = parts[3];
        if (m.t === "invite" || m.t === "forceinvite") onChat(Object.assign(m, { _invite: true }));
        if (m.t === "friendok") { const fs = LS.f(me.name); if (!fs.find(f => f.name === m.fromName)) { fs.push({ name: m.fromName }); LS.sf(me.name, fs); } }
      }
      return;
    }
    if (topic.startsWith(APP + "/msg/")) {
      if (m && (m.t === "invite" || m.t === "forceinvite")) onChat(Object.assign(m, { _invite: true }));
      if (m && m.t === "mention" && !(m.from === me.uid && m.dev === me.dev)) {
        toast(`💬 <b>${esc(m.fromName || "")}</b> 在学生会群 @你：<br>${esc((m.text || "").slice(0, 60))}`, "ok", 8000);
      }
      return;
    }
  });
}
/* 会员判定：管理员自动在群；其余看 cnDoc.members */
function adminsOf() {
  if (!schoolRec) return [];
  if (Array.isArray(schoolRec.admins) && schoolRec.admins.length) return schoolRec.admins;
  if (schoolRec.admin) return [schoolRec.admin];
  if (schoolRec.creator) return [schoolRec.creator];
  return [];
}
function checkMember() {
  isAdmin = adminsOf().includes(me.name);
  isMember = !!cnDoc && Array.isArray(cnDoc.members) && cnDoc.members.includes(me.name);
  const adm = (cnDoc && cnDoc.members) || [];
  if (!isAdmin && cnDoc && Array.isArray(cnDoc.admins)) isMember = isMember || cnDoc.admins.includes(me.name);
  if (!isAdmin && !isMember) {
    // 等待数据后再判定（schoolRec/cnDoc 未到时先不拦截）
    if (!schoolRec && !cnDoc) { return; }
    joined = false;   // 被移出群后重置，再次被拉入时可完整恢复界面
    renderGate();
    return;
  }
  // 每次学校 / 学生会记录更新都重渲染（会议发起 / 结束、成员变化即时反映）
  joinIn();
}
let joined = false;
function joinIn() {
  if (joined) { renderAll(); return; }
  joined = true;
  if (client && client.connected) {
    if (!isAdmin) client.subscribe(CHAT);   /* 管理员只管成员，不参与学生会聊天 */
    client.subscribe(`${APP}/u/${me.name}/${me.dev}`);
    client.publish(`${APP}/u/${me.name}/${me.dev}`, JSON.stringify({ uid: me.uid, dev: me.dev, online: true }), { retain: true });
  }
  $("gate").classList.add("hidden");
  $("scr-council").classList.remove("hidden");
  $("councilName").innerHTML = "🏫 " + esc(me.school) + " · " + esc(me.name) + (isAdmin ? " · 管理员（成员管理）" : " · 学生会成员");
  $("adminBox").classList.toggle("hidden", !isAdmin);
  $("askBtn").classList.toggle("hidden", isAdmin);
  if (isAdmin) {
    /* 管理员精简视图：只保留右侧成员管理，隐藏聊天与会议 */
    $("cnChatBox").classList.add("hidden");
    $("cnMeetSec").classList.add("hidden");
    $("cnHeadTtl").textContent = "👥 学生会成员管理";
    document.querySelector(".body").classList.add("admin-only");
  }
  renderAll();
}
function renderAll() {
  renderHint();
  if (!isAdmin) renderMeetBox();
  renderMembers();
  if (isAdmin) renderPullOptions();
}
function renderHint() {
  const h = $("councilHint");
  if (isAdmin) h.textContent = "管理员仅负责成员管理（右侧拉学生进群 / 移出）；聊天与会议由学生会自主进行。";
  else h.textContent = "你是学生会成员：可自由发言、直接发起会议、@管理员会提醒对方。";
}
/* ================= 群成员 / 拉人 ================= */
function memberList() {
  const m = cnDoc && Array.isArray(cnDoc.members) ? cnDoc.members.slice() : [];
  /* 管理员自动在群内：来自学校记录 admins / admin / creator */
  adminsOf().forEach(nm => { if (!m.includes(nm)) m.unshift(nm); });
  return Array.from(new Set(m));
}
function renderMembers() {
  const ms = memberList();
  const adminSet = adminsOf();
  $("memCount").textContent = "（" + ms.length + "）";
  const box = $("memList"); box.innerHTML = "";
  ms.forEach(nm => {
    const on = presenceKey(nm) ? "on" : "";
    const d = document.createElement("span");
    d.className = "mchip";
    const isAd = adminSet.includes(nm);
    d.innerHTML = `<span class="d ${on}"></span>${esc(nm)}${nm === me.name ? "（我）" : ""}${isAd ? " ⭐" : ""}`;
    if (isAdmin && nm !== me.name) {
      const x = document.createElement("button");
      x.textContent = "✕";
      x.title = "移出学生会群";
      x.onclick = () => removeMember(nm);
      d.appendChild(x);
    }
    box.appendChild(d);
  });
  // 订阅成员在线状态
  ms.forEach(nm => { try { client.subscribe(`${APP}/u/${nm}/+`); } catch (e) {} });
}
function removeMember(nm) {
  if (!isAdmin) return;
  const ms = (cnDoc && Array.isArray(cnDoc.members) ? cnDoc.members : []).filter(x => x !== nm);
  publishDoc({ members: ms });
  toast("已将 <b>" + esc(nm) + "</b> 移出学生会群", "warn");
}
function renderPullOptions() {
  const sel = $("pullStudent");
  if (!sel) return;
  const cur = memberList();
  const students = ((schoolRec && schoolRec.members) || []).filter(x => x.role === "student" && !cur.includes(x.name));
  sel.innerHTML = '<option value="">选择学生…</option>';
  students.forEach(s => {
    const o = document.createElement("option");
    o.value = s.name;
    o.textContent = s.name + "（" + gradeLabel(s.grade) + (s.cls || "") + "班）";
    sel.appendChild(o);
  });
}
$("pullBtn").onclick = () => {
  const nm = $("pullStudent").value;
  if (!nm) { toast("请先选择学生", "warn"); return; }
  const ms = (cnDoc && Array.isArray(cnDoc.members) ? cnDoc.members : []).slice();
  if (!ms.includes(nm)) ms.push(nm);
  publishDoc({ members: ms });
  toast("已把 <b>" + esc(nm) + "</b> 拉进学生会群", "ok");
  pushSys(`管理员 ${me.name} 将 ${nm} 拉入学生会群`);
  $("pullStudent").value = "";
};
function publishDoc(patch) {
  const base = cnDoc || { name: me.school, members: [], reqs: [], meeting: null };
  const doc = Object.assign({ name: me.school }, base, patch);
  client.publish(DOC, JSON.stringify(doc), { retain: true, qos: 1 });
}
/* ================= 聊天 ================= */
function pushMsg(m, mine) {
  const log = $("chatLog");
  if (!log) return;
  if (m._invite) {
    const d = document.createElement("div");
    d.className = "msg call";
    d.innerHTML = `<div class="mname">🤝 ${esc(m.fromName || "")} 邀请加入会议</div><b>${esc(m.title || "视频会议")}</b> · 码 ${esc(m.code)}
      <div class="cbtns"><button class="primary" data-a="join">进入会议</button>${m.t === "invite" ? '<button class="danger" data-a="no">拒绝</button>' : ""}</div>`;
    d.querySelector("[data-a='join']").onclick = () => { launchMeeting({ code: m.code, title: m.title, role: "guest", from: "council", force: true }); };
    const nb = d.querySelector("[data-a='no']");
    if (nb) nb.onclick = () => d.remove();
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return;
  }
  if (m.t === "call") {
    const d = document.createElement("div");
    d.className = "msg call";
    const hostMe = m.host === me.name;
    d.innerHTML = `<div class="mname">🎥 ${esc(m.hostName || m.host || "")} 发起了学生会会议</div>
      <b>${esc(m.title || "学生会会议")}</b> · 主题：${esc(m.reason || m.title || "")} · 会议码 <b>${esc(m.code)}</b>
      <div class="cbtns">${hostMe
        ? '<button class="primary" data-a="host">进入会议（主持）</button><button class="danger" data-a="end">结束会议</button>'
        : '<button class="primary" data-a="join">加入会议</button>'}</div>`;
    const bind = (a, fn) => { const b = d.querySelector("[data-a='" + a + "']"); if (b) b.onclick = fn; };
    bind("host", () => { launchMeeting({ code: m.code, title: m.title, role: "host", from: "council", reason: m.reason }); });
    bind("join", () => { launchMeeting({ code: m.code, title: m.title, role: "guest", from: "council" }); });
    bind("end", () => endMeeting(m.code));
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return;
  }
  if (m.t === "sys") {
    const d = document.createElement("div");
    d.className = "msg sys";
    d.textContent = m.text || "";
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return;
  }
  const d = document.createElement("div");
  d.className = "msg" + (mine ? " mine" : "");
  d.innerHTML = `<div class="mname">${mine ? "我" : esc(m.fromName || "成员")}</div>${m.kind === "gif" ? gifBodyHtml(m, mine) : renderRich(m.text, memberList())}<div class="mt">${fmtTime(m.at || Date.now())}</div>`;
  bindGifSave(d);
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
function onChat(m) {
  if (!m) return;
  if (m.from === me.uid && m.dev === me.dev) return;
  pushMsg(m, false);
  if (m._invite && m.t === "invite") toast(`<b>${esc(m.fromName || "")}</b> 邀请加入会议 ${esc(m.code)}`, "ok", 6000);
}
function pushSys(text) {
  client.publish(CHAT, JSON.stringify({ t: "sys", text, at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
}
function chatSend() {
  const v = $("chatMsg").value.trim();
  if (!v) return;
  if (!client) { toast("通信组件未加载（右上角一直是「连接中…」？请刷新页面）", "warn", 6000); return; }
  if (!client.connected) toast("连接尚未就绪，消息将在连接恢复后自动送达", "warn", 4000);
  const atAdmin = v.startsWith("@管理员") || v.startsWith("@admin") || v.includes("@管理员");
  const all = v.includes("@全体成员");
  if (all && !isAdmin) { toast("只有管理员可以 @全体成员", "warn"); return; }
  client.publish(CHAT, JSON.stringify({ t: "msg", text: v, at: Date.now(), atAdmin: !!atAdmin, from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  pushMsg({ t: "msg", text: v, from: me.uid, dev: me.dev, fromName: me.name, at: Date.now() }, true);
  /* @提醒：被 @ 成员 / 全体成员 / 管理员 收到 msg 通知 */
  const names = memberList().filter(n => n !== me.name);
  const hits = new Set(all ? names : mentionedOf(v, names));
  if (atAdmin) adminsOf().filter(n => n !== me.name).forEach(n => hits.add(n));
  hits.forEach(n => client.publish(`${APP}/msg/${n}`, JSON.stringify({ t: "mention", group: "council", text: v.slice(0, 60), at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 }));
  $("chatMsg").value = "";
  if (atAdmin) toast("已 @管理员，对方在线会收到提醒", "ok", 3500);
}
$("chatSend").onclick = chatSend;
$("chatMsg").addEventListener("keydown", e => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter" && !mentionOpen($("chatMsg"))) chatSend(); });
/* 表情面板 + @提及 + GIF 表情包（学生会群：成员 / 管理员 / 全体成员） */
attachEmoji($("chatMsg"), $("chatEmoji"));
attachMention($("chatMsg"), () => ["管理员", "全体成员"].concat(memberList()).filter(n => n !== me.name));
function sendGif(gif) {
  if (!client) { toast("通信组件未加载，请刷新页面重试", "warn", 6000); return; }
  client.publish(CHAT, JSON.stringify({ t: "msg", kind: "gif", gif, at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  pushMsg({ t: "msg", kind: "gif", gif, from: me.uid, dev: me.dev, fromName: me.name, at: Date.now() }, true);
}
attachSticker($("chatGif"), sendGif);
attachGifPaste($("chatMsg"), sendGif);
$("askBtn").onclick = () => promptModal("向管理员提问（学生可自由询问管理员）", "发送", q => {
  if (!client) { toast("通信组件未加载，请刷新页面重试", "warn", 6000); return; }
  client.publish(CHAT, JSON.stringify({ t: "msg", text: "【询问管理员】" + q, at: Date.now(), ask: true, from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  pushMsg({ t: "msg", text: "【询问管理员】" + q, from: me.uid, dev: me.dev, fromName: me.name, at: Date.now() }, true);
  toast("已发送给管理员", "ok", 3000);
});
/* ================= 发起 / 进行中的会议 ================= */
$("reqMeetBtn").onclick = () => {
  /* 学生会自治：成员直接发起会议，无需管理员批准 */
  promptModal("发起学生会会议（填主题，如：想搞项目‘纸飞机大赛’）", "创建", t => startMeeting(me.name, me.name, t));
};
function startMeeting(host, hostName, title) {
  const code = genCode();
  const meeting = { code, title, reason: title, host, hostName, at: Date.now() };
  publishDoc({ meeting });
  client.publish(CHAT, JSON.stringify({ t: "call", code, title, reason: title, host, hostName, at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  launchMeeting({ code, title, role: "host", from: "council", reason: title });
}
function renderMeetBox() {
  const box = $("meetBox");
  const mt = cnDoc && cnDoc.meeting;
  box.innerHTML = "";
  if (!mt) {
    box.innerHTML = '<p class="muted">当前没有进行中的会议。学生会成员可点“📢 发起会议”直接开始。</p>';
    return;
  }
  const d = document.createElement("div");
  d.className = "panel-card";
  const hostMe = mt.host === me.name;
  d.innerHTML = `<p>🎥 <b>${esc(mt.hostName || mt.host)}</b> 会议中</p>
    <p><b>主题：${esc(mt.title || "")}</b></p><p class="muted">会议码 ${esc(mt.code)} · ${fmtTime(mt.at)}</p>`;
  const bar = document.createElement("div");
  bar.className = "row2";
  if (hostMe) {
    const b1 = document.createElement("button"); b1.className = "primary"; b1.textContent = "进入会议（主持）";
    b1.onclick = () => launchMeeting({ code: mt.code, title: mt.title, role: "host", from: "council", reason: mt.reason });
    const b2 = document.createElement("button"); b2.className = "danger"; b2.textContent = "结束会议";
    b2.onclick = () => endMeeting(mt.code);
    bar.append(b1, b2);
  } else {
    const b1 = document.createElement("button"); b1.className = "primary"; b1.textContent = "加入会议";
    b1.onclick = () => launchMeeting({ code: mt.code, title: mt.title, role: "guest", from: "council" });
    bar.appendChild(b1);
  }
  d.appendChild(bar);
  box.appendChild(d);
}
function endMeeting(code) {
  const mt = cnDoc && cnDoc.meeting;
  if (mt && mt.host !== me.name && !isAdmin) { toast("只有主持人或管理员可以结束会议", "warn"); return; }
  publishDoc({ meeting: null });
  pushSys("会议已结束：" + (mt ? mt.title : code));
  toast("会议已结束，并已通知群里", "warn");
}
/* 会议结束后由 meeting.html 返回本页时刷新 */
window.addEventListener("pageshow", () => { renderAll(); });
window.addEventListener("beforeunload", () => { try { if (client && me.name) client.publish(`${APP}/u/${me.name}/${me.dev}`, JSON.stringify({ uid: me.uid, dev: me.dev, online: false }), { retain: true }); } catch (e) {} });
client = null;
connect();
