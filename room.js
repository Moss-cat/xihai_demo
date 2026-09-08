"use strict";
/* ================= 嘻嗨校园 · 会议室（meeting.html 专用，纯房间） ================= */
const sess = LS.session();
if (!sess || !sess.name || !sess.uid) {
  try { sessionStorage.removeItem(APP + "_launch"); } catch (e) {}
  location.replace("index.html");
}
let me = { uid: sess ? sess.uid : "", name: sess ? sess.name : "", dev: LS.devid(), school: sess ? (sess.school || "") : "", role: sess ? (sess.role || "") : "" };
if (me.role === "parent") {
  document.body.innerHTML = `<div style="position:fixed;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;background:var(--bg);color:var(--txt)">
    <b style="font-size:18px">家长账号不能参加视频会议</b><p class="muted">家长可通过主页「家长群」与班主任沟通</p>
    <button class="primary" onclick="location.href='main.html'">回主页</button></div>`;
  throw new Error("parent-no-meet");
}
const PID = () => me.uid + "_" + me.dev;
let client = null;
let friends = LS.f(me.name);
let M = null;
/* 启动信息：{code,title,role:'host'|'guest',from:'main'|'council',pre:[uid...]} */
let LAUNCH = null;
try { LAUNCH = JSON.parse(sessionStorage.getItem(APP + "_launch") || "null"); } catch (e) { LAUNCH = null; }
try { sessionStorage.removeItem(APP + "_launch"); } catch (e) {}
if (!LAUNCH || !LAUNCH.code) {
  document.body.innerHTML = `<div style="position:fixed;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;background:var(--bg);color:var(--txt)">
    <b style="font-size:18px">没有会议启动信息</b><p class="muted">请从主页 / 学生会群进入会议</p>
    <button class="primary" onclick="location.href='main.html'">回主页</button></div>`;
  throw new Error("no-launch");
}
const BACK = LAUNCH.from === "council" ? "student_council.html" : "main.html";
/* 同校消息通道：会议室里也能收到好友邀请/审批消息 */
function connectUser() {
  client.subscribe(`${APP}/msg/${me.name}`);
  client.subscribe(`${APP}/fr/${me.name}/+`);
  friends.forEach(f => client.subscribe(`${APP}/u/${f.name}/+`));
}
function sendUser(targetName, obj) {
  obj.from = me.uid; obj.dev = me.dev; obj.fromName = me.name; obj.toName = targetName;
  client.publish(`${APP}/msg/${targetName}`, JSON.stringify(obj));
}
function sendFriendMsg(targetName, obj) {
  obj.from = me.uid; obj.dev = me.dev; obj.fromName = me.name; obj.toName = targetName;
  client.publish(`${APP}/fr/${targetName}/${me.name}`, JSON.stringify(obj), { retain: true, qos: 1 });
}
function goBack() { location.replace(BACK); }
/* ================= WebRTC 会议核心 ================= */
function getMedia() {
  return new Promise(resolve => {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("⚠️ 当前不是安全环境，浏览器已禁用摄像头/麦克风。请在目录运行 <b>python -m http.server 8000</b> 后访问 http://localhost:8000/meeting.html，或用 Firefox 打开", "warn", 16000);
      return resolve(null);
    }
    const parts = [];
    const grab = k => navigator.mediaDevices.getUserMedia(k).then(s => parts.push(s)).catch(() => {});
    Promise.all([
      grab({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } }),
      grab({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    ]).then(() => {
      if (!parts.length) { toast("⚠️ 无法获取摄像头/麦克风（未授权或设备不可用），只能观看", "warn", 9000); return resolve(null); }
      const merged = new MediaStream();
      parts.forEach(s => s.getTracks().forEach(t => merged.addTrack(t)));
      resolve(merged);
    });
  });
}
function sendMeet(t, extra = {}) {
  if (!M) return;
  client.publish(`${APP}/m/${M.code}`, JSON.stringify(Object.assign({ t, from: me.uid, dev: me.dev, fromName: me.name }, extra)));
}
function addVideoCell(uid, name, isHost) {
  const cell = document.createElement("div");
  cell.className = "vcell";
  cell.id = "cell-" + uid;
  cell.innerHTML = `<video autoplay playsinline></video><span class="tag ${isHost ? "host" : ""}">${esc(name)}${isHost ? "（房主）" : ""}</span><span class="novideo muted"></span>`;
  $("videoGrid").appendChild(cell);
}
function renderCount() {
  if (!M) return;
  $("meetCount").textContent = `（${M.peers.size + 1} 人）`;
}
function peerLabel(pid, name) {
  const puid = pid.split("_")[0];
  return (puid === me.uid && pid !== PID()) ? name + "（我的另一设备）" : name;
}
function ensurePeer(pid, name) {
  if (!M || M.pcs.has(pid)) return;
  M.peers.set(pid, name);
  addVideoCell(pid, peerLabel(pid, name), false);
  const pc = new RTCPeerConnection(ICE);
  if (M.local) M.local.getTracks().forEach(t => pc.addTrack(t, M.local));
  pc.onicecandidate = e => { if (e.candidate) sendMeet("ice", { to: pid, c: e.candidate.toJSON() }); };
  pc.ontrack = e => {
    const v = document.querySelector(`#cell-${pid} video`);
    if (v) { v.srcObject = e.streams[0]; v.muted = false; v.play().catch(() => {}); }
    const nv = document.querySelector(`#cell-${pid} .novideo`);
    if (nv) nv.textContent = "";
  };
  M.pcs.set(pid, pc);
  const q = M.cand.get(pid) || [];
  q.forEach(c => pc.addIceCandidate(c).catch(() => {}));
  M.cand.set(pid, []);
  renderCount();
  if (M.role === "host") renderSidePanel();
}
function removePeer(pid) {
  const pc = M && M.pcs.get(pid);
  if (pc) { try { pc.close(); } catch (e) {} M.pcs.delete(pid); }
  if (M) { M.peers.delete(pid); M.waiting = M.waiting.filter(w => w.uid !== pid); }
  const cell = document.getElementById("cell-" + pid);
  if (cell) cell.remove();
  const ap = document.getElementById("ap-" + pid);
  if (ap) ap.remove();
  renderCount();
  if (M && M.role === "host") renderSidePanel();
}
async function sendOfferTo(pid) {
  const pc = M && M.pcs.get(pid);
  if (!pc) return;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendMeet("offer", { to: pid, sdp: pc.localDescription });
  } catch (e) {}
}
async function startMeeting() {
  M = {
    code: LAUNCH.code, title: LAUNCH.title || "视频会议", role: LAUNCH.role || "guest",
    peers: new Map(), pcs: new Map(), cand: new Map(),
    approved: new Set(LAUNCH.pre || []),
    waiting: [], local: null, mic: true, cam: true, inRoom: false
  };
  $("meetTitle").textContent = M.title;
  $("meetCode").textContent = M.code;
  const isHost = M.role === "host";
  $("meetRole").textContent = isHost ? "你是主持人" : "成员";
  $("endBtn").classList.toggle("hidden", !isHost);
  addVideoCell(PID(), me.name, isHost);
  renderCount();
  client.subscribe(`${APP}/m/${M.code}`);
  const stream = await getMedia();
  if (!M) { if (stream) stream.getTracks().forEach(t => t.stop()); return; }
  if (stream) {
    M.local = stream;
    const v = document.querySelector(`#cell-${PID()} video`);
    if (v) { v.srcObject = stream; v.muted = true; v.play().catch(() => {}); }
    if (!stream.getVideoTracks().length) { const nv = document.querySelector(`#cell-${PID()} .novideo`); if (nv) nv.textContent = "未开启摄像头"; }
  } else {
    toast("无媒体权限，你只能观看和收听", "warn", 8000);
    const nv = document.querySelector(`#cell-${PID()} .novideo`);
    if (nv) nv.textContent = "无媒体权限";
  }
  if (isHost) {
    M.approved.add(PID());
    M.inRoom = true;
    sendMeet("joined");
    if (LAUNCH.auto !== true) toast("会议已开始，会议码 <b>" + M.code + "</b>", "ok", 6000);
  } else if (LAUNCH.force === true) {
    M.approved.add(PID());
    M.inRoom = true;
    sendMeet("joined");
  } else {
    $("waitingOverlay").classList.remove("hidden");
    sendMeet("knock");
  }
}
function showApproveCard(w) {
  if (!M || M.role !== "host") return;
  const box = $("approveBox");
  if (document.getElementById("ap-" + w.uid)) return;
  const card = document.createElement("div");
  card.className = "apcard";
  card.id = "ap-" + w.uid;
  card.innerHTML = `<div class="tt"><b>${esc(w.name)}</b> 申请进入会议</div>`;
  const bar = document.createElement("div");
  bar.className = "btns";
  const ok = document.createElement("button");
  ok.className = "primary"; ok.textContent = "✓ 批准";
  ok.onclick = () => {
    if (!M) return;
    M.approved.add(w.uid);
    M.waiting = M.waiting.filter(x => x.uid !== w.uid);
    sendMeet("accept", { to: w.uid });
    renderSidePanel(); card.remove();
  };
  const no = document.createElement("button");
  no.className = "danger"; no.textContent = "✗ 拒绝";
  no.onclick = () => {
    if (!M) return;
    M.waiting = M.waiting.filter(x => x.uid !== w.uid);
    const r = prompt("拒绝理由（可留空）：") || "";
    sendMeet("deny", { to: w.uid, reason: r });
    renderSidePanel(); card.remove();
  };
  bar.append(ok, no);
  card.appendChild(bar);
  box.appendChild(card);
}
function onMeetMsg(m) {
  if (!m || !M || (m.from === me.uid && m.dev === me.dev)) return;
  const pid = m.from + "_" + (m.dev || "x");
  switch (m.t) {
    case "knock": {
      if (M.role !== "host" || !M.inRoom) return;
      if (M.approved.has(pid) || M.approved.has(m.from)) { sendMeet("accept", { to: pid }); return; }
      if (M.waiting.find(w => w.uid === pid)) return;
      M.waiting.push({ uid: pid, name: m.fromName });
      renderSidePanel();
      showApproveCard({ uid: pid, name: m.fromName });
      break;
    }
    case "accept":
      if (m.to !== PID()) return;
      if (!M.inRoom) { M.inRoom = true; $("waitingOverlay").classList.add("hidden"); sendMeet("joined"); }
      break;
    case "deny":
      if (m.to !== PID()) return;
      toast(`主持人拒绝了你的加入申请<br>理由：${esc(m.reason || "未填写")}`, "warn", 8000);
      leaveRoom(true, true);
      break;
    case "joined":
      if (!M.inRoom) return;
      ensurePeer(pid, m.fromName);
      sendOfferTo(pid);
      toast(`<b>${esc(peerLabel(pid, m.fromName))}</b> 加入了会议`, "ok", 3000);
      break;
    case "left":
      toast(`<b>${esc(m.fromName)}</b> 离开了会议`, "", 3000);
      removePeer(pid);
      break;
    case "kick":
      if (m.to !== PID()) return;
      toast("你已被主持人移出会议", "warn", 6000);
      leaveRoom(true, true);
      break;
    case "ended":
      toast("会议已被主持人结束", "warn", 6000);
      leaveRoom(true, true);
      break;
    case "offer":
      if (m.to !== PID() || !M.inRoom) return;
      ensurePeer(pid, m.fromName);
      (async () => {
        try {
          const pc = M.pcs.get(pid);
          await pc.setRemoteDescription(m.sdp);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          sendMeet("answer", { to: pid, sdp: pc.localDescription });
        } catch (e) {}
      })();
      break;
    case "answer": {
      if (m.to !== PID()) return;
      const pc = M.pcs.get(pid);
      if (pc && pc.signalingState === "have-local-offer") pc.setRemoteDescription(m.sdp).catch(() => {});
      break;
    }
    case "ice": {
      if (m.to !== PID()) return;
      const pc = M.pcs.get(pid);
      if (pc) pc.addIceCandidate(m.c).catch(() => {});
      else { const q = M.cand.get(pid) || []; q.push(m.c); M.cand.set(pid, q); }
      break;
    }
  }
}
function renderSidePanel() {
  if (!M) return;
  const panel = $("sidePanel");
  panel.classList.remove("hidden");
  let html = "<h4>👥 成员</h4>";
  html += `<div class="pitem"><span class="n">${esc(me.name)}（我${M.role === "host" ? "·主持人" : ""}）</span></div>`;
  M.peers.forEach((name, pid) => {
    html += `<div class="pitem"><span class="n">${esc(peerLabel(pid, name))}</span>${M.role === "host" ? `<button data-kick="${esc(pid)}" class="danger">移出</button>` : ""}</div>`;
  });
  if (M.role === "host") {
    html += "<h4 style='margin-top:16px'>🛡 入会申请</h4>";
    if (!M.waiting.length) html += '<p class="muted">暂无待处理申请</p>';
    M.waiting.forEach(w => {
      html += `<div class="pitem"><span class="n">${esc(w.name)}</span>
        <button data-acc="${esc(w.uid)}" class="primary">批准</button>
        <button data-den="${esc(w.uid)}" class="danger">拒绝</button></div>`;
    });
    if (friends.length) {
      html += "<h4 style='margin-top:16px'>🤝 邀请好友</h4>";
      friends.forEach(f => {
        const on = presenceKey(f.name) ? "on" : "";
        html += `<div class="pitem"><span class="dot ${on}"></span><span class="n">${esc(f.name)}</span>
          <button data-inv="${esc(f.name)}">邀请</button>
          <button data-forc="${esc(f.name)}" class="danger">强拉</button></div>`;
      });
    }
  }
  panel.innerHTML = html;
  panel.querySelectorAll("[data-kick]").forEach(b => b.onclick = () => sendMeet("kick", { to: b.dataset.kick }));
  panel.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => {
    const w = M.waiting.find(x => x.uid === b.dataset.acc);
    if (w) { M.approved.add(w.uid); M.waiting = M.waiting.filter(x => x.uid !== w.uid); sendMeet("accept", { to: w.uid }); renderSidePanel(); }
    const ap = document.getElementById("ap-" + b.dataset.acc); if (ap) ap.remove();
  });
  panel.querySelectorAll("[data-den]").forEach(b => b.onclick = () => {
    const w = M.waiting.find(x => x.uid === b.dataset.den);
    if (!w) return;
    M.waiting = M.waiting.filter(x => x.uid !== w.uid);
    const r = prompt("拒绝理由（可留空）：") || "";
    sendMeet("deny", { to: w.uid, reason: r });
    renderSidePanel();
    const ap = document.getElementById("ap-" + b.dataset.den); if (ap) ap.remove();
  });
  panel.querySelectorAll("[data-inv]").forEach(b => b.onclick = () => {
    sendFriendMsg(b.dataset.inv, { t: "invite", code: M.code, title: M.title });
    toast("已邀请 <b>" + esc(b.dataset.inv) + "</b>", "ok", 2500);
  });
  panel.querySelectorAll("[data-forc]").forEach(b => b.onclick = () => {
    sendFriendMsg(b.dataset.forc, { t: "forceinvite", code: M.code, title: M.title });
    toast("已强拉 <b>" + esc(b.dataset.forc) + "</b>", "ok", 2500);
  });
}
/* 房间内处理好友类消息（好友邀请 / 接受通知 / 好友申请） */
function onUserMsg(m) {
  if (!m || (m.from === me.uid && m.dev === me.dev)) return;
  switch (m.t) {
    case "friendreq": {
      if (friends.find(f => f.name === m.fromName)) return;
      actionToast(`<b>${esc(m.fromName)}</b> 请求添加你为好友`, [
        { label: "接受", cls: "primary", fn: () => {
          friends = LS.f(me.name);
          if (!friends.find(f => f.name === m.fromName)) { friends.push({ name: m.fromName, online: false }); LS.sf(me.name, friends); }
          sendFriendMsg(m.fromName, { t: "friendok" });
        } },
        { label: "拒绝", cls: "danger", fn: () => sendFriendMsg(m.fromName, { t: "friendno" }) }
      ]);
      break;
    }
    case "friendok": {
      friends = LS.f(me.name);
      if (!friends.find(f => f.name === m.fromName)) { friends.push({ name: m.fromName, online: false }); LS.sf(me.name, friends); }
      toast("<b>" + esc(m.fromName) + "</b> 接受了你的好友申请", "ok");
      break;
    }
    case "invite": {
      actionToast(`<b>${esc(m.fromName)}</b> 邀请您加入会议<br><span class="muted">${esc(m.title || "")} · 会议码 ${esc(m.code)}</span>`, [
        { label: "进入会议", cls: "primary", fn: () => { LAUNCH = { code: m.code, title: m.title, role: "guest", from: "main", force: true }; location.reload(); } },
        { label: "拒绝", cls: "danger", fn: () => sendUser(m.fromName, { t: "invite-reply", code: m.code, reason: "不方便" }) }
      ], true);
      break;
    }
    case "forceinvite":
      toast(`<b>${esc(m.fromName)}</b> 将你拉入会议 <b>${esc(m.title || "")}</b>`, "ok", 4000);
      LAUNCH = { code: m.code, title: m.title, role: "guest", from: "main", force: true };
      location.reload();
      break;
    case "invite-reply":
      toast(`<b>${esc(m.fromName)}</b> 拒绝了你的邀请<br>理由：${esc(m.reason || "无")}`, "warn", 6000);
      break;
  }
}
function onFriendMsg(topic, m) {
  const parts = topic.split("/");
  if (parts.length !== 4 || parts[2] !== me.name || !m || !m.t) return;
  try { client.publish(topic, "", { retain: true, qos: 1 }); } catch (e) {}
  if (m.from === me.uid && m.dev === me.dev) return;
  m.fromName = parts[3];
  onUserMsg(m);
}
function leaveRoom(silent, kicked) {
  if (!M) return;
  if (!silent && !kicked) sendMeet("left");
  client.unsubscribe(`${APP}/m/${M.code}`);
  M.pcs.forEach(pc => { try { pc.close(); } catch (e) {} });
  if (M.local) M.local.getTracks().forEach(t => t.stop());
  M = null;
  $("videoGrid").innerHTML = "";
  $("waitingOverlay").classList.add("hidden");
  $("sidePanel").classList.add("hidden");
  $("approveBox").innerHTML = "";
  goBack();
}
/* ---- 控件 ---- */
$("sideBtn").onclick = () => renderSidePanel();
$("micBtn").onclick = () => {
  if (!M || !M.local) return;
  if (!M.local.getAudioTracks().length) { toast("本次未获取到麦克风", "warn", 4000); return; }
  M.mic = !M.mic;
  M.local.getAudioTracks().forEach(t => t.enabled = M.mic);
  $("micBtn").textContent = M.mic ? "🎤 麦克风：开" : "🔇 麦克风：关";
};
$("camBtn").onclick = () => {
  if (!M || !M.local) return;
  if (!M.local.getVideoTracks().length) { toast("本次未获取到摄像头", "warn", 4000); return; }
  M.cam = !M.cam;
  M.local.getVideoTracks().forEach(t => t.enabled = M.cam);
  $("camBtn").textContent = M.cam ? "📷 摄像头：开" : "🚫 摄像头：关";
};
$("backHome").onclick = () => { if (M) { client.unsubscribe(`${APP}/m/${M.code}`); M.pcs.forEach(pc => { try { pc.close(); } catch (e) {} }); if (M.local) M.local.getTracks().forEach(t => t.stop()); M = null; } goBack(); };
$("cancelWait").onclick = () => { if (M) { client.unsubscribe(`${APP}/m/${M.code}`); M = null; } $("waitingOverlay").classList.add("hidden"); goBack(); };
$("leaveBtn").onclick = () => {
  if (M && M.role === "host") sendMeet("ended");
  leaveRoom(false);
};
$("endBtn").onclick = () => { sendMeet("ended"); leaveRoom(true); };
window.addEventListener("beforeunload", () => {
  try { if (M) sendMeet("left"); } catch (e) {}
});
/* ---- 启动 ---- */
client = mqtt.connect(BROKER, {
  clientId: APP + "_room_" + me.uid + "_" + me.dev + "_" + Math.random().toString(36).slice(2, 6),
  keepalive: 30, clean: true, connectTimeout: 8000,
  will: { topic: `${APP}/u/${me.name}/${me.dev}`, payload: JSON.stringify({ uid: me.uid, dev: me.dev, online: false }), retain: true, qos: 0 }
});
client.on("connect", () => {
  $("connState").textContent = "已连接";
  client.subscribe(`${APP}/u/${me.name}/${me.dev}`);
  client.publish(`${APP}/u/${me.name}/${me.dev}`, JSON.stringify({ uid: me.uid, dev: me.dev, online: true }), { retain: true });
  connectUser();
  startMeeting();
});
client.on("message", (topic, payload) => {
  let m; try { m = JSON.parse(payload.toString()); } catch (e) { return; }
  if (topic.startsWith(APP + "/fr/")) return onFriendMsg(topic, m);
  if (topic.startsWith(APP + "/u/")) {
    const parts = topic.split("/");
    if (parts.length >= 3) presenceKey(parts[2], parts[3] || "", m ? m.online : false);
    return;
  }
  if (topic.startsWith(APP + "/msg/")) return onUserMsg(m);
  if (topic.startsWith(APP + "/m/")) return onMeetMsg(m);
});
client.on("reconnect", () => { if ($("connState")) $("connState").textContent = "重连中…"; });
client.on("error", () => { if ($("connState")) $("connState").textContent = "连接异常…"; });
client.on("offline", () => { if ($("connState")) $("connState").textContent = "离线"; });
applyTheme();
