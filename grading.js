"use strict";
/* ================= 评分标准设置页（grading.html） ================= */
/* 全校共享 retained 主题 APP/std/<校>：{school, full, mode:"pct"|"abs", E, M, D, by, at} */
bindLang({});
const sess = LS.session();
if (!sess || !sess.name || !sess.uid) {
  $("gateOverlay").classList.remove("hidden");
  location.replace("index.html");
}
const me = { uid: sess ? sess.uid : "", name: sess ? sess.name : "", dev: LS.devid(), school: sess ? (sess.school || "") : "", role: sess ? (sess.role || "") : "" };
let client = null;
let stdDoc = stdNorm(null);      // 云端当前标准
let loadedAt = 0;                // 本页载入时云端标准的 at（用于保存前判断是否被他人改过）
let schoolRec = null;            // 学校记录（判定管理员）
let meAuth = {};                 // 自己的 auth retained 记录（权威角色来源，同 main.js syncAuth）
/* 权限：教师 / 管理员可修改。初始按 session 里的 me.role 给定；
   auth retained 抵达后用权威角色覆盖，避免 session 角色过时时教师被误锁。 */
let canEdit = me.role === "teacher" || me.role === "admin";
/* 顶栏权限检测状态：显示当前识别到的身份 + 是否可编辑，便于排查"调不了" */
function updatePermState() {
  const el = $("permState");
  if (!el) return;
  const roleTxt = ROLE_LABEL[me.role] || me.role || "未知";
  if (canEdit) {
    el.textContent = "✅ " + roleTxt + " · 可编辑";
    el.style.color = "var(--ok)";
  } else {
    el.textContent = "🔒 " + roleTxt + " · 只读";
    el.style.color = "var(--sub)";
  }
  el.title = "session.role=" + (me.role || "(空)") + " | auth.role=" + (meAuth.role || "(未取到)") + " | canEdit=" + canEdit;
  console.log("[perm] role=", me.role, "auth.role=", meAuth.role, "canEdit=", canEdit);
}
/* 当前编辑中的作业类型列表（{key,label,pct}）；从 stdDoc.types 初始化，编辑时本地变更，保存时写入云端 */
let editingTypes = STD_DEFAULT_TYPES().map(t => Object.assign({}, t));

/* ================= 主题 / 语言 ================= */
applyTheme();
$("themeSel").value = LS.theme();
$("themeSel").onchange = e => { LS.setTheme(e.target.value); applyTheme(); };
$("langSel").value = LS.lang();
$("langSel").onchange = e => { LS.setLang(e.target.value); LANG = LS.lang(); applyLang(); };
applyLang();
$("backBtn").onclick = () => { location.href = "main.html"; };
$("gateBack").onclick = () => { location.href = "main.html"; };
$("whoLabel").textContent = me.name + (me.school ? " · " + me.school : "");

/* ================= 表单读取 / 校验 ================= */
function fullValue() {
  const sel = $("fullSel").value;
  if (sel !== "custom") return +sel;
  const v = +String($("fullCustom").value || "").trim();
  return (isFinite(v) && v >= 1 && v <= 1000) ? Math.round(v) : NaN;
}
function capOf() { return $("modeSel").value === "pct" ? 100 : (fullValue() || 100); }
const numOf = id => { const v = String($(id).value || "").trim(); return (v !== "" && isFinite(+v)) ? +v : NaN; };
/* 表单当前值 → 标准对象（不做排序兜底，交给 stdNorm）；types 取编辑中的本地列表 */
function formStd() {
  return stdNorm({
    school: me.school, full: fullValue() || 100, mode: $("modeSel").value,
    E: numOf("thE"), M: numOf("thM"), D: numOf("thD"),
    types: editingTypes, by: me.name, at: Date.now()
  });
}
/* ================= 作业类型编辑（typesCard） ================= */
/* 从 #typesList 内的输入框同步到 editingTypes */
function syncTypesFromForm() {
  const rows = Array.from($("typesList").children);
  editingTypes = rows.map(r => {
    const label = String(r.querySelector("[data-f='label']").value || "").trim();
    const pct = +String(r.querySelector("[data-f='pct']").value || "").trim();
    const key = r.dataset.key || label;
    return { key, label, pct: isFinite(pct) ? pct : 0 };
  }).filter(t => t.key || t.label);
  editingTypes = stdTypesNorm(editingTypes);
}
/* 渲染作业类型列表行 */
function renderTypes() {
  const box = $("typesList");
  if (!box) return;
  const arr = editingTypes.length ? editingTypes : STD_DEFAULT_TYPES();
  box.innerHTML = "";
  arr.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "pt-row";
    row.dataset.key = t.key;
    row.innerHTML =
      `<input data-f="label" placeholder="类型名（如 classwork）" maxlength="16" style="flex:1;min-width:120px" value="${escAttr(t.label)}">` +
      `<input data-f="pct" placeholder="权重%" inputmode="decimal" maxlength="6" style="flex:none;width:120px" value="${fmtNum(t.pct)}">` +
      `<span class="muted" style="flex:none">%</span>` +
      `<button class="danger" style="flex:none" data-act="del">删除</button>`;
    const labelInp = row.querySelector("[data-f='label']");
    const pctInp = row.querySelector("[data-f='pct']");
    labelInp.addEventListener("input", () => { syncTypesFromForm(); renderTypesTotal(); });
    pctInp.addEventListener("input", () => { syncTypesFromForm(); renderTypesTotal(); });
    row.querySelector("[data-act='del']").onclick = () => {
      if (!canEdit) return;
      syncTypesFromForm();
      editingTypes.splice(i, 1);
      renderTypes(); renderTypesTotal();
    };
    if (!canEdit) { labelInp.disabled = true; pctInp.disabled = true; row.querySelector("[data-act='del']").disabled = true; }
    box.appendChild(row);
  });
  renderTypesTotal();
}
/* 总和显示 + 颜色提示 */
function renderTypesTotal() {
  const el = $("typesTotal"); if (!el) return;
  const total = Math.round(editingTypes.reduce((a, t) => a + (+t.pct || 0), 0) * 10) / 10;
  const ok = Math.abs(total - 100) < 0.05;
  el.innerHTML = `权重总和：<b style="color:${ok ? "var(--ok)" : "var(--warn)"}">${fmtNum(total)}%</b>` +
    (ok ? " ✅（合计 100%）" : ` ⚠️ 建议合计 100%（当前${total > 100 ? "超出" : "缺"} ${fmtNum(Math.abs(total - 100))}%）`);
}
/* 转义属性值 */
const escAttr = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* 添加新作业类型 */
function addType() {
  const labelInp = $("typeNewLabel"), pctInp = $("typeNewPct");
  let label = String(labelInp.value || "").trim();
  let pct = +String(pctInp.value || "").trim();
  if (!label) { toast("请填写类型名", "warn"); labelInp.focus(); return; }
  if (!isFinite(pct) || pct < 0 || pct > 100) { toast("权重需为 0-100 的数字", "warn"); pctInp.focus(); return; }
  if (editingTypes.some(t => t.key === label || t.label === label)) {
    toast("已存在相同名称的类型", "warn"); return;
  }
  editingTypes.push({ key: label, label, pct: Math.round(pct * 10) / 10 });
  labelInp.value = ""; pctInp.value = "";
  renderTypes(); renderTypesTotal();
}
/* ================= 渲染：标尺 / 表格 / 试算 ================= */
function renderStdView(s) {
  const st = stdNorm(s);
  const cuts = { D: stdCut(st, "D"), M: stdCut(st, "M"), E: stdCut(st, "E") };
  const full = st.full;
  const segs = [
    { lv: "B", a: 0, b: cuts.D },
    { lv: "D", a: cuts.D, b: cuts.M },
    { lv: "M", a: cuts.M, b: cuts.E },
    { lv: "E", a: cuts.E, b: full }
  ];
  $("stdBar").innerHTML = segs.map(g => {
    const w = Math.max(0, (g.b - g.a) / full * 100);
    const label = g.lv + (w > 9 ? ` ${fmtNum(g.a)}~${fmtNum(g.b)}` : (w > 3 ? g.lv : ""));
    return `<div class="seg" style="width:${w}%;background:${STD_LV_COLOR[g.lv]}" title="${g.lv}：${fmtNum(g.a)} ~ ${fmtNum(g.b)} 分">${w > 3 ? label : ""}</div>`;
  }).join("");
  $("stdTicks").innerHTML = [0, cuts.D, cuts.M, cuts.E, full]
    .map((v, i) => `<span class="mchip" style="border-radius:6px">${i === 4 ? "满分 " : ""}${fmtNum(v)}</span>`).join("");
  const pct = v => st.mode === "pct" ? `${fmtNum(v)}%` : "—";
  $("stdTable").innerHTML =
    `<tr><th>等级</th><th>阈值</th><th>分数线（满分 ${full}）</th><th>含义</th></tr>` +
    STD_LV.map(lv => {
      const thr = lv === "B" ? `＜ ${fmtNum(st.D)}${st.mode === "pct" ? "%" : " 分"}` : `≥ ${fmtNum(st[lv])}${st.mode === "pct" ? "%" : " 分"}`;
      const cut = lv === "B" ? `＜ ${fmtNum(cuts.D)} 分` : `≥ ${fmtNum(stdCut(st, lv))} 分`;
      const mean = { E: "最好（优秀）", M: "第二（良好）", D: "第三（及格）", B: "最差（待提高）" }[lv];
      return `<tr><td><b style="color:${STD_LV_COLOR[lv]}">${lv}</b></td><td>${thr}</td><td>${cut}</td><td>${mean}</td></tr>`;
    }).join("");
  $("stdHint").textContent = stdText(st);
  $("stdOwner").textContent = st.by ? `（最后由 ${st.by} 于 ${fmtTime(st.at)} 设定）` : "（当前为系统默认标准）";
  renderSamples(st);
  renderTry(st);
}
const fmtNum = v => String(Math.round((+v || 0) * 10) / 10);
function renderSamples(st) {
  const cs = [stdCut(st, "D"), stdCut(st, "M"), stdCut(st, "E")];
  const set = [];
  const push = v => { const x = Math.round(Math.min(st.full, Math.max(0, v)) * 10) / 10; if (!set.includes(x)) set.push(x); };
  push(cs[0] - 1); push(cs[0]); push((cs[0] + cs[1]) / 2); push(cs[1]); push((cs[1] + cs[2]) / 2); push(cs[2]); push(st.full);
  $("sampleBox").innerHTML = set.map(v => {
    const lv = stdLevel(st, v);
    return `<span class="mchip"><span style="width:10px;height:10px;border-radius:3px;background:${STD_LV_COLOR[lv]};display:inline-block;flex:none"></span>${fmtNum(v)} 分 → <b style="color:${STD_LV_COLOR[lv]}">${lv}</b></span>`;
  }).join("");
}
function renderTry(st) {
  const raw = String($("tryScore").value || "").trim();
  const out = $("tryOut");
  if (raw === "" || !isFinite(+raw)) { out.innerHTML = '<span class="muted">输入分数后显示等级</span>'; return; }
  const v = +raw, lv = stdLevel(st, v);
  out.innerHTML = `<span class="lvbadge" style="background:${STD_LV_COLOR[lv]}">${lv}</span>` +
    `<span class="muted">${fmtNum(v)} / ${st.full} · ${Math.round(v / st.full * 1000) / 10}%</span>`;
}
/* ================= 表单联动 ================= */
function syncUnit() {
  const pct = $("modeSel").value === "pct";
  $("unitTip").textContent = pct ? "（填百分数，如 98 表示 98%）" : "（填分数，如 98 表示 98 分）";
  $("fullCustom").classList.toggle("hidden", $("fullSel").value !== "custom");
  ["thE", "thM", "thD"].forEach(id => {
    const el = $(id);
    el.style.width = "120px"; el.style.flex = "none";
    el.placeholder = pct ? "百分比" : "分数";
  });
}
function fillForm(s) {
  const st = stdNorm(s);
  const preset = STD_FULL_PRESETS.includes(st.full) ? String(st.full) : "custom";
  $("fullSel").value = preset;
  $("fullCustom").value = preset === "custom" ? String(st.full) : "";
  $("modeSel").value = st.mode;
  $("thE").value = fmtNum(st.E); $("thM").value = fmtNum(st.M); $("thD").value = fmtNum(st.D);
  /* 作业类型：从云端标准同步到本地编辑列表（深拷贝，避免后续编辑污染 stdDoc） */
  editingTypes = (st.types && st.types.length ? st.types : STD_DEFAULT_TYPES()).map(t => Object.assign({}, t));
  syncUnit();
  renderTypes();
}
/* 切换阈值方式时把现有数值换算过去，保持语义连续 */
$("modeSel").onchange = () => {
  const toAbs = $("modeSel").value === "abs";
  const full = fullValue() || 100;
  ["thE", "thM", "thD"].forEach(id => {
    const el = $(id), v = numOf(id);
    if (!isFinite(v)) return;
    el.value = fmtNum(toAbs ? Math.round(v / 100 * full * 10) / 10 : Math.min(100, Math.round(v / full * 1000) / 10));
  });
  syncUnit();
  renderStdView(formStd());
};
$("fullSel").onchange = () => { syncUnit(); renderStdView(formStd()); };
$("fullCustom").oninput = () => renderStdView(formStd());
["thE", "thM", "thD"].forEach(id => $(id).addEventListener("input", () => renderStdView(formStd())));
$("tryScore").addEventListener("input", () => renderTry(formStd()));
$("resetBtn").onclick = () => {
  fillForm(Object.assign({}, STD_DEFAULT, { full: fullValue() || 100, mode: $("modeSel").value, types: STD_DEFAULT_TYPES() }));
  renderStdView(formStd());
  toast("已填入默认标准（98 / 70 / 60 + 默认作业类型），别忘了保存", "", 4000);
};
/* 添加作业类型按钮：仅教师 / 管理员可操作 */
$("typeAddBtn").onclick = () => { if (!canEdit) { toast("只有教师和管理员可以修改", "warn", 4000); return; } addType(); };
/* ================= 保存（写前探测，避免覆盖他人刚改的标准） ================= */
function probeStd() {
  return new Promise(resolve => {
    const topic = `${APP}/std/${me.school}`;
    let rec = null;
    const probe = (t, p) => { if (t === topic) { try { const r = JSON.parse(p.toString()); if (r) rec = r; } catch (e) {} } };
    client.subscribe(topic);
    client.on("message", probe);
    setTimeout(() => { try { client.unsubscribe(topic); client.removeListener("message", probe); } catch (e) {} resolve(rec); }, 900);
  });
}
function doSave() {
  if (!canEdit) { toast("只有教师和管理员可以修改评分标准", "warn", 5000); return; }
  syncTypesFromForm(); // 保存前把 #typesList 内未失焦的输入也同步进来
  const full = fullValue();
  if (!isFinite(full) || full < 1 || full > 1000) { toast("满分需为 1-1000 的整数", "warn", 5000); return; }
  const cap = capOf();
  const vals = { E: numOf("thE"), M: numOf("thM"), D: numOf("thD") };
  for (const k of ["E", "M", "D"]) {
    if (!isFinite(vals[k])) { toast(`请填写 ${k} 的阈值`, "warn", 4000); return; }
    if (vals[k] < 0 || vals[k] > cap) { toast(`阈值需在 0 ~ ${cap} 范围内（${k} 级）`, "warn", 5000); return; }
  }
  /* 作业类型校验：至少 1 个；权重总和若不等于 100% 给警告但仍允许保存（教师可有意为之） */
  if (!editingTypes.length) { toast("请至少保留 1 个作业类型", "warn", 4000); return; }
  const total = Math.round(editingTypes.reduce((a, t) => a + (+t.pct || 0), 0) * 10) / 10;
  const totalNot100 = Math.abs(total - 100) >= 0.05;
  const st = stdNorm({ school: me.school, full, mode: $("modeSel").value, E: vals.E, M: vals.M, D: vals.D, types: editingTypes, by: me.name, at: Date.now() });
  const doPublish = () => {
    probeStd().then(remote => {
      const r = stdNorm(remote);
      const publish = () => {
        client.publish(`${APP}/std/${me.school}`, JSON.stringify({
          school: me.school, full: st.full, mode: st.mode, E: st.E, M: st.M, D: st.D,
          types: st.types.map(t => ({ key: t.key, label: t.label, pct: t.pct })),
          by: me.name, at: Date.now()
        }), { retain: true, qos: 1 });
        stdDoc = st; loadedAt = Date.now();
        editingTypes = st.types.map(t => Object.assign({}, t));
        renderStdView(st); renderTypes();
        toast(`已保存：${stdText(st)}` + (st.types.length ? ` · ${st.types.length} 个作业类型` : ""), "ok", 6000);
      };
      if (r.at && r.at > loadedAt && r.by && r.by !== me.name) {
        actionToast(`云端标准刚刚被 <b>${r.by}</b> 修改过（${fmtTime(r.at)}），仍要覆盖吗？`, [
          { label: "覆盖保存", cls: "primary", fn: publish },
          { label: "取消", fn: () => {} }
        ]);
        return;
      }
      publish();
    });
  };
  if (totalNot100) {
    actionToast(`作业类型权重总和为 ${total}%，不等于 100%。仍要保存吗？`, [
      { label: "仍要保存", cls: "primary", fn: doPublish },
      { label: "返回调整", fn: () => {} }
    ]);
    return;
  }
  doPublish();
}
$("saveBtn").onclick = doSave;
/* ================= MQTT ================= */
function connect() {
  if (typeof mqtt === "undefined") {
    $("connState").textContent = "通信库加载失败";
    toast("MQTT 通信库加载失败（网络受限？），请刷新页面重试", "warn", 12000);
    return;
  }
  client = mqtt.connect(BROKER, {
    clientId: APP + "_std_" + me.uid + "_" + me.dev + "_" + Math.random().toString(36).slice(2, 6),
    keepalive: 30, clean: true, connectTimeout: 8000
  });
  client.on("connect", () => {
    $("connState").textContent = "已连接";
    /* 订阅自己的 auth 主题，取权威角色（同 main.js syncAuth），避免 session 角色过时 */
    client.subscribe(`${APP}/auth/${me.name}`);
    if (me.school) {
      client.subscribe(`${APP}/std/${me.school}`);
      client.subscribe(`${APP}/school/${me.school}`);
    }
    setTimeout(() => {
      client.subscribe(`${APP}/auth/${me.name}`); // auth retained 兜底
      if (me.school) client.subscribe(`${APP}/std/${me.school}`);
    }, 4000);
  });
  client.on("reconnect", () => { $("connState").textContent = "重连中…"; });
  client.on("offline", () => { $("connState").textContent = "离线"; });
  client.on("error", () => { $("connState").textContent = "连接异常，重试中…"; });
  client.on("message", (topic, payload) => {
    let m; try { m = JSON.parse(payload.toString()); } catch (e) { m = null; }
    if (topic === `${APP}/auth/${me.name}`) { onAuth(m); return; }
    if (topic.startsWith(APP + "/school/")) { onSchool(m); return; }
    if (topic === `${APP}/std/${me.school}`) { onStd(m); return; }
  });
}
/* auth retained 抵达：用权威角色覆盖 me.role，重新判定 canEdit（同 main.js syncAuth 的核心逻辑） */
function onAuth(m) {
  meAuth = (m && m.ph) ? m : {};
  if (meAuth.role) me.role = meAuth.role;
  if (meAuth.school) me.school = meAuth.school;
  recomputeCanEdit();
}
/* 综合 session 角色 / auth 角色 / 学校 admins 名单判定 canEdit */
function recomputeCanEdit() {
  const admins = (schoolRec && Array.isArray(schoolRec.admins) && schoolRec.admins.length) ? schoolRec.admins
    : (schoolRec && schoolRec.admin) ? [schoolRec.admin] : (schoolRec && schoolRec.creator) ? [schoolRec.creator] : [];
  canEdit = me.role === "teacher" || me.role === "admin" || admins.includes(me.name);
  applyEditPerm();
  updatePermState();
}
function onSchool(m) {
  if (m && m.name) schoolRec = m; else schoolRec = null;
  recomputeCanEdit();
}
/* 权限：非教师/管理员只能查看（同时锁定 editCard 与 typesCard 里的所有输入/按钮） */
function applyEditPerm() {
  $("editCard").classList.toggle("hidden", false);
  const tc = $("typesCard"); if (tc) tc.classList.toggle("hidden", false);
  [$("editCard"), $("typesCard")].forEach(box => {
    if (!box) return;
    box.querySelectorAll("input,select,button").forEach(el => { if (el.id !== "tryScore") el.disabled = !canEdit; });
  });
  /* typesCard 内的添加行输入也要按权限锁定 */
  ["typeNewLabel", "typeNewPct", "typeAddBtn"].forEach(id => { const el = $(id); if (el) el.disabled = !canEdit; });
  /* 重渲染类型行以应用 disabled 状态 */
  renderTypes();
  let tip = $("permTip");
  if (!canEdit) {
    if (!tip) {
      tip = document.createElement("p");
      tip.id = "permTip";
      tip.className = "muted";
      $("editCard").appendChild(tip);
    }
    tip.textContent = "你是学生 / 家长身份，只能查看标准；需要调整请联系老师或管理员。";
  } else if (tip) tip.remove();
}
function onStd(m) {
  stdDoc = stdNorm(m);
  loadedAt = stdDoc.at || 0;
  fillForm(stdDoc);
  renderStdView(stdDoc);
}
/* ================= 启动 ================= */
$("scr-std").classList.remove("hidden");
fillForm(STD_DEFAULT);
renderStdView(STD_DEFAULT);
applyEditPerm();
updatePermState();   // 显示初始身份检测结果
connect();
