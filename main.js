"use strict";
/* ================= 嘻嗨校园 · 主页（main.html） ================= */
bindLang({
  "nav.class": { zh: "我的班级群", en: "My Class" },
  "tab.meet": { zh: "🎥 视频通话", en: "🎥 Video" },
  "tab.class": { zh: "🏫 班级群", en: "🏫 Class" },
  "tab.broadcast": { zh: "📢 班级广播", en: "📢 Broadcast" },
  "tab.parent": { zh: "👪 家长群", en: "👪 Parents" },
  "tab.prq": { zh: "📨 家长消息", en: "📨 Parent Msgs" },
  "tab.points": { zh: "⭐ 学院分", en: "⭐ Points" },
  "tab.grades": { zh: "📈 成绩", en: "📈 Grades" },
  "tab.tt": { zh: "📅 课表", en: "📅 Timetable" },
  "tab.stu": { zh: "👥 学生管理", en: "👥 Students" },
  "tab.school": { zh: "🏫 学校管理", en: "🏫 School" },
  "meet.join": { zh: "🔑 加入会议", en: "🔑 Join Meeting" },
  "meet.quick": { zh: "⚡ 快速创建（立即会议）", en: "⚡ Quick Create" }
});
const sess = LS.session();
if (!sess || !sess.name || !sess.uid) {
  $("gateOverlay").classList.remove("hidden");
  location.replace("index.html");
}
let me = { uid: sess ? sess.uid : "", name: sess ? sess.name : "", dev: LS.devid(), school: sess ? (sess.school || "") : "", role: sess ? (sess.role || "") : "" };
let client = null;
let friends = [];     // [{name}]
let reqs = [];         // [{name,uid}]
let scheduled = [];    // 定时会议
let meAuth = {};       // 自己 auth 记录（含 grade/cls/isClassTeacher/role）
let schoolRec = null;  // 学校记录 {name,admin,admins?,creator,members[]}
let cnDoc = null;      // 学生会记录
let ptDoc = null;      // 学院分记录
let grDoc = null;      // 成绩记录 {items:{<学生>:{recs:[{sub,sc,lv,at,by}]}}}
let ttDoc = null;      // 我的课表（教师）{list:[{day,st,en,grade,cls,sub,at}]}
let repDoc = null;     // 老师发来的学况反馈（家长）{items:[{from,child,text,at}]}
let goalDoc = null;    // 我的 SMART Goal（学生）{name, items:[{id,tpl,text,sub?,lv?,sc?,pt?,done,doneAt,at}]}
let stdDoc = null;     // 全校评分标准（retained APP/std/<校>）{school,full,mode:"pct"|"abs",E,M,D,by,at}
let goalPromptShown = false; // 每次进入主页只提示一次 goal 进度
let myClass = null;    // {grade,cls}
let clTopic = "";      // 我的班级群 topic
let clMembers = [];    // 班级成员 [{name,role,grade,cls,isClassTeacher}]
let isAdmin = false;   // 是否管理员（按 admins 数组/admin/creator 兼容判定）
let classSetupDone = false; // buildClass + autoFriend 仅执行一次
let parentClass = null; // 家长：孩子所在班级 {grade,cls}（由 schoolRec 中孩子的年级/班级推导）
let pcTopic = "";       // 家长群 topic：APP/pc/<校>/<年级>/<班级>
let preqs = [];         // 班主任收到的家长申请 [{parent,kind,text,child,at}]
/* ================= 主题 / 语言 ================= */
applyTheme();
$("themeSel").value = LS.theme();
$("themeSel").onchange = e => { LS.setTheme(e.target.value); applyTheme(); };
$("langSel").value = LS.lang();
$("langSel").onchange = e => { LS.setLang(e.target.value); LANG = LS.lang(); applyLang(); };
applyLang();
/* ================= 会话入口 ================= */
function enterMain() {
  friends = LS.f(me.name);
  scheduled = LS.sched(me.name);
  reqs = LS.reqs(me.name).filter(r => !friends.find(f => f.name === r.name));
  preqs = LS.preq(me.name);
  LS.sreqs(me.name, reqs);
  showScreen("main");
  updateTopbar();
  renderFriends(); renderReqs(); renderSched(); renderPrq();
  if (me.role === "student") setTimeout(() => maybeGoalPrompt(true), 6000); // retained 迟到/从未设置时的兜底提示
  setInterval(checkScheduled, 10000);
}
function showScreen(name) { ["main", "meet"].forEach(s => { const el = $("scr-" + s); if (el) el.classList.add("hidden"); }); $("scr-" + name).classList.remove("hidden"); }
/* ================= MQTT 连接 ================= */
function connect() {
  if (typeof mqtt === "undefined") {
    $("connState").textContent = "通信库加载失败，请刷新重试";
    toast("MQTT 通信库加载失败（网络受限？），请刷新页面重试", "warn", 12000);
    return;
  }
  client = mqtt.connect(BROKER, {
    clientId: APP + "_hub_" + me.uid + "_" + me.dev + "_" + Math.random().toString(36).slice(2, 6),
    keepalive: 30, clean: true, connectTimeout: 8000,
    will: { topic: `${APP}/u/${me.name}/${me.dev}`, payload: JSON.stringify({ uid: me.uid, dev: me.dev, online: false }), retain: true, qos: 0 }
  });
  client.on("connect", () => {
    $("connState").textContent = "已连接";
    client.subscribe(`${APP}/auth/${me.name}`);
    client.subscribe(`${APP}/msg/${me.name}`);
    client.subscribe(`${APP}/fr/${me.name}/+`);
    client.subscribe(`${APP}/prq/${me.name}/+`); // 家长发来的申请（retained，班主任专用）
    client.subscribe(`${APP}/tt/${me.name}`);    // 我的课表（retained，教师）
    client.subscribe(`${APP}/rep/${me.name}`);   // 老师发来的学况反馈（retained，家长）
    if (me.school) {
      client.subscribe(`${APP}/school/${me.school}`);
      client.subscribe(`${APP}/cn/${me.school}`);
      client.subscribe(`${APP}/pt/${me.school}`);
      client.subscribe(`${APP}/gr/${me.school}`); // 成绩（retained，全校）
      client.subscribe(`${APP}/std/${me.school}`); // 评分标准（retained，全校）
    }
    client.publish(`${APP}/u/${me.name}/${me.dev}`, JSON.stringify({ uid: me.uid, dev: me.dev, online: true }), { retain: true });
    refresh();
  });
  client.on("reconnect", () => { $("connState").textContent = "重连中…"; });
  client.on("offline", () => { $("connState").textContent = "离线"; });
  client.on("error", () => { $("connState").textContent = "连接异常，重试中…"; });
  client.on("message", (topic, payload) => {
    let m; try { m = JSON.parse(payload.toString()); } catch (e) { m = null; }
    /* 家长申请主题：retained 清除（空载荷）也要处理，先于通用解析失败返回 */
    if (topic.startsWith(APP + "/prq/")) return onPrqTopic(topic, m);
    if (!m) return;
    if (topic.startsWith(APP + "/school/")) return onSchool(topic, m);
    if (topic.startsWith(APP + "/auth/")) { meAuth = (m && m.ph) ? m : {}; syncAuth(); return; }
    if (topic.startsWith(APP + "/cn/")) { if (m && m.name) cnDoc = m; else cnDoc = null; tryRenderAll(); return; }
    if (topic.startsWith(APP + "/pt/")) { ptDoc = (m && (m.name || m.items)) ? m : { name: me.school, items: {} }; tryRenderAll(); return; }
    if (topic.startsWith(APP + "/gr/")) { grDoc = (m && (m.name || m.items)) ? m : { name: me.school, items: {} }; tryRenderAll(); return; }
    if (topic.startsWith(APP + "/std/")) { stdDoc = stdNorm(m); renderGrades(); renderRings(); return; }
    /* 课表 / 学况只认自己的主题：probeDoc 探测他人 rep 主题时，retained 消息不能污染本地 ttDoc/repDoc */
    if (topic === `${APP}/tt/${me.name}`) { ttDoc = (m && Array.isArray(m.list)) ? m : null; renderTt(); return; }
    if (topic === `${APP}/rep/${me.name}`) { repDoc = (m && Array.isArray(m.items)) ? m : { items: [] }; renderReports(); return; }
    if (topic === `${APP}/goal/${me.name}`) { goalDoc = (m && Array.isArray(m.items)) ? m : null; syncGoals(); return; }
    if (topic.startsWith(APP + "/cl/")) { if (topic === clTopic) onClMsg(m); return; }
    if (topic.startsWith(APP + "/pc/")) { if (topic === pcTopic) onPcMsg(m); return; }
    if (topic.startsWith(APP + "/fr/")) return onFriendTopic(topic, m);
    if (topic.startsWith(APP + "/u/")) {
      const parts = topic.split("/");
      if (parts.length >= 3) { presenceKey(parts[2], parts[3] || "", m ? m.online : false); onPresenceChange(); }
      return;
    }
    if (topic.startsWith(APP + "/msg/")) return onUserMsg(m);
  });
  /* 数据补拉：5 秒后再订阅一次自己/学校的 retained，避免慢速网络首帧缺失 */
  setTimeout(refresh, 5000);
}
function refresh() {
  if (!client || !client.connected || !me.school) return;
  client.subscribe(`${APP}/school/${me.school}`);
  client.subscribe(`${APP}/cn/${me.school}`);
  client.subscribe(`${APP}/pt/${me.school}`);
  client.subscribe(`${APP}/gr/${me.school}`);
  client.subscribe(`${APP}/std/${me.school}`); // 评分标准 retained 兜底补订阅
  client.subscribe(`${APP}/goal/${me.name}`); // SMART Goal retained 兜底补订阅
}
/* auth 同步：会话里的角色/班级可能被管理员改动或注册时补充，以 retained auth 为准 */
function syncAuth() {
  if (meAuth.school && meAuth.school !== me.school) { /* 学校被迁移等情况忽略 */ }
  if (meAuth.role) me.role = meAuth.role;
  if (meAuth.school) me.school = meAuth.school;
  if (meAuth.isClassTeacher) me.isHead = true;
  const newMyClass = (() => {
    if (me.role === "student" && meAuth.grade && meAuth.cls) return { grade: +meAuth.grade, cls: clsNorm(meAuth.cls) };
    if ((me.role === "teacher" || me.role === "admin") && meAuth.isClassTeacher && meAuth.grade && meAuth.cls) return { grade: +meAuth.grade, cls: clsNorm(meAuth.cls) };
    return null;
  })();
  /* 班级变更（年级/班级/角色）需要重新订阅班级群并重跑 autoFriend */
  const classChanged = JSON.stringify(newMyClass) !== JSON.stringify(myClass);
  myClass = newMyClass;
  updateTopbar();
  if (classChanged) classSetupDone = false; // 触发 ensureClassSetup 重跑
  isAdmin = adminsOf().includes(me.name);
  tryRenderAll();
}
/* ================= 学校记录 / 渲染总调度 ================= */
function onSchool(topic, m) {
  if (m && m.name) schoolRec = m; else schoolRec = null;
  syncRoster();
  isAdmin = adminsOf().includes(me.name);
  tryRenderAll();
}
/* 管理员名单：兼容新版 admins 数组 / 旧版 admin 单值 / 创校者兜底 */
function adminsOf() {
  if (!schoolRec) return [];
  if (Array.isArray(schoolRec.admins) && schoolRec.admins.length) return schoolRec.admins;
  if (schoolRec.admin) return [schoolRec.admin];
  if (schoolRec.creator) return [schoolRec.creator];
  return [];
}
/* 家长身份附加文案：如「张三的妈妈 · 」；非家长返回空串 */
function parentRoleText() {
  if (me.role !== "parent") return "";
  const c = meAuth && meAuth.child;
  if (!c) return "";
  return (meAuth.ptype || "家长") + " · ";
}
function tryRenderAll() {
  syncRoster();
  updateTopbar();
  if (!schoolRec || !Object.keys(meAuth).length) return;
  ensureClassSetup();
  renderAllUI();
}
/* 同步显示名单：EN 模式下 esc()/nameOf() 据此把中文名映射为英文名 First+Last */
function syncRoster() { window.__ROSTER__ = (schoolRec && schoolRec.members) || []; }
/* 顶栏：姓名/校名走 esc（EN 模式映射英文名并哨兵保护）；角色文本留给 i18n 词典翻译 */
function updateTopbar() {
  $("myNameLabel").innerHTML = "👤 " + esc(me.name) + (me.school ? " · " + esc(me.school) : "") + " · " + parentRoleText() + (ROLE_LABEL[me.role] || me.role || "");}
/* 订阅班级 topic + 自动加好友：依赖 myClass，仅在 myClass 首次确定时执行一次 */
function ensureClassSetup() {
  if (classSetupDone) return;
  classSetupDone = true;
  buildClass();
  autoFriend();
}
function renderAllUI() {
  syncParentClass();
  renderNav();
  renderTabs();
  renderFriends(); renderReqs();
  renderSchoolMembers(); renderStudentList();
  renderPoints();
  renderGrades(); renderRings(); renderTt(); renderReports();
  renderGoals(); renderFeed();
  renderClassUI();
  renderBroadcastUI();
  renderPcUI();
  renderPrq();
}
function renderNav() {
  const inCouncil = isAdmin || (cnDoc && Array.isArray(cnDoc.members) && cnDoc.members.includes(me.name));
  $("navCouncil").classList.toggle("hidden", !inCouncil);
  $("navClass").classList.toggle("hidden", !myClass);
  if (myClass) $("navClassSub").textContent = gradeLabel(myClass.grade) + myClass.cls + "班";
}
function renderTabs() {
  const isParent = me.role === "parent";
  const isHead = (me.role === "teacher" || me.role === "admin") && me.isHead;
  $("tbMeet").classList.toggle("hidden", isParent);          // 家长不能视频会议
  $("tbClass").classList.toggle("hidden", !myClass);
  $("tbBroadcast").classList.toggle("hidden", !(me.isHead && myClass)); // 班级广播：仅班主任/管理员作为班主任时可见
  $("tbParent").classList.toggle("hidden", !isParent);        // 家长专属：家长群 + 给班主任发消息
  $("tbPrq").classList.toggle("hidden", !isHead);             // 班主任专属：家长消息
  $("tbPoints").classList.remove("hidden"); // 学生只读 / 教师可加（加扣分卡由 ptAddCard 根据角色控制）
  $("tbGrades").classList.remove("hidden"); // 成绩：学生/家长查看 · 教师录入
  $("tbTt").classList.toggle("hidden", !(me.role === "teacher" || me.role === "admin")); // 课表：教师专属
  $("tbGoal").classList.toggle("hidden", me.role !== "student"); // SMART Goal：学生专属
  $("tbLms").classList.remove("hidden");   // LMS 自学：所有人可见
  $("tbFeed").classList.remove("hidden");  // 更新日志：所有人可见
  const showStuSchool = isAdmin;
  $("tbStu").classList.toggle("hidden", !showStuSchool);
  $("tbSchool").classList.toggle("hidden", !showStuSchool);
  showTab(isParent ? "parent" : "meet");
}
function showTab(t) {
  ["meet", "class", "broadcast", "parent", "prq", "points", "grades", "goal", "lms", "feed", "tt", "stu", "school"].forEach(n => {
    const el = $("tab" + n.charAt(0).toUpperCase() + n.slice(1));
    if (el) el.classList.toggle("hidden", n !== t);
  });
  document.querySelectorAll("#tabbar button").forEach(b => { if (!b.classList.contains("hidden")) b.classList.toggle("on", b.dataset.tab === t); });
}
document.querySelectorAll("#tabbar button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
$("navClass").onclick = () => { showTab("class"); };
$("navCouncil").onclick = () => { location.href = "student_council.html"; };
/* ================= 班级群 ================= */
function classMembersOf() {
  if (!myClass || !schoolRec) return [];
  return (schoolRec.members || []).filter(x =>
    (x.role === "student" && (+x.grade) === myClass.grade && clsNorm(x.cls) === myClass.cls) ||
    ((x.role === "teacher" || x.role === "admin") && x.isClassTeacher && (+x.grade) === myClass.grade && clsNorm(x.cls) === myClass.cls)
  );
}
function buildClass() {
  if (!myClass) return;
  const newTopic = `${APP}/cl/${me.school}/${myClass.grade}/${myClass.cls}`;
  if (clTopic && clTopic !== newTopic) { try { client.unsubscribe(clTopic); } catch (e) {} }
  clTopic = newTopic;
  client.subscribe(clTopic);
  clMembers = classMembersOf();
  // 订阅班级成员的在线状态
  clMembers.forEach(x => client.subscribe(`${APP}/u/${x.name}/+`));
}
function renderClassUI() {
  if (!myClass) return;
  $("clsTitle").textContent = `${gradeLabel(myClass.grade)}${myClass.cls}班`;
  const headTxt = (me.isHead || isAdmin) ? " · 你是班主任，可监视本班情况并开始班级会议" : " · 同班同学自动成为好友";
  $("clsSub").textContent = headTxt;
  $("clsStartMeet").classList.toggle("hidden", !(me.isHead || isAdmin));
  renderClsMembers();
}
function renderClsMembers() {
  const box = $("clsMembers"); if (!box) return;
  clMembers = classMembersOf();
  box.innerHTML = "";
  clMembers.slice().sort((a, b) => (a.role === "student" ? 0 : -1) - (b.role === "student" ? 0 : -1) || a.name.localeCompare(b.name, "zh")).forEach(x => {
    const on = presenceKey(x.name) ? "on" : "";
    const tag = x.role !== "student" ? "🏅班主任" : (x.gender || "");
    const d = document.createElement("span");
    d.className = "mchip" + (x.name === me.name ? " hl" : "");
    d.innerHTML = `<span class="d ${on}"></span>${esc(x.name)}${x.name === me.name ? "（我）" : ""}<span class="muted">${tag}</span>`;
    box.appendChild(d);
  });
}
/* 同班学生自动加入班级群 = 订阅群消息 */
function onClMsg(m) {
  if (!m || (m.from === me.uid && m.dev === me.dev)) return;
  if (m.t === "msg") { appendClMsg(m, m.from === me.uid); }
  else if (m.t === "bc") { appendClMsg(m, false); toast(`📢 ${esc(m.fromName || "班主任")} 发来了班级广播`, "ok", 5000); }
  else if (m.t === "call") {
    appendClMsg(Object.assign({ call: true }, m), false);
  }
}
function appendClMsg(m, mine) {
  const log = $("clsLog");
  if (!log) return;
  const d = document.createElement("div");
  if (m.call) {
    const canStart = (me.isHead || isAdmin) && m.by === me.name;
    d.className = "msg call";
    d.innerHTML = `<div class="mname">📢 ${esc(m.byName || m.fromName || m.by)} 发起了班级会议</div>
      <b>${esc(m.title || "班级会议")}</b> · 会议码 <b>${esc(m.code)}</b>${canStart ? "<span class='muted'>（你是主持人）</span>" : ""}
      <div class="cbtns">${canStart
        ? `<button class="primary" data-cc="host">🎥 进入会议（主持）</button><button class="danger" data-cc="end">⛔ 结束会议</button>`
        : `<button class="primary" data-cc="join">🎥 点击申请加入</button>`}</div>`;
    const hb = d.querySelector("[data-cc='host']");
    if (hb) hb.onclick = () => launchMeeting({ code: m.code, title: m.title || "班级会议", role: "host", from: "main" });
    const eb = d.querySelector("[data-cc='end']");
    if (eb) eb.onclick = () => {
      client.publish(clTopic, JSON.stringify({ t: "cend", code: m.code, from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
      toast("已通知班级群结束该会议", "warn");
    };
    const jb = d.querySelector("[data-cc='join']");
    if (jb) jb.onclick = () => launchMeeting({ code: m.code, title: m.title || "班级会议", role: "guest", from: "main" });
  } else if (m.t === "bc") {
    d.className = "msg bc";
    d.innerHTML = `<div class="bchead">📢 ${esc(m.fromName || "班主任")} · 班级广播</div>` +
      (m.text ? renderRich(m.text, classMembersOf().map(x => x.name)) : "") +
      bcMediaHtml(m) + `<div class="mt">${fmtTime(m.at || Date.now())}</div>`;
    bindBcZoom(d);
  } else {
    d.className = "msg" + (mine ? " mine" : "");
    const nm = m.from === me.uid ? "我" : (m.fromName || m.byName || "同学");
    d.innerHTML = `<div class="mname">${esc(nm)}</div>${m.kind === "gif" ? gifBodyHtml(m, mine) : renderRich(m.text, classMembersOf().map(x => x.name))}<div class="mt">${fmtTime(m.at || Date.now())}</div>`;
    bindGifSave(d);
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
$("clsMsg").addEventListener("keydown", e => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter" && !mentionOpen($("clsMsg"))) $("clsSend").click(); });
$("clsSend").onclick = () => {
  const v = $("clsMsg").value.trim();
  if (!v || !clTopic) return;
  if (!client) { toast("通信组件未加载，请刷新页面重试", "warn", 6000); return; }
  if (!client.connected) toast("连接尚未就绪，消息将在连接恢复后自动送达", "warn", 4000);
  const names = classMembersOf().map(x => x.name).filter(n => n !== me.name);
  const all = v.includes("@全体成员");
  if (all && !(me.isHead || isAdmin)) { toast("只有班主任 / 管理员可以 @全体成员", "warn"); return; }
  client.publish(clTopic, JSON.stringify({ t: "msg", text: v, at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  appendClMsg({ t: "msg", text: v, from: me.uid, dev: me.dev, fromName: me.name, at: Date.now() }, true);
  (all ? names : mentionedOf(v, names)).forEach(n => sendUser(n, { t: "mention", group: "class", text: v.slice(0, 60), at: Date.now() }));
  $("clsMsg").value = "";
};
/* 表情面板 + @提及 + GIF 表情包（班级群） */
attachEmoji($("clsMsg"), $("clsEmoji"));
attachMention($("clsMsg"), () => ["全体成员"].concat(classMembersOf().map(x => x.name)).filter(n => n !== me.name));
function sendClGif(gif) {
  if (!clTopic) { toast("班级群未就绪，稍后再试", "warn"); return; }
  client.publish(clTopic, JSON.stringify({ t: "msg", kind: "gif", gif, at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  appendClMsg({ t: "msg", kind: "gif", gif, from: me.uid, dev: me.dev, fromName: me.name, at: Date.now() }, true);
}
attachSticker($("clsGif"), sendClGif);
attachGifPaste($("clsMsg"), sendClGif);
$("clsStartMeet").onclick = () => {
  if (!clTopic) return;
  const code = genCode();
  const title = gradeLabel(myClass.grade) + myClass.cls + "班 班级会议";
  client.publish(clTopic, JSON.stringify({ t: "call", code, title, by: me.name, byName: me.name, at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  appendClMsg({ call: true, code, title, by: me.name, byName: me.name }, true);
  launchMeeting({ code, title, role: "host", from: "main" });
};
/* ================= 家长群（同班家长，无监管聊天） ================= */
/* 由 meAuth.child 在 schoolRec.members 中查孩子的年级/班级推导；孩子调班时自动重订阅 */
function syncParentClass() {
  if (me.role !== "parent") return;
  let pc = null;
  if (meAuth.child && schoolRec) {
    const st = (schoolRec.members || []).find(x => x.role === "student" && x.name === meAuth.child);
    if (st && st.grade && st.cls) pc = { grade: +st.grade, cls: clsNorm(st.cls) };
  }
  if (JSON.stringify(pc) === JSON.stringify(parentClass)) return;
  parentClass = pc;
  if (!client || !client.connected) return;
  if (pcTopic) { try { client.unsubscribe(pcTopic); } catch (e) {} }
  pcTopic = parentClass ? `${APP}/pc/${me.school}/${parentClass.grade}/${parentClass.cls}` : "";
  if (pcTopic) client.subscribe(pcTopic);
}
/* 本班全体家长（孩子在该班的 parent 成员） */
function parentMembersOf() {
  if (!parentClass || !schoolRec) return [];
  const members = schoolRec.members || [];
  const clsOf = nm => { const st = members.find(y => y.role === "student" && y.name === nm); return st ? { grade: +st.grade, cls: clsNorm(st.cls) } : null; };
  return members.filter(x => {
    if (x.role !== "parent" || !x.child) return false;
    const c = clsOf(x.child);
    return c && c.grade === parentClass.grade && c.cls === parentClass.cls;
  });
}
function renderPcUI() {
  if (me.role !== "parent") return;
  const box = $("pcMembers"); if (!box) return;
  $("pcTitle").textContent = parentClass ? gradeLabel(parentClass.grade) + parentClass.cls + "班 " : "";
  $("pcSub").textContent = parentClass ? " · 本班全体家长自由交流" : " · 未找到孩子的班级信息，暂时无法使用";
  const ms = parentMembersOf();
  box.innerHTML = "";
  ms.slice().sort((a, b) => a.name.localeCompare(b.name, "zh")).forEach(x => {
    if (client && client.connected) client.subscribe(`${APP}/u/${x.name}/+`);
    const on = presenceKey(x.name) ? "on" : "";
    const d = document.createElement("span");
    d.className = "mchip" + (x.name === me.name ? " hl" : "");
    d.innerHTML = `<span class="d ${on}"></span>${esc(x.name)}${x.name === me.name ? "（我）" : ""}<span class="muted">${esc(x.child)}的${esc(x.ptype || "家长")}</span>`;
    box.appendChild(d);
  });
  if (!ms.length) box.innerHTML = '<span class="muted">本班暂无家长成员</span>';
}
function pcNameOf(nm) {
  const rec = (schoolRec && schoolRec.members || []).find(x => x.name === nm);
  return rec && rec.child ? `${rec.child}的${rec.ptype || "家长"}` : nm;
}
function onPcMsg(m) {
  if (!m || (m.from === me.uid && m.dev === me.dev)) return;
  if (m.t === "msg") appendPcMsg(m, false);
  else if (m.t === "bc") appendPcMsg(m, false);
}
function appendPcMsg(m, mine) {
  const log = $("pcLog"); if (!log) return;
  const d = document.createElement("div");
  if (m.t === "bc") {
    d.className = "msg bc";
    d.innerHTML = `<div class="bchead">📢 ${esc(m.fromName || "班主任")} · 班级广播</div>` +
      (m.text ? renderRich(m.text, parentMembersOf().map(x => x.name)) : "") +
      bcMediaHtml(m) + `<div class="mt">${fmtTime(m.at || Date.now())}</div>`;
    bindBcZoom(d);
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    toast(`📢 ${esc(m.fromName || "班主任")} 发来了班级广播`, "ok", 5000);
    return;
  }
  d.className = "msg" + (mine ? " mine" : "");
  const nm = m.from === me.uid ? "我" : (pcNameOf(m.fromName || ""));
  d.innerHTML = `<div class="mname">${esc(nm)}</div>${m.kind === "gif" ? gifBodyHtml(m, mine) : renderRich(m.text, parentMembersOf().map(x => x.name))}<div class="mt">${fmtTime(m.at || Date.now())}</div>`;
  bindGifSave(d);
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
$("pcMsg").addEventListener("keydown", e => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter" && !mentionOpen($("pcMsg"))) $("pcSend").click(); });
$("pcSend").onclick = () => {
  const v = $("pcMsg").value.trim();
  if (!v) return;
  if (!client) { toast("通信组件未加载，请刷新页面重试", "warn", 6000); return; }
  if (!pcTopic) { toast("未找到孩子的班级，无法在家长群发言", "warn"); return; }
  const names = parentMembersOf().map(x => x.name).filter(n => n !== me.name);
  const all = v.includes("@全体成员");
  client.publish(pcTopic, JSON.stringify({ t: "msg", text: v, at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  appendPcMsg({ t: "msg", text: v, from: me.uid, dev: me.dev, fromName: me.name, at: Date.now() }, true);
  (all ? names : mentionedOf(v, names)).forEach(n => sendUser(n, { t: "mention", group: "parent", text: v.slice(0, 60), at: Date.now() }));
  $("pcMsg").value = "";
};
/* 表情面板 + @提及 + GIF 表情包（家长群） */
attachEmoji($("pcMsg"), $("pcEmoji"));
attachMention($("pcMsg"), () => ["全体成员"].concat(parentMembersOf().map(x => x.name)).filter(n => n !== me.name));
function sendPcGif(gif) {
  if (!pcTopic) { toast("未找到孩子的班级，无法在家长群发送", "warn"); return; }
  client.publish(pcTopic, JSON.stringify({ t: "msg", kind: "gif", gif, at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name }), { qos: 0 });
  appendPcMsg({ t: "msg", kind: "gif", gif, from: me.uid, dev: me.dev, fromName: me.name, at: Date.now() }, true);
}
attachSticker($("pcGif"), sendPcGif);
attachGifPaste($("pcMsg"), sendPcGif);
/* ================= 班级广播（班主任 → 全班学生 + 全体家长，照片/视频 + 文字） ================= */
let bcMedia = [];   // 待发送媒体 [{k:"img"|"vid", d:dataURL}]
const BC_IMG_MAX = 9, BC_VID_MAX = 2, BC_VID_BYTES = 15 * 1024 * 1024;
const bcHistGet = n => { try { return JSON.parse(localStorage.getItem(APP + "_bc_" + n) || "[]"); } catch (e) { return []; } };
const bcHistSet = (n, v) => localStorage.setItem(APP + "_bc_" + n, JSON.stringify(v));
/* 广播消息媒体渲染（m.m = [{k:"img"|"vid", d}]） */
function bcMediaHtml(m) {
  const arr = Array.isArray(m && m.m) ? m.m : [];
  const imgs = arr.filter(x => x && x.k === "img" && x.d);
  const vids = arr.filter(x => x && x.k === "vid" && x.d);
  let h = "";
  if (imgs.length) h += '<div class="bcimgs">' + imgs.map(x => `<img class="bcimg" src="${esc(x.d)}" loading="lazy" alt="广播图片">`).join("") + "</div>";
  if (vids.length) h += vids.map(x => `<video class="bcvid" src="${esc(x.d)}" controls preload="metadata"></video>`).join("");
  return h;
}
/* 点击广播图片放大查看（复用 gifZoom 遮罩） */
function bindBcZoom(el) {
  el.querySelectorAll("img.bcimg").forEach(im => {
    im.onclick = () => {
      const ov = document.createElement("div");
      ov.className = "gifZoom";
      const big = document.createElement("img");
      big.src = im.src;
      ov.appendChild(big);
      ov.onclick = () => ov.remove();
      document.body.appendChild(ov);
    };
  });
}
/* 读图片：GIF 保持原样；其他缩放到 ≤1600px 并转 JPEG(0.85)，显著减小 MQTT 负载 */
function bcReadImage(file) {
  return new Promise(res => {
    if (!file || !/^image\//.test(file.type)) { res({ ok: false, err: "不是图片文件" }); return; }
    if (file.size > 8 * 1024 * 1024) { res({ ok: false, err: "图片超过 8MB" }); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const url = fr.result;
      if (file.type === "image/gif") { res({ ok: true, k: "img", d: url }); return; }
      const im = new Image();
      im.onload = () => {
        try {
          const MAX = 1600;
          let w = im.naturalWidth, h = im.naturalHeight;
          if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
          const cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          cv.getContext("2d").drawImage(im, 0, 0, w, h);
          res({ ok: true, k: "img", d: cv.toDataURL("image/jpeg", 0.85) });
        } catch (e) { res({ ok: true, k: "img", d: url }); }
      };
      im.onerror = () => res({ ok: false, err: "图片解码失败" });
      im.src = url;
    };
    fr.onerror = () => res({ ok: false, err: "文件读取失败" });
    fr.readAsDataURL(file);
  });
}
/* 读视频：MP4/WebM/MOV，≤15MB，data URL 直传 */
function bcReadVideo(file) {
  return new Promise(res => {
    if (!file || !/^video\//.test(file.type)) { res({ ok: false, err: "不是视频文件" }); return; }
    if (file.size > BC_VID_BYTES) { res({ ok: false, err: "视频超过 15MB，请压缩或裁剪后再发" }); return; }
    const fr = new FileReader();
    fr.onload = () => res({ ok: true, k: "vid", d: fr.result });
    fr.onerror = () => res({ ok: false, err: "文件读取失败" });
    fr.readAsDataURL(file);
  });
}
const bcCount = k => bcMedia.filter(x => x.k === k).length;
function renderBcPreviews() {
  const box = $("bcPreviews"); if (!box) return;
  box.innerHTML = "";
  bcMedia.forEach((x, i) => {
    const d = document.createElement("div");
    d.className = "pp";
    d.innerHTML = x.k === "vid"
      ? `<video src="${x.d}" muted preload="metadata"></video><span class="vtag">🎬 视频</span><button type="button" title="移除">×</button>`
      : `<img src="${x.d}" alt="预览"><button type="button" title="移除">×</button>`;
    d.querySelector("button").onclick = () => { bcMedia.splice(i, 1); renderBcPreviews(); };
    box.appendChild(d);
  });
  const ni = bcCount("img"), nv = bcCount("vid");
  $("bcSizeNote").textContent = (ni || nv) ? `已选 ${ni} 张图 · ${nv} 个视频` : "";
}
function bcAddFiles(files, kind) {
  const reader = kind === "vid" ? bcReadVideo : bcReadImage;
  const cap = kind === "vid" ? BC_VID_MAX : BC_IMG_MAX;
  const capTxt = kind === "vid" ? `视频最多 ${BC_VID_MAX} 个` : `图片最多 ${BC_IMG_MAX} 张`;
  const list = Array.from(files || []);
  const next = () => {
    if (!list.length) { renderBcPreviews(); return; }
    const f = list.shift();
    if (bcCount(kind) >= cap) { toast(capTxt, "warn", 4000); renderBcPreviews(); return; }
    reader(f).then(r => {
      if (r.ok) bcMedia.push({ k: r.k, d: r.d });
      else toast(`${f.name}：${r.err}`, "warn", 5000);
      next();
    });
  };
  next();
}
$("bcPickBtn").onclick = () => $("bcFile").click();
$("bcVidBtn").onclick = () => $("bcVid").click();
$("bcFile").onchange = () => { bcAddFiles($("bcFile").files, "img"); $("bcFile").value = ""; };
$("bcVid").onchange = () => { bcAddFiles($("bcVid").files, "vid"); $("bcVid").value = ""; };
/* 我作为班主任可广播的班级（schoolRec 成员表 + myClass 兜底） */
function bcClasses() {
  const out = [];
  const push = (g, c) => {
    c = clsNorm(c); g = +g;
    const k = g + "|" + c;
    if (g >= 1 && g <= 12 && /^[A-E]$/.test(c) && !out.some(x => x.k === k)) out.push({ k, g, c });
  };
  (schoolRec && schoolRec.members || []).forEach(x => { if (x.name === me.name && x.isClassTeacher && x.grade && x.cls) push(x.grade, x.cls); });
  if (myClass) push(myClass.grade, myClass.cls);
  return out;
}
function renderBroadcastUI() {
  if (!(me.isHead && myClass)) return;
  const sel = $("bcClass"); if (!sel) return;
  const cur = sel.value;
  const cls = bcClasses();
  sel.innerHTML = cls.map(c => `<option value="${c.k}">${gradeLabel(c.g)}${c.c}班</option>`).join("");
  if (cur && cls.some(c => c.k === cur)) sel.value = cur;
  renderBcHint();
  renderBcHistory();
}
function renderBcHint() {
  const sel = $("bcClass"); if (!sel || !sel.value) return;
  const [g, c] = sel.value.split("|");
  const ms = schoolRec && schoolRec.members || [];
  const stus = ms.filter(x => x.role === "student" && (+x.grade) === +g && clsNorm(x.cls) === c).length;
  const pars = ms.filter(x => {
    if (x.role !== "parent" || !x.child) return false;
    const s = ms.find(y => y.role === "student" && y.name === x.child);
    return s && (+s.grade) === +g && clsNorm(s.cls) === c;
  }).length;
  $("bcHint").textContent = `将发送给本班 ${stus} 名学生 + ${pars} 位家长`;
}
$("bcClass").onchange = renderBcHint;
/* 发送：班级群 + 家长群双通道；每条媒体一条 MQTT 消息（首条带文字），控制单包大小 */
function bcSend() {
  const text = $("bcText").value.trim();
  if (!text && !bcMedia.length) { toast("请填写配文或添加图片 / 视频", "warn"); return; }
  if (!client || !client.connected) { toast("连接未就绪，请稍后再试", "warn"); return; }
  const [g, c] = ($("bcClass").value || "").split("|");
  if (!g || !c) { toast("请选择广播班级", "warn"); return; }
  const clT = `${APP}/cl/${me.school}/${g}/${c}`;
  const pcT = `${APP}/pc/${me.school}/${g}/${c}`;
  const ni = bcCount("img"), nv = bcCount("vid");
  const parts = [];
  if (bcMedia.length) bcMedia.forEach((x, i) => parts.push({ t: "bc", text: i === 0 ? text : "", m: [{ k: x.k, d: x.d }], at: Date.now() }));
  else parts.push({ t: "bc", text, m: [], at: Date.now() });
  const btn = $("bcSendBtn");
  btn.disabled = true;
  let done = 0;
  const finish = () => {
    done++;
    btn.textContent = `发送中… ${done}/${parts.length * 2}`;
    if (done < parts.length * 2) return;
    btn.disabled = false; btn.textContent = "📢 发送广播";
    toast(`广播已发送：${gradeLabel(+g)}${c}班（学生 + 家长）`, "ok", 6000);
    const hist = bcHistGet(me.name);
    hist.unshift({ text, ni, nv, at: Date.now(), cls: gradeLabel(+g) + c + "班" });
    bcHistSet(me.name, hist.slice(0, 50));
    renderBcHistory();
    bcMedia = [];
    renderBcPreviews();
    $("bcText").value = "";
  };
  parts.forEach(p => {
    const pay = JSON.stringify(Object.assign({ from: me.uid, dev: me.dev, fromName: me.name }, p));
    client.publish(clT, pay, { qos: 0 }, finish);
    client.publish(pcT, pay, { qos: 0 }, finish);
  });
  /* 本地立即显示到自己所在的班级群 */
  if (myClass && (+g) === (+myClass.grade) && c === clsNorm(myClass.cls)) {
    const log = $("clsLog");
    if (log) parts.forEach(p => {
      const d = document.createElement("div");
      d.className = "msg bc";
      d.innerHTML = `<div class="bchead">📢 我 · 班级广播</div>` + (p.text ? renderRich(p.text, classMembersOf().map(x => x.name)) : "") + bcMediaHtml(p) + `<div class="mt">${fmtTime(Date.now())}</div>`;
      bindBcZoom(d);
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
  }
}
$("bcSendBtn").onclick = bcSend;
function renderBcHistory() {
  const box = $("bcHistory"); if (!box) return;
  const hist = bcHistGet(me.name);
  if (!hist.length) { box.innerHTML = '<p class="muted">还没有发过广播</p>'; return; }
  box.innerHTML = hist.slice(0, 20).map(h =>
    `<div class="friend" style="flex-wrap:wrap"><span class="fname">${esc(h.cls || "")}</span><span class="muted">${esc(fmtTime(h.at))} · ${h.ni || 0} 图 · ${h.nv || 0} 视频</span><span style="width:100%">${esc((h.text || "（无配文）").slice(0, 100))}</span></div>`
  ).join("");
}
/* ================= 家长 → 班主任申请（请假 / 退学等） ================= */
function headTeachersOf(pc) {
  if (!pc || !schoolRec) return [];
  return (schoolRec.members || []).filter(x =>
    (x.role === "teacher" || x.role === "admin") && x.isClassTeacher && (+x.grade) === pc.grade && clsNorm(x.cls) === pc.cls
  ).map(x => x.name);
}
/* 家长发送：retained 写入 APP/prq/<班主任>/<家长>，班主任离线也能收到 */
$("prSend").onclick = () => {
  const kind = $("prKind").value;
  const text = $("prText").value.trim();
  if (!text) { toast("请填写说明内容", "warn"); return; }
  const heads = headTeachersOf(parentClass);
  if (!heads.length) { toast("本班暂未设置班主任，无法发送", "warn", 6000); return; }
  heads.forEach(hn => client.publish(`${APP}/prq/${hn}/${me.name}`, JSON.stringify({
    t: "parentreq", kind, text, child: meAuth.child || "", at: Date.now(), from: me.uid, dev: me.dev, fromName: me.name
  }), { retain: true, qos: 1 }));
  toast("已将" + esc(kind) + "申请发送给班主任：" + esc(heads.join("、")), "ok", 6000);
  $("prText").value = "";
};
/* 班主任接收：retained 主题聚合（+/+ 订阅到 APP/prq/<我>/<家长>），批复后清空对应 retained */
function onPrqTopic(topic, m) {
  const parts = topic.split("/");
  if (parts.length !== 4 || parts[2] !== me.name) return;
  const pn = parts[3];
  if (!m || !m.t) { /* retained 已被清除（其他设备已处理） */
    preqs = preqs.filter(r => r.parent !== pn);
    LS.spreq(me.name, preqs); renderPrq();
    return;
  }
  if (m.from === me.uid && m.dev === me.dev) return;
  const rec = { parent: pn, kind: m.kind || "咨询", text: m.text || "", child: m.child || "", at: m.at || Date.now() };
  const ex = preqs.find(r => r.parent === pn);
  if (ex) Object.assign(ex, rec); else preqs.push(rec);
  LS.spreq(me.name, preqs); renderPrq();
  toast(`📨 家长 <b>${esc(pn)}</b>（${esc(rec.child)}的家长）发来${esc(rec.kind)}申请`, "warn", 7000);
}
function renderPrq() {
  const box = $("prqList"); if (!box) return;
  box.innerHTML = "";
  if (!preqs.length) { box.innerHTML = '<p class="muted">暂无家长申请</p>'; return; }
  preqs.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).forEach(r => {
    const div = document.createElement("div");
    div.className = "pitem";
    div.innerHTML = `<span class="n"><b>${esc(r.parent)}</b>（${esc(r.child)}的家长）</span><span class="muted">【${esc(r.kind)}】${esc(r.text)} · ${fmtTime(r.at || Date.now())}</span>`;
    const ok = document.createElement("button"); ok.textContent = "批准"; ok.className = "primary";
    ok.onclick = () => replyPrq(r, true);
    const no = document.createElement("button"); no.textContent = "驳回"; no.className = "danger";
    no.onclick = () => replyPrq(r, false);
    div.append(ok, no);
    box.appendChild(div);
  });
}
function replyPrq(r, ok) {
  sendUser(r.parent, { t: "parentreq-reply", ok, kind: r.kind, text: r.text });
  client.publish(`${APP}/prq/${me.name}/${r.parent}`, "", { retain: true, qos: 1 }); // 清除 retained
  preqs = preqs.filter(x => x !== r);
  LS.spreq(me.name, preqs); renderPrq();
  toast(`已${ok ? "批准" : "驳回"} <b>${esc(r.parent)}</b> 的${esc(r.kind)}申请`, "ok", 5000);
}
/* ================= 好友（自动：同班同学；添加限制：仅同校） ================= */
function autoFriend() {
  if (!myClass || !schoolRec) return;
  const mine = classMembersOf().filter(x => x.name !== me.name && x.role === "student").map(x => x.name);
  // 班主任与同班学生自动互为好友；学生之间也自动
  const key = `${me.school}_${myClass.grade}_${myClass.cls}`;
  const hash = mine.slice().sort().join(",");
  if (LS.autof(me.name, key) === hash) { /* 已自动加过，不重复 */ }
  else {
    let changed = false;
    mine.forEach(nm => {
      if (!friends.find(f => f.name === nm)) { friends.push({ name: nm, online: false }); client.subscribe(`${APP}/u/${nm}/+`); changed = true; }
    });
    // 班主任也自动加另一位班主任
    const heads = schoolRec.members.filter(x => (x.role === "teacher" || x.role === "admin") && x.isClassTeacher && (+x.grade) === myClass.grade && clsNorm(x.cls) === myClass.cls && x.name !== me.name).map(x => x.name);
    heads.forEach(nm => { if (!friends.find(f => f.name === nm)) { friends.push({ name: nm, online: false }); client.subscribe(`${APP}/u/${nm}/+`); changed = true; } });
    if (changed) { LS.sf(me.name, friends); renderFriends(); }
    LS.sautof(me.name, key, hash);
  }
}
function onPresenceChange() { renderFriends(); renderClsMembers(); }
function probeAuth(name) {
  return new Promise(resolve => {
    const topic = `${APP}/auth/${name}`;
    let rec = null;
    const probe = (t, p) => { if (t === topic) { try { const r = JSON.parse(p.toString()); if (r && r.ph) rec = r; } catch (e) {} } };
    client.subscribe(topic);
    client.on("message", probe);
    setTimeout(() => {
      try { client.unsubscribe(topic); client.removeListener("message", probe); } catch (e) {}
      resolve(rec);
    }, 1000);
  });
}
function sendUser(targetName, obj) {
  obj.from = me.uid; obj.dev = me.dev; obj.fromName = me.name; obj.toName = targetName;
  client.publish(`${APP}/msg/${targetName}`, JSON.stringify(obj));
}
function sendFriendMsg(targetName, obj) {
  obj.from = me.uid; obj.dev = me.dev; obj.fromName = me.name; obj.toName = targetName;
  client.publish(`${APP}/fr/${targetName}/${me.name}`, JSON.stringify(obj), { retain: true, qos: 1 });
}
function addFriend(name, silent) {
  if (!friends.find(f => f.name === name)) {
    friends.push({ name, online: false });
    LS.sf(me.name, friends);
    client.subscribe(`${APP}/u/${name}/+`);
    renderFriends();
  }
  if (!silent) toast("已添加好友 <b>" + esc(name) + "</b>", "ok");
}
$("addFriendBtn").onclick = async () => {
  const n = $("friendName").value.trim();
  if (n.length < 2) { toast("请输入正确的用户名", "warn"); return; }
  if (n === me.name) { toast("不能添加自己", "warn"); return; }
  if (friends.find(f => f.name === n)) { toast("已经是好友了", "warn"); return; }
  $("addFriendBtn").disabled = true;
  const rec = await probeAuth(n);
  $("addFriendBtn").disabled = false;
  if (!rec) { toast("用户名 <b>" + esc(n) + "</b> 不存在", "warn", 5000); return; }
  if (rec.school && rec.school !== me.school) { toast("只能添加<b>同校</b>的人为好友（对方在 " + esc(rec.school) + "）", "warn", 6000); return; }
  sendFriendMsg(n, { t: "friendreq" });
  toast("已向 <b>" + esc(n) + "</b> 发送好友申请", "ok");
  $("friendName").value = "";
};
$("friendName").addEventListener("keydown", e => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter") $("addFriendBtn").click(); });
function onFriendTopic(topic, m) {
  const parts = topic.split("/");
  if (parts.length !== 4 || parts[2] !== me.name || !m || !m.t) return;
  try { client.publish(topic, "", { retain: true, qos: 1 }); } catch (e) {}
  if (m.from === me.uid && m.dev === me.dev) return;
  m.fromName = parts[3];
  onUserMsg(m);
}
function onUserMsg(m) {
  if (!m || (m.from === me.uid && m.dev === me.dev)) return;
  /* 家长不参与视频会议：拦截一切会议类邀请 */
  if (me.role === "parent" && (m.t === "invite" || m.t === "forceinvite" || m.t === "schedinvite")) {
    toast(`<b>${esc(m.fromName)}</b> 邀请你参加视频会议，但家长账号不支持视频会议`, "warn", 7000);
    return;
  }
  switch (m.t) {
    case "friendreq": {
      if (friends.find(f => f.name === m.fromName)) return;
      if (reqs.find(r => r.uid === m.from)) return;
      reqs.push({ name: m.fromName, uid: m.from });
      LS.sreqs(me.name, reqs);
      renderReqs();
      actionToast(`<b>${esc(m.fromName)}</b> 请求添加你为好友`, [
        { label: "接受", cls: "primary", fn: () => {
          reqs = reqs.filter(r => r.uid !== m.from); LS.sreqs(me.name, reqs); renderReqs();
          addFriend(m.fromName, true);
          sendFriendMsg(m.fromName, { t: "friendok" });
          toast("已与 <b>" + esc(m.fromName) + "</b> 成为好友", "ok");
        } },
        { label: "拒绝", cls: "danger", fn: () => { reqs = reqs.filter(r => r.uid !== m.from); LS.sreqs(me.name, reqs); renderReqs(); sendFriendMsg(m.fromName, { t: "friendno" }); } }
      ]);
      break;
    }
    case "friendok":
      addFriend(m.fromName, true);
      toast("<b>" + esc(m.fromName) + "</b> 接受了你的好友申请", "ok");
      break;
    case "friendno":
      toast("<b>" + esc(m.fromName) + "</b> 拒绝了你的好友申请", "warn");
      break;
    case "invite": {
      actionToast(`<b>${esc(m.fromName)}</b> 邀请您加入会议<br><span class="muted">${esc(m.title || "视频会议")} · 会议码 ${esc(m.code)}</span>`, [
        { label: "进入会议", cls: "primary", fn: () => launchMeeting({ code: m.code, title: m.title, role: "guest", from: "main", force: true }) },
        { label: "拒绝", cls: "danger", fn: () => sendUser(m.fromName, { t: "invite-reply", code: m.code, reason: "不方便" }) }
      ], true);
      break;
    }
    case "forceinvite":
      toast(`<b>${esc(m.fromName)}</b> 将你拉入会议 <b>${esc(m.title || "")}</b>（${esc(m.code)}）`, "ok", 5000);
      launchMeeting({ code: m.code, title: m.title, role: "guest", from: "main", force: true });
      break;
    case "invite-reply":
      toast(`<b>${esc(m.fromName)}</b> 拒绝了你的邀请<br>理由：${esc(m.reason || "无")}`, "warn", 7000);
      break;
    /* ---- 被 @ 提醒（班级群 / 家长群 / 学生会群） ---- */
    case "mention":
      toast(`💬 <b>${esc(m.fromName)}</b> 在${esc(m.group === "parent" ? "家长群" : m.group === "council" ? "学生会群" : "班级群")} @你：<br>${esc((m.text || "").slice(0, 60))}`, "ok", 8000);
      break;
    /* ---- 家长申请批复（家长接收） ---- */
    case "parentreq-reply":
      toast(`<b>${esc(m.fromName)}</b>（班主任）${m.ok ? "已<b>批准</b>" : "<b>驳回</b>了"}你的【${esc(m.kind || "")}】申请`, m.ok ? "ok" : "warn", 9000);
      break;
    /* ---- 学况反馈在线提醒（家长接收，完整内容在「成绩」tab 查看） ---- */
    case "report":
      toast(`📨 老师 <b>${esc(m.fromName)}</b> 发来了学况反馈（${esc(m.child || "孩子")}）：<br>${esc((m.text || "").slice(0, 60))}`, "ok", 9000);
      break;
    /* ---- 定时会议 ---- */
    case "schedinvite": {
      actionToast(`<b>${esc(m.fromName)}</b> 邀请你预定定时会议<br><span class="muted">${esc(m.title)} · ${fmtTime(m.start)} · 码 ${esc(m.code)}</span>`, [
        { label: "预定（RSVP）", cls: "primary", fn: () => {
          sendUser(m.fromName, { t: "rsvp", code: m.code });
          scheduled.push({ code: m.code, title: m.title, start: m.start, creator: false, creatorName: m.fromName, rsvps: [], status: "pending", joined: false });
          LS.ssched(me.name, scheduled); renderSched();
          toast("已预定，到点自动进入会议", "ok", 6000);
        } },
        { label: "不预定", fn: () => sendUser(m.fromName, { t: "schedno", code: m.code }) }
      ], true);
      break;
    }
    case "rsvp": {
      const s = scheduled.find(x => x.code === m.code && x.creator);
      if (!s) return;
      if (!s.rsvps.find(r => r.uid === m.from)) s.rsvps.push({ name: m.fromName, uid: m.from });
      LS.ssched(me.name, scheduled); renderSched();
      break;
    }
    case "schedno": {
      const s = scheduled.find(x => x.code === m.code && x.creator);
      if (s) { s.rsvps = s.rsvps.filter(r => r.uid !== m.from); LS.ssched(me.name, scheduled); renderSched(); }
      break;
    }
    case "rsvp-remove":
      scheduled = scheduled.filter(x => !(x.code === m.code && !x.creator));
      LS.ssched(me.name, scheduled); renderSched();
      toast("你被移出了会议「" + esc(m.title || "") + "」的预定名单", "warn", 5000);
      break;
  }
}
function renderFriends() {
  const ul = $("friendList"); if (!ul) return;
  ul.innerHTML = "";
  if (!friends.length) { ul.innerHTML = '<li class="friend muted">暂无好友</li>'; return; }
  friends.slice().sort((a, b) => (presenceKey(b.name) ? 1 : 0) - (presenceKey(a.name) ? 1 : 0)).forEach(f => {
    const on = presenceKey(f.name);
    const li = document.createElement("li");
    li.className = "friend";
    li.innerHTML = `<span class="dot ${on ? "on" : ""}"></span><span class="fname">${esc(f.name)}</span>`;
    const d = document.createElement("button");
    d.textContent = "删除"; d.className = "danger";
    d.onclick = () => { friends = friends.filter(x => x.name !== f.name); LS.sf(me.name, friends); renderFriends(); };
    li.appendChild(d);
    ul.appendChild(li);
  });
}
function renderReqs() {
  const ul = $("reqList"); if (!ul) return;
  ul.innerHTML = "";
  if (!reqs.length) { ul.innerHTML = '<li class="friend muted">暂无申请</li>'; return; }
  reqs.forEach(r => {
    const li = document.createElement("li");
    li.className = "friend";
    li.innerHTML = `<span class="fname">${esc(r.name)}</span>`;
    const acc = document.createElement("button"); acc.textContent = "接受"; acc.className = "primary";
    acc.onclick = () => { reqs = reqs.filter(x => x !== r); LS.sreqs(me.name, reqs); renderReqs(); addFriend(r.name, true); sendFriendMsg(r.name, { t: "friendok" }); };
    const rej = document.createElement("button"); rej.textContent = "拒绝";
    rej.onclick = () => { reqs = reqs.filter(x => x !== r); LS.sreqs(me.name, reqs); renderReqs(); sendFriendMsg(r.name, { t: "friendno" }); };
    li.append(acc, rej); ul.appendChild(li);
  });
}
/* ================= 学院分 ================= */
function ptStudents() {
  if (!schoolRec) return [];
  return (schoolRec.members || []).filter(x => x.role === "student");
}
function canGivePt() { return me.role === "teacher" || me.role === "admin" || me.isHead; }
function renderPoints() {
  const items = (ptDoc && ptDoc.items) || {};
  /* 可选学生下拉（教师） */
  const sel = $("ptStudent");
  if (sel && canGivePt()) {
    sel.innerHTML = '<option value="">选择学生…</option>';
    ptStudents().slice().sort((a, b) => a.name.localeCompare(b.name, "zh")).forEach(s => {
      const o = document.createElement("option");
      o.value = s.name;
      o.textContent = s.name + "（" + gradeLabel(s.grade) + (s.cls || "") + "班" + (s.sid ? " · 学号 " + s.sid : "") + "）当前 " + ((items[s.name] && items[s.name].total) || 0) + " 分";
      sel.appendChild(o);
    });
  }
  if (sel) $("ptAddCard").classList.toggle("hidden", !canGivePt());
  renderPtRanks();
  renderPtHist();
}
function renderPtRanks() {
  const items = (ptDoc && ptDoc.items) || {};
  const rows = Object.keys(items).map(nm => ({ nm, total: items[nm].total || 0, rec: items[nm] }));
  rows.sort((a, b) => b.total - a.total || a.nm.localeCompare(b.nm, "zh"));
  /* 班级排行（只看本班，若有班） */
  const clsBox = $("ptRankClass");
  if (clsBox) {
    const names = myClass ? ptStudents().filter(s => (+s.grade) === myClass.grade && clsNorm(s.cls) === myClass.cls).map(s => s.name) : ptStudents().map(s => s.name);
    $("ptClassNote").textContent = myClass ? "（" + gradeLabel(myClass.grade) + myClass.cls + "班）" : "（全校学生）";
    const clsRows = rows.filter(r => names.includes(r.nm));
    clsBox.innerHTML = `<tr><th>名次</th><th>学生</th><th>分数</th></tr>` + clsRows.slice(0, 20).map((r, i) =>
      `<tr class="${r.nm === me.name ? "me" : ""}"><td>${i + 1}</td><td>${esc(r.nm)}${r.nm === me.name ? "（我）" : ""}</td><td><b>${r.total}</b></td></tr>`).join("") || `<tr><td colspan="3" class="muted">暂无数据</td></tr>`;
  }
  /* 全校 */
  const allBox = $("ptRankAll");
  if (allBox) {
    allBox.innerHTML = `<tr><th>名次</th><th>学生</th><th>班级</th><th>分数</th></tr>` + rows.slice(0, 30).map((r, i) => {
      const stu = ptStudents().find(s => s.name === r.nm);
      const clsTxt = stu ? gradeLabel(stu.grade) + (stu.cls || "") + "班" : "";
      return `<tr class="${r.nm === me.name ? "me" : ""}"><td>${i + 1}</td><td>${esc(r.nm)}${r.nm === me.name ? "（我）" : ""}</td><td>${esc(clsTxt)}</td><td><b>${r.total}</b></td></tr>`;
    }).join("") || `<tr><td colspan="4" class="muted">暂无数据</td></tr>`;
  }
}
function renderPtHist() {
  const items = (ptDoc && ptDoc.items) || {};
  const all = [];
  Object.keys(items).forEach(nm => (items[nm].hist || []).forEach(h => all.push({ nm, ...h })));
  all.sort((a, b) => (b.at || 0) - (a.at || 0));
  const box = $("ptHist"); if (!box) return;
  box.innerHTML = "";
  if (!all.length) { box.innerHTML = '<p class="muted">还没有加分记录，去给同学加分吧</p>'; return; }
  all.slice(0, 30).forEach(h => {
    const d = document.createElement("div");
    d.className = "pitem";
    d.innerHTML = `<span class="n"><b>${esc(h.nm)}</b> <b style="color:${h.delta > 0 ? "var(--ok)" : "var(--danger)"}">${h.delta > 0 ? "+" : ""}${h.delta}</b></span><span class="muted">${esc(h.reason || "")} · ${esc(h.by || "老师")} · ${fmtTime(h.at)}</span>`;
    box.appendChild(d);
  });
}
async function submitPt(name, delta, reason) {
  /* 写前探测 broker 当前 retained 为基准合并：本地 doc 缺失（换入口刚打开 / 慢网）或过期（旧标签页双开）时，
     直接整份覆盖会把其他学生的分数清空（最后写者覆盖竞态） */
  const fresh = await probeDoc(`${APP}/pt/${me.school}`).catch(() => null);
  const base = (fresh && (fresh.name || fresh.items)) ? fresh : (ptDoc && (ptDoc.name || ptDoc.items)) ? ptDoc : { name: me.school, items: {} };
  const items = base.items || {};
  const rec = items[name] || { total: 0, hist: [] };
  rec.total = (rec.total || 0) + delta;
  rec.hist = rec.hist || [];
  rec.hist.push({ by: me.name, delta, reason, at: Date.now() });
  if (rec.hist.length > 200) rec.hist = rec.hist.slice(-200);
  items[name] = rec;
  ptDoc = Object.assign({}, base, { name: me.school, items });
  client.publish(`${APP}/pt/${me.school}`, JSON.stringify({ name: me.school, items }), { retain: true, qos: 1 });
  renderPoints();
}
document.querySelectorAll("[data-pt]").forEach(b => b.onclick = () => {
  const nm = $("ptStudent").value;
  const reason = $("ptReason").value.trim();
  if (!nm) { toast("请先选择学生", "warn"); return; }
  if (!reason) { toast("请填写加 / 扣分理由", "warn"); return; }
  const d = +b.dataset.pt;
  submitPt(nm, d, reason);
  $("ptReason").value = "";
  toast(`已给 <b>${esc(nm)}</b> ${d > 0 ? "+" : ""}${d} 分（${esc(reason)}）`, "ok", 4000);
});
/* 自选分值：输入具体数值（正数加分 / 负数扣分） */
$("ptCustomBtn").onclick = () => {
  const nm = $("ptStudent").value;
  const reason = $("ptReason").value.trim();
  const raw = $("ptCustom").value.trim();
  if (!nm) { toast("请先选择学生", "warn"); return; }
  if (!reason) { toast("请填写加 / 扣分理由", "warn"); return; }
  if (!/^-?\d{1,4}$/.test(raw) || +raw === 0) { toast("自选分值需为非零整数（最大 9999，负数为扣分）", "warn", 5000); return; }
  const d = +raw;
  submitPt(nm, d, reason);
  $("ptReason").value = ""; $("ptCustom").value = "";
  toast(`已给 <b>${esc(nm)}</b> ${d > 0 ? "+" : ""}${d} 分（${esc(reason)}）`, "ok", 4000);
};
/* ================= 学校管理 / 学生管理（管理员） ================= */
function removeMember(name) {
  if (!schoolRec || !isAdmin) return;
  if (!confirm(`确定将 ${name} 移出学校？其账号将被删除，无法再登录。`)) return;
  const members2 = (schoolRec.members || []).filter(x => x.name !== name);
  schoolRec = Object.assign({}, schoolRec, { members: members2 });
  syncRoster();
  client.publish(`${APP}/school/${me.school}`, JSON.stringify(schoolRec), { retain: true, qos: 1 });
  try { client.publish(`${APP}/auth/${name}`, "", { retain: true, qos: 1 }); } catch (e) {}
  toast("已移除成员 <b>" + esc(name) + "</b> 并删除其账号", "warn");
  renderSchoolMembers(); renderStudentList(); renderPoints(); renderClassUI();
}
function renderSchoolMembers() {
  const box = $("schoolMembers"); if (!box) return;
  const members = (schoolRec && schoolRec.members) || [];
  box.innerHTML = "";
  if (!members.length) { box.innerHTML = '<p class="muted">暂无成员</p>'; return; }
  $("schoolNameLabel").textContent = me.school;
  const adms = adminsOf();
  members.slice().sort((a, b) => (adms.includes(a.name) ? -1 : 1) - (adms.includes(b.name) ? -1 : 1)).forEach(mm => {
    const div = document.createElement("div");
    div.className = "pitem";
    const isAd = adms.includes(mm.name);
    const stuInfo = mm.role === "student" && mm.grade ? " · " + gradeLabel(mm.grade) + (mm.cls ? mm.cls + "班" : "") + (mm.sid ? " · 学号 " + esc(String(mm.sid)) : "") + (mm.gender ? " · " + mm.gender : "") : "";
    const tInfo = (mm.role === "teacher" || mm.role === "admin") && mm.isClassTeacher ? " · 班主任（" + gradeLabel(mm.grade) + (mm.cls || "") + "班）" : "";
    const pInfo = mm.role === "parent" && mm.child ? " · " + mm.child + "的" + (mm.ptype || "家长") : "";
    div.innerHTML = `<span class="n">${esc(mm.name)}${mm.name === me.name ? "（我）" : ""}</span><span class="muted">${ROLE_LABEL[mm.role] || mm.role}${stuInfo}${tInfo}${pInfo}${isAd ? " · ⭐管理员" : ""}</span>`;
    if (isAd) {
      if (mm.name !== me.name && isAdmin) {
        const dm = document.createElement("button"); dm.textContent = "取消管理员"; dm.className = "danger";
        dm.onclick = () => {
          if (adminsOf().length <= 1) { toast("至少保留一位管理员（可直接把管理员设给其他教师）", "warn"); return; }
          if (!confirm(`取消 ${mm.name} 的管理员权限？`)) return;
          setAdmin(mm.name, false);
        };
        div.appendChild(dm);
      }
    } else {
      if ((mm.role === "teacher" || mm.role === "admin") && isAdmin) {
        const tsf = document.createElement("button"); tsf.textContent = "设为管理员"; tsf.className = "primary";
        tsf.onclick = () => {
          if (!confirm(`确定把 ${mm.name} 设为管理员？管理员可管理学校成员、创建各角色账号、管理学生会群成员。`)) return;
          setAdmin(mm.name, true);
          toast("已将 <b>" + esc(mm.name) + "</b> 设为管理员", "ok", 5000);
        };
        div.appendChild(tsf);
      }
      if (isAdmin) {
        const rm = document.createElement("button"); rm.textContent = "移除"; rm.className = "danger"; rm.onclick = () => removeMember(mm.name); div.appendChild(rm);
      }
    }
    box.appendChild(div);
  });
}
/* 设置 / 取消某教师的管理员身份（无上限）；同步 auth role 与学校记录 admins */
function setAdmin(name, on) {
  const adms = adminsOf();
  const list = on ? (adms.includes(name) ? adms : adms.concat([name])) : adms.filter(x => x !== name);
  const members2 = (schoolRec.members || []).map(x => x.name === name ? Object.assign({}, x, { role: on ? "admin" : "teacher" }) : x);
  schoolRec = Object.assign({}, schoolRec, { admins: list, members: members2 });
  syncRoster();
  client.publish(`${APP}/school/${me.school}`, JSON.stringify(schoolRec), { retain: true, qos: 1 });
  patchAuthRole(name, on ? "admin" : "teacher");
  if (!on && name === me.name) { isAdmin = false; setTimeout(() => { try { location.reload(); } catch (e) {} }, 1200); }
  renderSchoolMembers(); renderStudentList();
}
/* 读取某账号 retained 后仅改 role 重新发布（不丢密码） */
function patchAuthRole(name, role) {
  const topic = `${APP}/auth/${name}`;
  const probe = (t, p) => {
    if (t !== topic) return;
    try { const r = JSON.parse(p.toString()); if (r && r.ph) client.publish(topic, JSON.stringify(Object.assign({}, r, { role })), { retain: true, qos: 1 }); } catch (e) {}
  };
  client.subscribe(topic);
  client.on("message", probe);
  setTimeout(() => { try { client.unsubscribe(topic); client.removeListener("message", probe); } catch (e) {} }, 1500);
}
function renderStudentList() {
  const box = $("studentList"); if (!box) return;
  const stus = ptStudents();
  box.innerHTML = "";
  if (!stus.length) { box.innerHTML = '<p class="muted">暂无学生，使用上方表单添加</p>'; return; }
  stus.slice().sort((a, b) => ((a.grade || 0) - (b.grade || 0)) || String(a.cls || "").localeCompare(String(b.cls || "")) || a.name.localeCompare(b.name, "zh")).forEach(s => {
    const div = document.createElement("div");
    div.className = "pitem";
    div.innerHTML = `<span class="n"><b>${esc(s.name)}</b></span><span class="muted">${gradeLabel(s.grade)}${s.cls || ""}班 · 学号 ${esc(String(s.sid || "—"))} · ${esc(s.gender || "")}</span>`;
    const rm = document.createElement("button");
    rm.textContent = "移除"; rm.className = "danger";
    rm.onclick = () => removeMember(s.name);
    div.appendChild(rm);
    box.appendChild(div);
  });
}
function checkNameTaken(n) {
  return new Promise(resolve => {
    const topic = `${APP}/auth/${n}`;
    let taken = false;
    const probe = (t, p) => { if (t === topic && p.toString().trim()) taken = true; };
    client.subscribe(topic);
    client.on("message", probe);
    setTimeout(() => { try { client.unsubscribe(topic); client.removeListener("message", probe); } catch (e) {} resolve(taken); }, 1100);
  });
}
async function createAccount(n, pw, role, extra) {
  if (await checkNameTaken(n)) { toast("用户名 <b>" + esc(n) + "</b> 已被占用", "warn", 5000); return false; }
  const ph = await hashPw(n, pw);
  const uid = Math.random().toString(36).slice(2, 12);
  client.publish(`${APP}/auth/${n}`, JSON.stringify(Object.assign({ ph, reg: Date.now(), uid, school: me.school, role, createdBy: me.name }, extra)), { retain: true, qos: 1 });
  const members = ((schoolRec && schoolRec.members) || []).filter(x => x.name !== n);
  members.push(Object.assign({ name: n, role }, extra || {}));
  schoolRec = Object.assign({}, schoolRec || { name: me.school, admin: me.name, creator: me.name, createdAt: Date.now() }, { members });
  syncRoster();
  client.publish(`${APP}/school/${me.school}`, JSON.stringify(schoolRec), { retain: true, qos: 1 });
  renderSchoolMembers(); renderStudentList(); renderPoints();
  return true;
}
$("newAccBtn").onclick = async () => {
  if (!isAdmin) return;
  const n = $("newAccName").value.trim(), pw = $("newAccPass").value, role = $("newAccRole").value;
  if (!/^[\w\u4e00-\u9fa5-]{2,16}$/.test(n)) { toast("用户名 2-16 位，仅中文/字母/数字/下划线/连字符", "warn"); return; }
  if (pw.length < 4 || pw.length > 20) { toast("密码需要 4-20 位", "warn"); return; }
  if (n === me.name) { toast("不能创建与你同名的账号", "warn"); return; }
  const enF = $("newAccFirst").value.trim(), enL = $("newAccLast").value.trim();
  $("newAccBtn").disabled = true;
  const ok = await createAccount(n, pw, role, (enF || enL) ? { fname: enF, lname: enL } : {});
  $("newAccBtn").disabled = false;
  if (ok) { $("newAccName").value = ""; $("newAccPass").value = ""; $("newAccFirst").value = ""; $("newAccLast").value = ""; toast("已创建" + (ROLE_LABEL[role] || role) + "账号 <b>" + esc(n) + "</b>，请把用户名和初始密码告知对方", "ok", 8000); }
};
$("addStuBtn").onclick = async () => {
  if (!isAdmin) return;
  const n = $("stuName").value.trim(), sid = $("stuSid").value.trim(), g = $("stuGrade").value, cls = $("stuCls").value, gender = $("stuGender").value, pw = $("stuPass").value;
  if (!/^[\w\u4e00-\u9fa5-]{2,16}$/.test(n)) { toast("姓名 2-16 位（登录用户名）", "warn"); return; }
  if (!/^[\w-]{1,12}$/.test(sid)) { toast("学号必填（1-12 位字母/数字，家长密码 = 学号）", "warn"); return; }
  if (((schoolRec && schoolRec.members) || []).some(x => x.sid && String(x.sid) === sid)) { toast("学号 <b>" + esc(sid) + "</b> 已被其他学生使用", "warn", 5000); return; }
  if (!g) { toast("请选择年级", "warn"); return; }
  if (!/^[A-E]$/.test(cls)) { toast("请选择班级（A-E 班，每级最多 5 班）", "warn"); return; }
  if (!gender) { toast("请选择性别", "warn"); return; }
  if (pw.length < 4 || pw.length > 20) { toast("密码需要 4-20 位", "warn"); return; }
  if (n === me.name) { toast("不能创建与你同名的账号", "warn"); return; }
  const enF = $("stuFirst").value.trim(), enL = $("stuLast").value.trim();
  $("addStuBtn").disabled = true;
  const ok = await createAccount(n, pw, "student", Object.assign({ sid, grade: +g, cls, gender }, (enF || enL) ? { fname: enF, lname: enL } : {}));
  $("addStuBtn").disabled = false;
  if (ok) {
    $("stuName").value = ""; $("stuSid").value = ""; $("stuCls").value = ""; $("stuPass").value = ""; $("stuGrade").value = ""; $("stuGender").value = ""; $("stuFirst").value = ""; $("stuLast").value = "";
    toast("已添加学生 <b>" + esc(n) + "</b>（" + gradeLabel(g) + cls + "班 · 学号 " + esc(sid) + " · " + gender + "），请告知用户名和密码", "ok", 8000);
  }
};
/* ================= Excel 批量导入（管理员：学生 / 教师） ================= */
/* 逐行校验：学生 = 姓名|学号|密码|班级(6B)；教师 = 姓名|班主任/非班主任|班级|密码 */
function batchValidate(kind, rows) {
  const out = [];
  const seenName = {}, seenSid = {};
  const members = (schoolRecord_safe() || []);
  rows.forEach((r, i) => {
    const line = i + 1;
    const cells = (Array.isArray(r) ? r : []).map(c => String(c ?? "").trim());
    if (!cells.some(c => c)) return;                                   // 空行跳过
    if (cells[0].includes("姓名") && (cells[1].includes("学号") || cells[1].includes("班主任"))) return; // 表头跳过
    const name = cells[0];
    const pw = kind === "student" ? cells[2] : cells[3];
    /* 可选第 5/6 列：First name / Last name（英文模式显示用） */
    const fname = cells[4] || "", lname = cells[5] || "";
    const bad = msg => { out.push({ ok: false, line, err: msg }); };
    if ((fname || lname) && !/^[A-Za-z][A-Za-z .'-]{0,29}$/.test(fname)) return bad("「" + name + "」First name 格式应为英文（可留空）");
    if ((fname || lname) && !/^[A-Za-z][A-Za-z .'-]{0,29}$/.test(lname)) return bad("「" + name + "」Last name 格式应为英文（可留空）");
    if (!/^[\w\u4e00-\u9fa5-]{2,16}$/.test(name)) return bad("姓名「" + name + "」需 2-16 位中文/字母/数字");
    if (name === me.name) return bad("不能导入与你（管理员）同名的账号");
    if (members.some(x => x.name === name)) return bad("「" + name + "」已是本校成员");
    if (seenName[name]) return bad("姓名「" + name + "」在表内重复");
    seenName[name] = true;
    if (pw.length < 4 || pw.length > 20) return bad("「" + name + "」密码需 4-20 位");
    if (kind === "student") {
      const sid = cells[1];
      if (!/^[\w-]{1,12}$/.test(sid)) return bad("「" + name + "」学号需 1-12 位字母/数字");
      if (members.some(x => x.sid && String(x.sid) === sid)) return bad("学号 " + sid + " 已被本校学生使用");
      if (seenSid[sid]) return bad("学号 " + sid + " 在表内重复");
      seenSid[sid] = true;
      const pc = parseClassStr(cells[3]);
      if (!pc) return bad("「" + name + "」班级「" + cells[3] + "」格式应为 数字+字母（如 6B，班级 A-E）");
      out.push({ ok: true, line, name, sid, pw, grade: pc.grade, cls: pc.cls, fname, lname });
    } else {
      const ht = cells[1];
      if (!/^(非)?班主任$/.test(ht)) return bad("「" + name + "」第二列需填「班主任」或「非班主任」");
      const isHead = ht === "班主任";
      let grade = 0, cls = "";
      if (isHead) {
        const pc = parseClassStr(cells[2]);
        if (!pc) return bad("「" + name + "」是班主任，第三列班级格式应为 数字+字母（如 6B）");
        grade = pc.grade; cls = pc.cls;
      }
      out.push({ ok: true, line, name, pw, isHead, grade, cls, fname, lname });
    }
  });
  return out;
}
function schoolRecord_safe() { return (schoolRec && schoolRec.members) || []; }
/* 读取表格文件 → 解析 → 预览 */
function parseSheetFile(file, kind) {
  if (typeof XLSX === "undefined") { toast("表格解析组件未加载（需联网加载 CDN），请检查网络后刷新页面", "warn", 7000); return; }
  if (!isAdmin) { toast("只有管理员可以批量导入", "warn"); return; }
  if (!schoolRec) { toast("学校数据未就绪，请稍后再试", "warn"); return; }
  const label = kind === "student" ? "学生" : "教师";
  if (!/\.(xlsx|xls|csv)$/i.test(file.name || "")) { toast("请拖入 .xlsx / .xls / .csv 表格文件", "warn", 5000); return; }
  file.arrayBuffer().then(buf => {
    let rows;
    try {
      const wb = XLSX.read(buf, { type: "array" });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    } catch (e) { toast(label + "表格解析失败：" + esc(e.message || e), "warn", 7000); return; }
    showBatchPreview(kind, batchValidate(kind, rows));
  }).catch(() => toast(label + "表格文件读取失败", "warn", 5000));
}
/* 预览解析结果，确认后批量导入 */
function showBatchPreview(kind, rows) {
  const box = $("batchPreview"); if (!box) return;
  const label = kind === "student" ? "学生" : "教师";
  if (!rows.length) { box.innerHTML = '<p class="muted">' + label + '表格中没有可导入的数据（请检查列顺序是否符合格式说明）</p>'; return; }
  const valid = rows.filter(r => r.ok);
  box.innerHTML = "";
  const h = document.createElement("p");
  h.innerHTML = "<b>" + label + "表格解析完成：" + valid.length + " / " + rows.length + " 条有效</b>";
  box.appendChild(h);
  rows.forEach(r => {
    const d = document.createElement("div");
    d.className = "pitem";
    const info = r.ok
      ? ((r.fname || r.lname ? "英文名 " + esc(((r.fname || "") + " " + (r.lname || "")).trim()) + " · " : "") +
        (kind === "student"
        ? "学号 " + esc(r.sid) + " · " + gradeLabel(r.grade) + r.cls + "班"
        : (r.isHead ? "班主任 · " + gradeLabel(r.grade) + r.cls + "班" : "非班主任")))
      : esc(r.err || "数据无效");
    d.innerHTML = `<span class="n">${r.ok ? "✅" : "❌"} <b>${r.ok ? esc(r.name) : "第 " + r.line + " 行"}</b></span><span class="muted">${info}</span>`;
    box.appendChild(d);
  });
  if (!valid.length) return;
  const bar = document.createElement("div");
  bar.className = "pt-btns";
  const ok = document.createElement("button");
  ok.className = "primary"; ok.textContent = "导入 " + valid.length + " 条";
  ok.onclick = () => runBatchImport(kind, valid);
  const no = document.createElement("button");
  no.textContent = "取消";
  no.onclick = () => { box.innerHTML = ""; };
  bar.append(ok, no);
  box.appendChild(bar);
}
/* 批量创建账号：逐个发布 retained auth + 一次性更新学校成员 + 重建班主任名单 */
async function runBatchImport(kind, rows) {
  if (!client || !client.connected || !schoolRec) { toast("连接未就绪，请稍后再试", "warn"); return; }
  const members = (schoolRec.members || []).slice();
  const headPairs = [];
  for (const r of rows) {
    const ph = await hashPw(r.name, r.pw);
    const uid = Math.random().toString(36).slice(2, 12);
    const extra = Object.assign(
      kind === "student"
        ? { sid: r.sid, grade: r.grade, cls: r.cls }
        : (r.isHead ? { isClassTeacher: true, grade: r.grade, cls: r.cls } : {}),
      (r.fname || r.lname) ? { fname: r.fname || "", lname: r.lname || "" } : {}
    );
    client.publish(`${APP}/auth/${r.name}`, JSON.stringify(Object.assign(
      { ph, reg: Date.now(), uid, school: me.school, role: kind === "student" ? "student" : "teacher", createdBy: me.name }, extra
    )), { retain: true, qos: 1 });
    const entry = Object.assign({ name: r.name, role: kind === "student" ? "student" : "teacher" }, extra);
    const idx = members.findIndex(x => x.name === r.name);
    if (idx >= 0) members[idx] = entry; else members.push(entry);
    if (r.isHead && !headPairs.some(p => p.grade === r.grade && p.cls === r.cls)) headPairs.push({ grade: r.grade, cls: r.cls });
  }
  schoolRec = Object.assign({}, schoolRec, { members });
  syncRoster();
  client.publish(`${APP}/school/${me.school}`, JSON.stringify(schoolRec), { retain: true, qos: 1 });
  /* 班主任名单：按新成员表重建对应班级的 heads retained */
  headPairs.forEach(p => {
    const list = members.filter(x => (x.role === "teacher" || x.role === "admin") && x.isClassTeacher && (+x.grade) === p.grade && clsNorm(x.cls) === p.cls).map(x => x.name);
    client.publish(`${APP}/heads/${me.school}/${p.grade}/${p.cls}`, JSON.stringify({ list, at: Date.now() }), { retain: true, qos: 1 });
  });
  $("batchPreview").innerHTML = '<p class="muted">✅ 已导入 ' + rows.length + " 个" + (kind === "student" ? "学生" : "教师") + "账号（初始密码为表中密码，班主任名单已同步）</p>";
  renderSchoolMembers(); renderStudentList(); renderPoints();
  toast("已批量导入 <b>" + rows.length + "</b> 个" + (kind === "student" ? "学生" : "教师") + "账号", "ok", 6000);
}
/* 拖拽 / 点击选择表格文件 */
function bindDropzone(el, kind) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".xlsx,.xls,.csv"; inp.style.display = "none";
  inp.onchange = () => { if (inp.files && inp.files[0]) parseSheetFile(inp.files[0], kind); inp.value = ""; };
  el.appendChild(inp);
  el.addEventListener("click", e => { if (e.target !== inp) inp.click(); });
  el.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); el.classList.add("drag"); });
  el.addEventListener("dragleave", () => el.classList.remove("drag"));
  el.addEventListener("drop", e => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove("drag");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) parseSheetFile(f, kind);
  });
}
bindDropzone($("dropStu"), "student");
bindDropzone($("dropTch"), "teacher");
/* 阻止误拖到页面其他位置时浏览器直接打开文件 */
["dragover", "drop"].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
/* ================= 成绩（E/M/D/B 等级 + 分数） ================= */
/* 等级标准：E 最好 · M 第二 · D 第三 · B 最差 */
const LV_ORDER = ["E", "M", "D", "B"];
const LV_COLOR = { E: "#2fbf8f", M: "#4f8cff", D: "#e08a2e", B: "#ff5d6c" };
function canGrade() { return me.role === "teacher" || me.role === "admin"; }
function grRecsOf(name) {
  const items = (grDoc && grDoc.items) || {};
  const r = items[name];
  return (r && Array.isArray(r.recs)) ? r.recs : [];
}
/* 各科目平均分 + 最近等级 */
function grAverages(name) {
  const bySub = {};
  grRecsOf(name).forEach(r => { (bySub[r.sub] = bySub[r.sub] || []).push(r); });
  return Object.keys(bySub).map(sub => {
    const rs = bySub[sub];
    const avg = Math.round(rs.reduce((a, r) => a + (+r.sc || 0), 0) / rs.length * 10) / 10;
    const last = rs.slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    return { sub, n: rs.length, avg, lastLv: last ? last.lv : "", lastAt: last ? last.at : 0 };
  }).sort((a, b) => a.sub.localeCompare(b.sub, "zh"));
}
/* E/M/D/B 占比饼图（纯 SVG，无需图表库） */
function pieSvg(counts) {
  const total = LV_ORDER.reduce((a, l) => a + (counts[l] || 0), 0);
  if (!total) return '<p class="muted">暂无等级数据</p>';
  let a0 = -Math.PI / 2, paths = "";
  LV_ORDER.forEach(l => {
    const v = counts[l] || 0;
    if (!v) return;
    const a1 = a0 + v / total * 2 * Math.PI;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const x0 = (100 + 80 * Math.cos(a0)).toFixed(2), y0 = (100 + 80 * Math.sin(a0)).toFixed(2);
    const x1 = (100 + 80 * Math.cos(a1)).toFixed(2), y1 = (100 + 80 * Math.sin(a1)).toFixed(2);
    paths += `<path d="M100,100 L${x0},${y0} A80,80 0 ${large} 1 ${x1},${y1} Z" fill="${LV_COLOR[l]}"></path>`;
    a0 = a1;
  });
  const legend = LV_ORDER.map(l => {
    const v = counts[l] || 0;
    return `<span class="mchip"><span style="width:10px;height:10px;border-radius:3px;background:${LV_COLOR[l]};display:inline-block;flex:none"></span>${l}：${v} 次 · ${Math.round(v / total * 100)}%</span>`;
  }).join("");
  return `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">` +
    `<svg viewBox="0 0 200 200" width="168" height="168" style="flex:none">${paths}` +
    `<circle cx="100" cy="100" r="46" style="fill:var(--panel)"></circle>` +
    `<text x="100" y="95" text-anchor="middle" font-size="12" style="fill:var(--sub)">总评定</text>` +
    `<text x="100" y="115" text-anchor="middle" font-size="19" font-weight="bold" style="fill:var(--txt)">${total}</text></svg>` +
    `<div class="memberchips" style="flex-direction:column;align-items:flex-start;margin-bottom:0">${legend}</div></div>`;
}
/* 成绩统计 tab 总渲染：教师可录入 / 选学生查看；学生看自己；家长看孩子 */
function renderGrades() {
  const teacher = canGrade();
  renderStdNote();
  renderGrTypes();
  const isParent = me.role === "parent";
  const addCard = $("grAddCard"); if (addCard) addCard.classList.toggle("hidden", !teacher);
  const sendCard = $("grSendCard"); if (sendCard) sendCard.classList.toggle("hidden", !teacher);
  const repCard = $("grReportCard"); if (repCard) repCard.classList.toggle("hidden", !isParent);
  /* 学生下拉（教师：录入 + 学况目标 + 查看目标） */
  const stuList = ptStudents().slice().sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const stuOpt = s => s.name + "（" + gradeLabel(s.grade) + (s.cls || "") + "班" + (s.sid ? " · 学号 " + s.sid : "") + "）";
  ["grStudent", "grRepStudent"].forEach(id => {
    const sel = $(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">选择学生…</option>';
    stuList.forEach(s => { const o = document.createElement("option"); o.value = s.name; o.textContent = stuOpt(s); sel.appendChild(o); });
    if (cur && Array.from(sel.options).some(o => o.value === cur)) sel.value = cur;
  });
  const who = $("grWho");
  let target = "";
  if (teacher) {
    if (who) {
      who.classList.remove("hidden");
      const cur = who.value;
      who.innerHTML = '<option value="">查看学生…</option>';
      stuList.forEach(s => { const o = document.createElement("option"); o.value = s.name; o.textContent = stuOpt(s); who.appendChild(o); });
      if (cur && Array.from(who.options).some(o => o.value === cur)) who.value = cur;
      who.onchange = () => { renderGrades(); renderRings(); };
      target = who.value || "";
    }
  } else {
    if (who) who.classList.add("hidden");
    target = isParent ? (meAuth.child || "") : me.name;
  }
  const emptyMsg = target ? "暂无成绩记录" : (teacher ? "请先选择要查看的学生" : "未找到孩子的信息");
  const note = $("grStatNote");
  if (note) note.textContent = target ? "（" + target + (isParent ? " · 我的孩子" : target === me.name ? " · 我" : "") + "）" : "";
  /* 各科目平均分表 */
  const tb = $("grStatTable");
  if (tb) {
    const avgs = target ? grAverages(target) : [];
    tb.innerHTML = `<tr><th>科目</th><th>次数</th><th>平均分</th><th>最近等级</th></tr>` + (avgs.length
      ? avgs.map(a => `<tr><td>${esc(a.sub)}</td><td>${a.n}</td><td><b>${a.avg}</b></td><td><b style="color:${LV_COLOR[a.lastLv] || "var(--txt)"}">${esc(a.lastLv || "—")}</b></td></tr>`).join("")
      : `<tr><td colspan="4" class="muted">${emptyMsg}</td></tr>`);
  }
  /* EMDB 占比饼图 */
  const pie = $("grPie");
  if (pie) {
    const counts = { E: 0, M: 0, D: 0, B: 0 };
    if (target) grRecsOf(target).forEach(r => { if (counts[r.lv] !== undefined) counts[r.lv]++; });
    pie.innerHTML = pieSvg(counts);
  }
  /* 成绩记录 */
  const hb = $("grHist");
  if (hb) {
    const recs = target ? grRecsOf(target).slice().sort((a, b) => (b.at || 0) - (a.at || 0)) : [];
    hb.innerHTML = "";
    if (!recs.length) { hb.innerHTML = '<p class="muted">' + emptyMsg + '</p>'; return; }
    recs.slice(0, 50).forEach(r => {
      const d = document.createElement("div");
      d.className = "pitem";
      const typeLabel = r.type ? stdTypeLabel(stdNow(), r.type) : "";
      const typeTag = typeLabel ? ` · <span class="muted" style="font-size:11px">[${esc(typeLabel)}]</span>` : "";
      d.innerHTML = `<span class="n"><b>${esc(r.sub || "科目")}</b>${typeTag} · ${+r.sc || 0} 分 · <b style="color:${LV_COLOR[r.lv] || "var(--txt)"}">${esc(r.lv || "—")}</b></span><span class="muted">${esc(r.by || "老师")} · ${fmtTime(r.at || Date.now())}</span>`;
      hb.appendChild(d);
    });
  }
}
/* 成绩录入（教师）：retained 写入 APP/gr/<校>；type = 作业类型 key（可空） */
async function submitGrade(name, sub, sc, lv, type) {
  /* 写前探测合并（同 submitPt）：防止本地 doc 缺失/过期时整份覆盖清空他人成绩 */
  const fresh = await probeDoc(`${APP}/gr/${me.school}`).catch(() => null);
  const base = (fresh && (fresh.name || fresh.items)) ? fresh : (grDoc && (grDoc.name || grDoc.items)) ? grDoc : { name: me.school, items: {} };
  const items = base.items || {};
  const rec = items[name] || { recs: [] };
  rec.recs = rec.recs || [];
  rec.recs.push({ sub, sc, lv, type: type || "", at: Date.now(), by: me.name });
  if (rec.recs.length > 200) rec.recs = rec.recs.slice(-200);
  items[name] = rec;
  grDoc = Object.assign({}, base, { name: me.school, items });
  client.publish(`${APP}/gr/${me.school}`, JSON.stringify({ name: me.school, items }), { retain: true, qos: 1 });
  renderGrades();
}
/* 分数自动预选等级（教师未手动改过时） */
let grLevelTouched = false;
$("grLevel").addEventListener("change", () => { grLevelTouched = true; });
/* 当前全校评分标准（未取到时用系统默认：E≥98% · M≥70% · D≥60% · 满分 100） */
function stdNow() { return stdDoc || STD_DEFAULT; }
function fullNow() { return stdFull(stdNow()); }
function renderStdNote() {
  const el = $("grStdNote");
  if (el) el.textContent = "当前全校标准：" + stdText(stdNow()) + "。";
  const go = () => { location.href = "grading.html"; };
  const vb = $("stdViewBtn"); if (vb) { vb.classList.remove("hidden"); vb.onclick = go; }
  const sb = $("stdBtn"); if (sb) { sb.classList.toggle("hidden", !canGrade()); sb.onclick = go; }
}
$("grScore").addEventListener("input", () => {
  if (grLevelTouched) return;
  const raw = $("grScore").value.trim();
  if (!/^\d{1,3}(\.\d)?$/.test(raw)) return;
  $("grLevel").value = stdLevel(stdNow(), +raw);
});
$("grAdd").onclick = () => {
  if (!canGrade()) return;
  const nm = $("grStudent").value;
  const sub = $("grSubject").value.trim();
  const scRaw = $("grScore").value.trim();
  const lv = $("grLevel").value;
  const type = $("grType").value;
  if (!nm) { toast("请选择学生", "warn"); return; }
  if (!sub || sub.length > 10) { toast("请填写科目（1-10 字）", "warn"); return; }
  const full = fullNow();
  if (!/^\d{1,3}(\.\d)?$/.test(scRaw) || +scRaw > full) { toast(`分数需为 0-${full} 的数字（可带一位小数）`, "warn", 5000); return; }
  if (!LV_ORDER.includes(lv)) { toast("请选择等级（E/M/D/B）", "warn"); return; }
  submitGrade(nm, sub, +scRaw, lv, type);
  $("grSubject").value = ""; $("grScore").value = ""; $("grLevel").value = ""; $("grType").value = ""; grLevelTouched = false;
  const typeLabel = type ? stdTypeLabel(stdNow(), type) : "";
  toast(`已录入 <b>${esc(nm)}</b> 的${esc(sub)}成绩：${scRaw} 分（${lv} 级${typeLabel ? " · " + esc(typeLabel) : ""}）`, "ok", 5000);
};
/* 填充作业类型下拉（grType）：从当前全校标准的 types 生成选项；保留当前选择 */
function renderGrTypes() {
  const sel = $("grType"); if (!sel) return;
  const cur = sel.value;
  const ts = stdTypes(stdNow());
  sel.innerHTML = '<option value="">作业类型…</option>' +
    ts.map(t => `<option value="${escAttr(t.key)}">${esc(t.label)}（${fmtNum(t.pct)}%）</option>`).join("");
  if (cur && Array.from(sel.options).some(o => o.value === cur)) sel.value = cur;
}
const escAttr = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* ================= 学况反馈（教师 → 家长，retained 离线不丢） ================= */
/* 读取任意 retained 主题当前值（用于向他人主题追加数据前先取现状） */
function probeDoc(topic) {
  return new Promise(resolve => {
    let rec = null;
    const probe = (t, p) => { if (t === topic) { try { const r = JSON.parse(p.toString()); if (r) rec = r; } catch (e) {} } };
    client.subscribe(topic);
    client.on("message", probe);
    setTimeout(() => { try { client.unsubscribe(topic); client.removeListener("message", probe); } catch (e) {} resolve(rec); }, 900);
  });
}
async function sendReport(stu, text) {
  const parents = ((schoolRec && schoolRec.members) || []).filter(x => x.role === "parent" && x.child === stu);
  if (!parents.length) { toast("该学生还没有注册的家长，无法发送", "warn", 6000); return false; }
  let sent = 0;
  for (const p of parents) {
    const topic = `${APP}/rep/${p.name}`;
    const doc = await probeDoc(topic);
    const items = (doc && Array.isArray(doc.items)) ? doc.items : [];
    items.push({ from: me.name, child: stu, text, at: Date.now() });
    client.publish(topic, JSON.stringify({ items: items.slice(-100) }), { retain: true, qos: 1 });
    sendUser(p.name, { t: "report", child: stu, text: text.slice(0, 60) }); // 在线即时提醒
    sent++;
  }
  return sent;
}
$("grRepBtn").onclick = async () => {
  if (!canGrade()) return;
  const stu = $("grRepStudent").value;
  const text = $("grRepText").value.trim();
  if (!stu) { toast("请选择学生", "warn"); return; }
  if (!text) { toast("请填写学况内容", "warn"); return; }
  $("grRepBtn").disabled = true;
  const sent = await sendReport(stu, text);
  $("grRepBtn").disabled = false;
  if (sent) {
    $("grRepText").value = "";
    toast(`已向 <b>${esc(stu)}</b> 的 ${sent} 位家长发送学况反馈`, "ok", 6000);
  }
};
/* 家长查看：学况反馈列表 */
function renderReports() {
  const box = $("grReports"); if (!box) return;
  const items = (repDoc && Array.isArray(repDoc.items)) ? repDoc.items : [];
  box.innerHTML = "";
  if (!items.length) { box.innerHTML = '<p class="muted">暂无老师发来的学况反馈</p>'; return; }
  items.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).forEach(r => {
    const d = document.createElement("div");
    d.className = "pitem";
    d.innerHTML = `<span class="n"><b>${esc(r.from || "老师")}</b>（关于 ${esc(r.child || meAuth.child || "孩子")}）</span><span class="muted">${esc(r.text || "")} · ${fmtTime(r.at || Date.now())}</span>`;
    box.appendChild(d);
  });
}
/* ================= 教师课表（自己定义：星期 + 时间 + 班级 + 科目） ================= */
const DAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
function renderTt() {
  if (!(me.role === "teacher" || me.role === "admin")) return;
  const box = $("ttList"); if (!box) return;
  const list = (ttDoc && Array.isArray(ttDoc.list)) ? ttDoc.list.slice() : [];
  list.sort((a, b) => (a.day || 0) - (b.day || 0) || String(a.st || "").localeCompare(String(b.st || "")));
  const today = ((new Date().getDay() + 6) % 7) + 1; // 周一=1 … 周日=7
  box.innerHTML = "";
  if (!list.length) { box.innerHTML = '<p class="muted">还没有课表，用上方表单添加（星期 + 时间 + 班级 + 科目）</p>'; return; }
  let curDay = 0;
  list.forEach(e => {
    if ((e.day || 0) !== curDay) {
      curDay = e.day || 0;
      const h = document.createElement("p");
      h.style.margin = "12px 0 6px";
      h.innerHTML = `<b>${esc(DAY_NAMES[curDay] || "周" + curDay)}${curDay === today ? ' <span class="muted">（今天）</span>' : ""}</b>`;
      box.appendChild(h);
    }
    const d = document.createElement("div");
    d.className = "pitem";
    d.innerHTML = `<span class="n"><b>${esc(String(e.st || ""))} - ${esc(String(e.en || ""))}</b> · ${esc(gradeLabel(e.grade))}${esc(String(e.cls || ""))}班 · ${esc(e.sub || "课")}</span>`;
    const rm = document.createElement("button");
    rm.textContent = "删除"; rm.className = "danger";
    rm.onclick = () => {
      const list2 = ((ttDoc && ttDoc.list) || []).filter(x => x !== e);
      client.publish(`${APP}/tt/${me.name}`, JSON.stringify({ list: list2 }), { retain: true, qos: 1 });
      ttDoc = { list: list2 };
      renderTt();
      toast("已删除该节课", "warn", 3000);
    };
    d.appendChild(rm);
    box.appendChild(d);
  });
}
$("ttAdd").onclick = () => {
  if (!(me.role === "teacher" || me.role === "admin")) return;
  const day = +$("ttDay").value, st = $("ttStart").value, en = $("ttEnd").value;
  const clsRaw = $("ttClass").value.trim(), sub = $("ttSub").value.trim();
  if (!day) { toast("请选择星期", "warn"); return; }
  if (!st || !en) { toast("请填写开始和结束时间", "warn"); return; }
  if (en <= st) { toast("结束时间需晚于开始时间", "warn"); return; }
  const pc = parseClassStr(clsRaw);
  if (!pc) { toast("班级格式应为 数字+字母（如 6B = 六年级B班，班级 A-E）", "warn", 5000); return; }
  if (!sub || sub.length > 10) { toast("请填写科目（1-10 字）", "warn"); return; }
  const list = ((ttDoc && ttDoc.list) || []).concat([{ day, st, en, grade: pc.grade, cls: pc.cls, sub, at: Date.now() }]);
  client.publish(`${APP}/tt/${me.name}`, JSON.stringify({ list }), { retain: true, qos: 1 });
  ttDoc = { list };
  $("ttClass").value = ""; $("ttSub").value = "";
  renderTt();
  toast(`已添加课表：${DAY_NAMES[day]} ${st} ${gradeLabel(pc.grade)}${pc.cls}班 ${sub}`, "ok", 5000);
};
/* ================= 视频：创建 / 加入 / 定时 ================= */
$("quickBtn").onclick = () => {
  const code = genCode();
  launchMeeting({ code, title: $("quickTitle").value.trim() || "快速会议", role: "host", from: "main" });
  $("quickTitle").value = "";
};
$("joinBtn").onclick = () => {
  const c = $("joinCode").value.trim();
  if (!/^\d{6}$/.test(c)) { toast("请输入 6 位数字会议码", "warn"); return; }
  launchMeeting({ code: c, title: "会议 " + c, role: "guest", from: "main" });
  $("joinCode").value = "";
};
$("joinCode").addEventListener("keydown", e => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter") $("joinBtn").click(); });
const WEEK = 7 * 24 * 3600 * 1000;
const WINDOW = 30 * 60 * 1000;
$("schedBtn").onclick = () => {
  const title = $("schedTitle").value.trim() || "定时会议";
  const tval = $("schedTime").value;
  if (!tval) { toast("请选择会议时间", "warn"); return; }
  const start = new Date(tval).getTime();
  if (isNaN(start)) { toast("时间格式错误", "warn"); return; }
  const now = Date.now();
  if (start <= now) { toast("时间必须在未来", "warn"); return; }
  if (start > now + WEEK) { toast("只能预定一周内的会议", "warn"); return; }
  const code = genCode();
  scheduled.push({ code, title, start, creator: true, rsvps: [], status: "pending", joined: false });
  LS.ssched(me.name, scheduled); renderSched();
  $("schedTitle").value = ""; $("schedTime").value = "";
  actionToast(`定时会议已创建：${esc(title)}（${fmtTime(start)}）<br>是否邀请好友预定？`, [
    { label: "邀请好友预定", cls: "primary", fn: () => inviteFriendsToSched(code) },
    { label: "暂不邀请", fn: () => toast("好友可通过会议码联系你预定", "", 4000) }
  ], true);
};
function inviteFriendsToSched(code) {
  const s = scheduled.find(x => x.code === code);
  if (!s) return;
  if (!friends.length) { toast("暂无好友可邀请", "warn"); return; }
  const d = toast("向好友发送预定邀请（" + esc(s.title) + "）", "", 0);
  const bar = document.createElement("div"); bar.className = "btns";
  friends.forEach(f => {
    const b = document.createElement("button"); b.className = "primary"; b.textContent = f.name;
    b.onclick = () => { b.disabled = true; sendFriendMsg(f.name, { t: "schedinvite", code: s.code, title: s.title, start: s.start }); };
    bar.appendChild(b);
  });
  d.appendChild(bar);
}
function checkScheduled() {
  const now = Date.now();
  let changed = false;
  for (const s of scheduled) {
    if (s.status !== "pending") continue;
    if (now >= s.start && now <= s.start + WINDOW) {
      s.status = "joined";
      changed = true;
      toast("⏰ 定时会议「" + esc(s.title) + "」时间到，自动进入", "ok", 6000);
      launchMeeting({ code: s.code, title: s.title, role: s.creator ? "host" : "guest", from: "main", pre: s.creator ? s.rsvps.map(r => r.uid) : [], auto: true });
    } else if (now > s.start + WINDOW) {
      s.status = s.joined ? "joined" : "absent";
      changed = true;
      if (!s.joined) toast("⚠️ 你缺席了定时会议「" + esc(s.title) + "」", "warn", 8000);
    }
  }
  if (changed) { LS.ssched(me.name, scheduled); renderSched(); }
}
function renderSched() {
  const box = $("schedList"); if (!box) return;
  box.innerHTML = "";
  if (!scheduled.length) { box.innerHTML = '<p class="muted">暂无定时会议</p>'; return; }
  scheduled.slice().sort((a, b) => a.start - b.start).forEach(s => {
    const div = document.createElement("div");
    div.className = "sched-item";
    const stTxt = { pending: "待开始", joined: "已参加", absent: "缺席" }[s.status] || s.status;
    const stCls = { pending: "p", joined: "j", absent: "a" }[s.status] || "p";
    let html = `<div class="st"><b class="${stCls}">${stTxt}</b> · ${esc(s.title)} · ${fmtTime(s.start)} · 码 <b>${esc(s.code)}</b> · ${s.creator ? "我创建" : "我预定"}</div>`;
    if (s.creator) {
      if (!s.rsvps.length) html += '<p class="muted">暂无好友预定</p>';
      s.rsvps.forEach(r => {
        html += `<div class="rsvp-line"><span class="n">${esc(r.name)}</span><button data-act="pull" data-code="${esc(s.code)}" data-name="${esc(r.name)}">强拉</button><button data-act="rm" data-code="${esc(s.code)}" data-name="${esc(r.name)}" class="danger">移出</button></div>`;
      });
      html += `<div class="rsvp-line"><button data-act="invite" data-code="${esc(s.code)}" class="primary">邀请好友</button><button data-act="now" data-code="${esc(s.code)}">现在开启</button><button data-act="del" data-code="${esc(s.code)}" class="danger">删除</button></div>`;
    } else {
      html += `<div class="rsvp-line"><button data-act="mine" data-code="${esc(s.code)}" class="primary">现在加入</button><button data-act="quit" data-code="${esc(s.code)}" class="danger">取消预定</button></div>`;
    }
    div.innerHTML = html;
    box.appendChild(div);
  });
  box.querySelectorAll("button[data-act]").forEach(b => {
    const act = b.dataset.act, code = b.dataset.code, name = b.dataset.name || "";
    const s = scheduled.find(x => x.code === code);
    if (!s) return;
    if (act === "invite") b.onclick = () => inviteFriendsToSched(code);
    if (act === "pull") b.onclick = () => { sendFriendMsg(name, { t: "forceinvite", code, title: s.title }); toast("已强拉 <b>" + esc(name) + "</b>", "ok"); };
    if (act === "rm") b.onclick = () => {
      s.rsvps = s.rsvps.filter(r => r.name !== name);
      LS.ssched(me.name, scheduled); renderSched();
      sendFriendMsg(name, { t: "rsvp-remove", code, title: s.title });
    };
    if (act === "now") b.onclick = () => launchMeeting({ code, title: s.title, role: "host", from: "main", pre: s.rsvps.map(r => r.uid) });
    if (act === "del") b.onclick = () => { scheduled = scheduled.filter(x => x.code !== code); LS.ssched(me.name, scheduled); renderSched(); };
    if (act === "mine") b.onclick = () => launchMeeting({ code, title: s.title, role: "guest", from: "main" });
    if (act === "quit") b.onclick = () => {
      scheduled = scheduled.filter(x => x.code !== code);
      LS.ssched(me.name, scheduled); renderSched();
      if (s.creatorName) sendFriendMsg(s.creatorName, { t: "schedno", code });
    };
  });
}
/* ================= 学科圆环（仿"健康"活动圆环：内环=平均分/150，颜色=最近等级；金色外环=冲刺 goal 进度） ================= */
function ringArc(r, w, p, col) {
  const C = 2 * Math.PI * r;
  const filled = (C * Math.max(0, Math.min(1, p))).toFixed(1);
  return `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="${w}"></circle>` +
    `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${filled} ${C.toFixed(1)}" transform="rotate(-90 60 60)"></circle>`;
}
function ringSvg(a, latestSc, goal) {
  const col = LV_COLOR[a.lastLv] || "var(--accent)";
  const full = fullNow();
  const pct = Math.round(a.avg / full * 1000) / 10;   // 当前得分百分比，保留一位小数
  /* 还需 N 个 E（每次按满分计）才能把平均分拉到 E 线 */
  const st = stdNow();
  const eScore = stdCut(st, "E");
  let needE = 0, reached = false;
  if (a.n > 0 && eScore > 0 && full > eScore) {
    if (a.avg >= eScore) reached = true;
    else needE = Math.ceil(a.n * (eScore - a.avg) / (full - eScore));
    if (!isFinite(needE) || needE < 0) needE = 0;
    if (needE > 99) needE = 99;   // 封顶，避免巨大无意义数字
  } else if (a.n > 0 && a.avg >= eScore) {
    reached = true;
  }
  const motivate = reached
    ? `已抵达 E，棒极了！🎉`
    : (a.n === 0 ? `暂无成绩，老师录入后会亮起来`
        : `还需 ${needE} 个 E 以抵达 E，加油！💪`);
  const motivateColor = reached ? "var(--ok)" : (a.n === 0 ? "var(--sub)" : col);
  let svg = `<svg viewBox="0 0 120 120" width="106" height="106" style="display:block;margin:0 auto">` + ringArc(44, 11, a.avg / full, col);
  if (goal) svg += ringArc(53, 4, latestSc / goal.sc, "#f0b400");
  /* 中心：当前得分百分比（取代原"平均分"数字） */
  svg += `<text x="60" y="58" text-anchor="middle" font-size="22" font-weight="bold" style="fill:var(--txt)">${pct}%</text>` +
    `<text x="60" y="76" text-anchor="middle" font-size="10" style="fill:var(--sub)">当前得分</text>`;
  if (goal) svg += `<text x="60" y="32" text-anchor="middle" font-size="11" font-weight="bold" style="fill:#f0b400">🎯 ${Math.round(Math.min(1, latestSc / goal.sc) * 100)}%</text>`;
  svg += `</svg>`;
  return `<div style="text-align:center;min-width:110px">${svg}` +
    `<div style="font-size:13px;margin-top:2px"><b>${esc(a.sub)}</b>${goal ? `<span class="muted"> · 🎯 目标 ${goal.sc}</span>` : ""}</div>` +
    `<div style="font-size:12px;margin-top:2px;color:${motivateColor}">${motivate}</div>` +
    `<div class="muted" style="font-size:11px;margin-top:1px">${a.n} 次记录 · 最近 <b style="color:${col}">${esc(a.lastLv || "—")}</b></div></div>`;
}
function renderRings() {
  const meetCard = $("ringCardMeet"), gradesCard = $("ringCardGrades");
  if (!meetCard || !gradesCard) return;
  const isParent = me.role === "parent", teacher = canGrade();
  let target = "";
  if (teacher) { const who = $("grWho"); target = who ? (who.value || "") : ""; }
  else target = isParent ? (meAuth.child || "") : me.name;
  meetCard.classList.toggle("hidden", me.role !== "student");
  gradesCard.classList.toggle("hidden", !target);
  const note = $("ringNote");
  if (note) note.textContent = target ? "（" + esc(target) + (isParent ? " · 我的孩子" : target === me.name ? " · 我" : "") + "）" : "";
  const avgs = target ? grAverages(target) : [];
  /* 只有学生自己看自己的环时才叠加冲刺 goal 金环 */
  const goalBySub = {};
  if (target === me.name) {
    const gs = (goalDoc && Array.isArray(goalDoc.items)) ? goalDoc.items : [];
    gs.forEach(g => { if (g.tpl === "subScore" && !g.done) goalBySub[g.sub] = g; });
  }
  const latestBySub = {};
  grRecsOf(target).forEach(r => { if (!latestBySub[r.sub] || (r.at || 0) > (latestBySub[r.sub].at || 0)) latestBySub[r.sub] = r; });
  const html = avgs.length
    ? avgs.map(a => ringSvg(a, latestBySub[a.sub] ? +latestBySub[a.sub].sc : 0, goalBySub[a.sub])).join("")
    : `<p class="muted">${target ? "暂无成绩记录，老师录入成绩后这里会亮起来" : "请先选择要查看的学生"}</p>`;
  $("ringBoxMeet").innerHTML = html;
  $("ringBoxGrades").innerHTML = html;
  /* SMART Goal 页也放一份学科圆环（学生看自己） */
  const goalBox = $("ringBoxGoal");
  if (goalBox) {
    const goalAvgs = grAverages(me.name);
    const gLatest = {};
    grRecsOf(me.name).forEach(r => { if (!gLatest[r.sub] || (r.at || 0) > (gLatest[r.sub].at || 0)) gLatest[r.sub] = r; });
    goalBox.innerHTML = goalAvgs.length
      ? goalAvgs.map(a => ringSvg(a, gLatest[a.sub] ? +gLatest[a.sub].sc : 0, goalBySub[a.sub])).join("")
      : `<p class="muted">暂无成绩记录，老师录入成绩后这里会亮起来</p>`;
  }
}
/* ================= SMART Goal（学生专属：模板自动判定 / 自定义自己批准） ================= */
/* retained 主题 APP/goal/<name>：{name, items:[{id, tpl:"allLevel"|"subScore"|"points"|null, text, sub?,lv?,sc?,pt?, done, doneAt, at}]} */
const GOAL_TOPIC = () => `${APP}/goal/${me.name}`;
const goalCache = n => { try { return JSON.parse(localStorage.getItem(APP + "_goal_" + n) || "null"); } catch (e) { return null; } };
const goalSaveCache = () => { try { localStorage.setItem(APP + "_goal_" + me.name, JSON.stringify(goalDoc || { name: me.name, items: [] })); } catch (e) {} };
/* 进入页面先用本地缓存渲染，retained 迟到时不空白 */
if (me.role === "student") goalDoc = goalCache(me.name);
/* 写前探测合并（同 submitPt 约定）：防同账号多设备并发写互相覆盖 */
async function publishGoals(mutator) {
  if (!client || !client.connected) { toast("连接尚未就绪，请稍后再试", "warn"); return false; }
  const fresh = await probeDoc(GOAL_TOPIC()).catch(() => null);
  const base = (fresh && Array.isArray(fresh.items)) ? fresh : (goalDoc && Array.isArray(goalDoc.items)) ? goalDoc : { name: me.name, items: [] };
  const items = JSON.parse(JSON.stringify(base.items || []));
  mutator(items);
  goalDoc = { name: me.name, items };
  goalSaveCache();
  client.publish(GOAL_TOPIC(), JSON.stringify(goalDoc), { retain: true, qos: 1 });
  renderGoals();
  return true;
}
function syncGoals() { goalSaveCache(); renderGoals(); renderRings(); maybeGoalPrompt(); }
/* 模板 goal 自动判定 */
const lvRank = l => LV_ORDER.indexOf(l);
function goalMet(g) {
  if (g.tpl === "allLevel") {
    const bySub = {};
    grRecsOf(me.name).forEach(r => { if (!bySub[r.sub] || (r.at || 0) > (bySub[r.sub].at || 0)) bySub[r.sub] = r; });
    const subs = Object.keys(bySub);
    const t = lvRank(g.lv);
    if (!subs.length || t < 0) return false;
    return subs.every(s => lvRank(bySub[s].lv) >= 0 && lvRank(bySub[s].lv) <= t); // E 最好 → rank 越小越好
  }
  if (g.tpl === "subScore") {
    const recs = grRecsOf(me.name).filter(r => r.sub === g.sub).sort((a, b) => (b.at || 0) - (a.at || 0));
    return recs.length > 0 && (+recs[0].sc) >= (+g.sc);
  }
  if (g.tpl === "points") {
    const it = ptDoc && ptDoc.items && ptDoc.items[me.name];
    return !!(it && (+it.total) >= (+g.pt));
  }
  return false;
}
function evalGoals() {
  if (me.role !== "student" || !goalDoc || !Array.isArray(goalDoc.items) || !client || !client.connected) return;
  let changed = false;
  goalDoc.items.forEach(g => {
    if (g.done || !g.tpl) return;
    if (goalMet(g)) {
      g.done = true; g.doneAt = Date.now(); changed = true;
      toast(`🎉 你的 goal「${esc(g.text)}」已达成，太棒了！`, "ok", 8000);
    }
  });
  if (changed) { goalSaveCache(); client.publish(GOAL_TOPIC(), JSON.stringify(goalDoc), { retain: true, qos: 1 }); }
}
/* 每次进入主页提示一次：「你的 goal「xxx」已完成 x/y，请再接再厉」 */
function maybeGoalPrompt(force) {
  if (goalPromptShown || me.role !== "student") return;
  const items = (goalDoc && Array.isArray(goalDoc.items)) ? goalDoc.items : null;
  if (!items && !force) return; // retained 未到：等 6 秒兜底
  goalPromptShown = true;
  if (!items || !items.length) { toast("🎯 你还没有设置 SMART Goal，去「SMART Goal」页用模板或自定义创建一个吧", "", 7000); return; }
  const done = items.filter(g => g.done).length;
  const next = items.find(g => !g.done) || items[0];
  toast(`🎯 你的 goal「${esc(next.text)}」已完成 ${done}/${items.length}，请再接再厉`, done === items.length ? "ok" : "", 8000);
}
/* ---------- 新建表单 ---------- */
function goalTextOf(tpl) {
  if (tpl === "allLevel") return "本学期全科都达到" + ($("goalLv").value || "M") + "及以上";
  if (tpl === "subScore") return ($("goalSub").value.trim() || "某科") + "期末考试" + ($("goalSc").value.trim() || "…") + "分以上";
  if (tpl === "points") return "学院分累计达到" + ($("goalPt").value.trim() || "…") + "分";
  return $("goalText").value.trim() || "（未填写）";
}
function goalRows() {
  const t = $("goalTpl").value;
  $("goalRowAllLevel").classList.toggle("hidden", t !== "allLevel");
  $("goalRowSubScore").classList.toggle("hidden", t !== "subScore");
  $("goalRowPoints").classList.toggle("hidden", t !== "points");
  $("goalRowCustom").classList.toggle("hidden", t !== "custom");
  $("goalPreview").textContent = "目标预览：" + goalTextOf(t) + (t === "custom" ? "（自定义 goal，仅自己可批准完成）" : "（模板 goal，系统根据成绩 / 学院分自动判定）");
}
$("goalTpl").onchange = goalRows;
["goalLv", "goalSub", "goalSc", "goalPt", "goalText"].forEach(id => $(id).addEventListener("input", goalRows));
$("goalAdd").onclick = () => {
  if (me.role !== "student") return;
  if (!client || !client.connected) { toast("连接尚未就绪，请稍后再试", "warn"); return; }
  const cur = (goalDoc && Array.isArray(goalDoc.items)) ? goalDoc.items : [];
  if (cur.length >= 20) { toast("goal 最多 20 个，请先删除一些再创建", "warn"); return; }
  const tpl = $("goalTpl").value;
  const text = goalTextOf(tpl);
  if (tpl === "custom" && (text.length < 2 || text.length > 100)) { toast("请填写 goal 描述（2-100 字）", "warn"); return; }
  if (tpl === "subScore") {
    const sub = $("goalSub").value.trim(), scRaw = $("goalSc").value.trim();
    if (!sub || sub.length > 10) { toast("请填写科目（1-10 字）", "warn"); return; }
    if (!/^\d{1,3}(\.\d)?$/.test(scRaw) || +scRaw < 1 || +scRaw > 150) { toast("目标分数需为 1-150 的数字", "warn"); return; }
  }
  if (tpl === "points") {
    const pRaw = $("goalPt").value.trim();
    if (!/^\d{1,5}$/.test(pRaw) || +pRaw < 1) { toast("目标学院分需为正整数", "warn"); return; }
  }
  const g = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tpl: tpl === "custom" ? null : tpl, text, done: false, at: Date.now() };
  if (tpl === "allLevel") g.lv = $("goalLv").value;
  if (tpl === "subScore") { g.sub = $("goalSub").value.trim(); g.sc = +$("goalSc").value.trim(); }
  if (tpl === "points") g.pt = +$("goalPt").value.trim();
  publishGoals(items => { items.unshift(g); });
  toast(`🎯 已创建 goal「${esc(text)}」`, "ok");
  if (tpl === "custom") $("goalText").value = "";
};
function delGoal(id) {
  if (!confirm("确定删除该 goal？")) return;
  publishGoals(items => { const i = items.findIndex(x => x.id === id); if (i >= 0) items.splice(i, 1); });
}
/* 自定义 goal：仅自己可批准 / 撤销 */
function toggleGoal(id) {
  publishGoals(items => {
    const g = items.find(x => x.id === id);
    if (!g) return;
    if (g.done) { g.done = false; delete g.doneAt; }
    else { g.done = true; g.doneAt = Date.now(); }
  });
}
/* ---------- 列表渲染 ---------- */
function renderGoals() {
  const tab = $("tabGoal");
  if (!tab || me.role !== "student") return;
  evalGoals();
  goalRows();
  const items = (goalDoc && Array.isArray(goalDoc.items)) ? goalDoc.items : [];
  const done = items.filter(g => g.done).length;
  $("goalSummary").textContent = items.length ? `已完成 ${done}/${items.length}` : "";
  const box = $("goalList");
  box.innerHTML = "";
  if (!items.length) { box.innerHTML = '<p class="muted">还没有 goal，用上方模板或自定义创建第一个吧。</p>'; return; }
  items.forEach(g => {
    const d = document.createElement("div");
    d.className = "pitem";
    const st = g.done ? '<b style="color:var(--ok)">✅ 已完成</b>'
      : `<b style="color:var(--warn)">⏳ 进行中${g.tpl ? "（自动判定）" : ""}</b>`;
    d.innerHTML = `<span class="n">${st} <span>${esc(g.text)}</span></span>` +
      `<span class="muted">${g.tpl ? "模板" : "自定义"} · 创建于 ${fmtTime(g.at)}${g.done && g.doneAt ? " · 完成于 " + fmtTime(g.doneAt) : ""}</span>`;
    if (!g.tpl) {
      const b = document.createElement("button");
      b.className = g.done ? "ghost" : "ok";
      b.textContent = g.done ? "撤销完成" : "批准完成";
      b.onclick = () => toggleGoal(g.id);
      d.appendChild(b);
    }
    const del = document.createElement("button");
    del.className = "danger"; del.textContent = "删除";
    del.onclick = () => delGoal(g.id);
    d.appendChild(del);
    box.appendChild(d);
  });
}
/* ================= 更新日志（系统公告：由开发者发布，所有人可见） ================= */
/* 系统更新日志：由 AI 开发者在代码里直接写入，记录新功能、用法说明等，所有人可见 */
const CHANGELOG = [
  {
    v: "1.3.0", date: "2026-10-12",
    title: "📚 新增 LMS 自学页面 + 📰 更新日志",
    body: "新增「LMS 自学」tab（所有人可见），后续将支持自学计划、学习资源等功能。\n新增「更新日志」tab，系统每次更新都会在这里说明新功能和用法。"
  },
  {
    v: "1.2.0", date: "2026-10-11",
    title: "🎯 SMART Goal 学科圆环",
    body: "SMART Goal 页面新增学科圆环展示，环中心显示当前得分百分比，下方提示还需多少个 E 可抵达 E 等级。金色细环表示该科 subScore goal 的进度。"
  },
  {
    v: "1.1.0", date: "2026-10-05",
    title: "📊 评分标准支持作业类型与权重",
    body: "「调整评分标准」页面新增作业类型管理（项目/期末/期中/classwork/作业），可自定义每类占比。成绩录入时需选择作业类型，圆环和等级按加权计算。"
  }
];
/* 渲染系统更新日志 */
function renderFeed() {
  const box = $("feedBox"); if (!box) return;
  box.innerHTML = CHANGELOG.map(it => {
    return `<div class="card" style="margin-bottom:12px;background:var(--panel2)">` +
      `<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px">` +
      `<h3 style="margin:0">${esc(it.title)}</h3>` +
      `<span class="muted" style="font-size:12px">v${esc(it.v)} · ${esc(it.date)}</span></div>` +
      `<p style="margin:8px 0 0;white-space:pre-wrap;line-height:1.6">${esc(it.body)}</p></div>`;
  }).join("");
}
/* ================= 退出 / 启动 ================= */
$("logoutBtn").onclick = () => {
  if (client) { try { client.publish(`${APP}/u/${me.name}/${me.dev}`, JSON.stringify({ uid: me.uid, dev: me.dev, online: false }), { retain: true }); client.end(true); } catch (e) {} }
  LS.clearSession();
  location.href = "index.html";
};
window.addEventListener("beforeunload", () => {
  try { if (client && me.name) client.publish(`${APP}/u/${me.name}/${me.dev}`, JSON.stringify({ uid: me.uid, dev: me.dev, online: false }), { retain: true }); } catch (e) {}
});
if (me.name && me.uid) { enterMain(); connect(); }



