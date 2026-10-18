"use strict";
/* ================= i18n.js — 全站自动翻译层（zh → en） =================
 * 原理：英文模式下拦截 innerHTML / textContent / placeholder / title 赋值，
 * 用 词典做「最长片段优先」替换；静态 DOM 在加载后扫描一遍；
 * 原生 alert/confirm/prompt 同样走翻译。切换语言 = 保存 + 整页刷新。
 * 中文模式零开销（不安装任何补丁，直接 return）。
 */
(function () {
  /* ---- 语言切换（任何模式下都要安装：zh→en 也要能触发刷新） ---- */
  function curLang() { try { return localStorage.getItem("vcmeet2026_lang") || "zh"; } catch (err) { return "zh"; } }
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.id === "langSel") {
      try { localStorage.setItem("vcmeet2026_lang", t.value); } catch (err) {}
      setTimeout(function () { location.reload(); }, 30);
    }
  });
  /* 加载后同步所有语言下拉框的当前值 */
  function syncSel() {
    try {
      document.querySelectorAll("#langSel").forEach(function (el) { el.value = curLang(); });
    } catch (err) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncSel);
  else syncSel();

  if (curLang() !== "en") return; // 中文模式：零开销

  /* ================= 词典（中文 → 英文） ================= */
  var EN_MAP = {
    /* ---- 品牌 / 顶栏 ---- */
    "嘻嗨校园": "XiHai Campus",
    "🏫 嘻嗨校园": "🏫 XiHai Campus",
    "登录 · 嘻嗨校园": "Login · XiHai Campus",
    "会议室 · 嘻嗨校园": "Meeting Room · XiHai Campus",
    "学生会群 · 嘻嗨校园": "Student Council · XiHai Campus",
    "西嗨校园，让学校更简单！": "XiHai Campus — making school simpler!",
    "进入校园": "Enter Campus",
    "切换账号": "Switch Account",
    "群组": "Groups",
    "我的班级群": "My Class Group",
    "学生会群": "Student Council",
    "学生自治 · 成员直接发起会议": "Student-run · members start meetings directly",
    "好友": "Friends",
    "语言": "Language",
    "主题": "Theme",
    "🌓 跟随时间": "🌓 Auto",
    "🌙 深色": "🌙 Dark",
    "☀ 浅色": "☀ Light",
    "深色": "Dark",
    "浅色": "Light",

    /* ---- 导航 / tab ---- */
    "🎥 视频通话": "🎥 Video Call",
    "🏫 班级群": "🏫 Class Group",
    "📢 班级广播": "📢 Class Broadcast",
    "👪 家长群": "👪 Parents Group",
    "📨 家长消息": "📨 Parent Messages",
    "⭐ 学院分": "⭐ Points",
    "📈 成绩": "📈 Grades",
    "📅 课表": "📅 Timetable",
    "👥 学生管理": "👥 Students",
    "🏫 学校管理 ·": "🏫 School Admin ·",
    "学校管理": "School Admin",

    /* ---- 连接状态 ---- */
    "通信库加载失败，请刷新重试": "Comm library failed to load — refresh and retry",
    "MQTT 通信库加载失败（网络受限？），请刷新页面重试": "MQTT library failed to load (network blocked?) — refresh the page and retry",
    "通信组件未加载，请刷新页面重试": "Comm library not loaded — refresh and retry",
    "通信组件未加载（右上角一直是「连接中…」？请刷新页面）": "Comm library not loaded (stuck on \"Connecting…\"? Refresh the page)",
    "已连接": "Connected",
    "重连中…": "Reconnecting…",
    "离线": "Offline",
    "连接中…": "Connecting…",
    "连接异常…": "Connection error…",
    "连接异常，重试中…": "Connection error, retrying…",
    "连接尚未就绪，消息将在连接恢复后自动送达": "Connection not ready — the message will be delivered once reconnected",
    "加载中，请稍候…": "Loading, please wait…",

    /* ---- 角色 ---- */
    "家长": "Parent",
    "教师": "Teacher",
    "老师": "Teacher",
    "学生": "Student",
    "管理员": "Admin",
    "班主任": "Head Teacher",
    "🏅班主任": "🏅Head Teacher",
    "非班主任": "Not head teacher",
    "（我）": " (me)",
    "我": "Me",
    "发起了班级会议": "started a class meeting",
    "发起了学生会会议": "started a Student Council meeting",
    "邀请加入会议": "invited you to a meeting",
    " · 码 ": " · Code ",
    "以管理员身份主持": "Host as Admin",
    " · 主题：": " · Topic: ",
    "发来了班级广播": "sent a class broadcast",
    " · 班级广播": " · Class Broadcast",
    "（房主）": " (host)",
    "（我的另一设备）": " (my other device)",
    "同学": "classmate",
    "孩子": "child",
    "成员": "Members",
    " · 管理员": " · Admin",
    " · 学生会成员": " · Student council member",
    " · ⭐管理员": " · ⭐ Admin",

    /* ---- 会议 ---- */
    "🔑 加入会议": "🔑 Join Meeting",
    "会议码": "Meeting code",
    "会议码（6 位数字）": "Meeting code (6 digits)",
    "会议标题（可选）": "Meeting title (optional)",
    "会议标题": "Meeting title",
    "会议码 <b>": "Meeting code <b>",
    "进入会议": "Enter Meeting",
    "进入会议（主持）": "Enter Meeting (Host)",
    "结束会议": "End Meeting",
    "视频会议": "Video Meeting",
    "班级会议": "Class Meeting",
    "学生会会议": "Student Council Meeting",
    "快速会议": "Quick meeting",
    "定时会议": "Scheduled meeting",
    "会议室": "Meeting Room",
    "你是主持人": "You are the host",
    "（你是主持人）": "(You are the host)",
    "·主持人": "· Host",
    "接管主持": "Take Over as Host",
    "你要以管理员身份接管主持这个会议吗？": "Take over hosting this meeting as admin?",
    "以管理员身份接管主持这个会议？": "Take over hosting this meeting as admin?",
    "只有主持人或管理员可以结束会议": "Only the host or an admin can end the meeting",
    "会议已结束：": "Meeting ended: ",
    "会议已结束，并已通知群里": "Meeting ended — the group was notified",
    "你已被主持人移出会议": "You were removed from the meeting by the host",
    "会议已被主持人结束": "The meeting was ended by the host",
    "家长账号不能参加视频会议": "Parent accounts can't join video meetings",
    "没有会议启动信息": "No meeting launch info",
    "请从主页 / 学生会群进入会议": "Enter a meeting from the home page or the student council",
    "回主页": "Back to Home",
    "请先登录": "Not logged in",
    "正在跳转到登录页…": "Redirecting to login…",
    "等待主持人批准…": "Waiting for host approval…",
    "正在向主持人申请进入会议": "Requesting to join from the host…",
    "申请加入": "Request to join",
    "点击申请加入": "Click to request joining",
    "🛡 入会申请": "🛡 Join Requests",
    "暂无待处理申请": "No pending requests",
    "🤝 邀请好友": "🤝 Invite Friends",
    "邀请好友": "Invite friends",
    "已邀请": "Invited",
    "强拉": "Force add",
    "已强拉": "Force-added",
    "现在开启": "Start now",
    "现在加入": "Join now",
    "移出": "Remove",
    "🚪 离开": "🚪 Leave",
    "⛔ 结束会议": "⛔ End Meeting",
    "返回": "Back",
    "返回主页": "Back to Home",
    "← 主页": "← Home",
    "凭会议码加入需主持人批准；被好友邀请进入则无需批准。": "Joining with a code needs host approval; joining via a friend's invite needs none.",
    "立即创建并进入": "Create & enter now",
    "进入后可邀请 / 强拉好友；好友申请进入需你批准。": "After entering you can invite / force-add friends; friend join requests need your approval.",
    "⏰ 定时创建（一周内）": "⏰ Schedule (within a week)",
    "预 定": "Reserve",
    "好友需提前预定（RSVP）；到点自动开启，已预定者打开本页面即自动入会；超 30 分钟未入会记为缺席。": "Friends must reserve (RSVP) in advance; the meeting auto-starts on time and reserved friends auto-join when they open this page; being 30+ min late counts as a no-show.",
    "📋 我的定时会议": "📋 My Scheduled Meetings",
    "请输入 6 位数字会议码": "Enter a 6-digit meeting code",
    "请选择会议时间": "Pick a meeting time",
    "时间格式错误": "Invalid time format",
    "时间必须在未来": "Time must be in the future",
    "只能预定一周内的会议": "Meetings can only be scheduled within a week",
    "预定（RSVP）": "Reserve (RSVP)",
    "已预定，到点自动进入会议": "Reserved — auto-joins at start time",
    "不预定": "Don't reserve",
    "我预定": "Reserve",
    "待开始": "Not started",
    "已参加": "Joined",
    "缺席": "Absent",
    "已预定": "Reserved",
    "不方便": "Can't join",
    "邀请好友预定": "Invite friends to reserve",
    "暂不邀请": "Skip inviting",
    "好友可通过会议码联系你预定": "Friends can contact you via the code to reserve",
    "暂无好友可邀请": "No friends to invite",
    "向好友发送预定邀请（": "Send reservation invites to friends (",
    "⏰ 定时会议「": "⏰ Scheduled meeting \"",
    "」时间到，自动进入": "\" is starting — auto joining",
    "⚠️ 你缺席了定时会议「": "⚠️ You missed the scheduled meeting \"",
    "你被移出了会议「": "You were removed from meeting \"",
    "」的预定名单": "\"'s reservation list",
    "暂无定时会议": "No scheduled meetings",
    "暂无好友预定": "No friend reservations",
    "会议「": "meeting \"",
    "发起学生会会议（填主题，如：想搞项目‘纸飞机大赛’）": "Start a council meeting (topic, e.g. 'Paper Plane Contest')",
    "🎥 进行中的会议": "🎥 Ongoing Meeting",
    "📢 发起会议": "📢 Start Meeting",
    "当前没有进行中的会议。学生会成员可点“📢 发起会议”直接开始。": "No ongoing meeting. Council members can click \"📢 Start Meeting\" to begin directly.",
    "加入会议": "Join Meeting",

    /* ---- 会议室媒体 ---- */
    "⚠️ 无法获取摄像头/麦克风（未授权或设备不可用），只能观看": "⚠️ Cannot access camera/mic (not allowed or unavailable) — view only",
    "未开启摄像头": "Camera off",
    "无媒体权限，你只能观看和收听": "No media permission — you can only watch and listen",
    "无媒体权限": "No media permission",
    "本次未获取到麦克风": "No microphone available this session",
    "本次未获取到摄像头": "No camera available this session",
    "🎤 麦克风：开": "🎤 Mic: On",
    "🔇 麦克风：关": "🔇 Mic: Off",
    "📷 摄像头：开": "📷 Camera: On",
    "🚫 摄像头：关": "🚫 Camera: Off",
    "麦克风": "Microphone",
    "摄像头": "Camera",
    "拒绝理由（可留空）：": "Reason for rejecting (optional): ",
    "未填写": "not provided",

    /* ---- 班级群 ---- */
    " · 你是班主任，可监视本班情况并开始班级会议": " · You are the head teacher: monitor the class and start class meetings",
    " · 同班同学自动成为好友": " · Classmates become friends automatically",
    "班级群未就绪，稍后再试": "Class group not ready — try again shortly",
    "🔴 开始班级会议": "🔴 Start Class Meeting",
    "已通知班级群结束该会议": "Notified the class group to end the meeting",
    "发消息给本班同学…（输入 @ 可提醒成员，可直接粘贴图片）": "Message your classmates… (@name to mention; you can paste images directly)",

    /* ---- 家长群 / 家长消息 ---- */
    " · 本班全体家长自由交流": " · All parents of this class chat freely",
    " · 未找到孩子的班级信息，暂时无法使用": " · Child's class info not found — unavailable for now",
    "本班暂无家长成员": "No parents in this class yet",
    "未找到孩子的班级，无法在家长群发言": "Child's class not found — cannot post in the parents group",
    "未找到孩子的班级，无法在家长群发送": "Child's class not found — cannot send in the parents group",
    "发消息给本班家长…（输入 @ 可提醒家长，可直接粘贴图片）": "Message the parents… (@name to mention; you can paste images directly)",
    "📨 给班主任发消息": "📨 Message the Head Teacher",
    "（请假 / 退学申请等）": "(leave / withdrawal requests etc.)",
    "（请假 / 退学等申请）": "(leave / withdrawal requests etc.)",
    "请假": "Leave request",
    "退学申请": "Withdrawal",
    "咨询": "Inquiry",
    "其他": "Other",
    "说明内容（如：孩子明天发烧，请假一天）": "Details (e.g. child has a fever tomorrow — one day's leave)",
    "发送后班主任会在「家长消息」中收到申请；批复结果会以消息通知你。": "The head teacher receives it in \"Parent Messages\"; you'll be notified of the decision.",
    "（班主任）": " (head teacher)",
    "你的【": "your [",
    "】申请": "] request",
    "已<b>批准</b>": "has <b>approved</b>",
    "<b>驳回</b>了": "<b>rejected</b>",
    "批准": "Approve",
    "驳回": "Reject",
    "申请发送给班主任：": "'s request was sent to the head teacher: ",
    "暂无家长申请": "No parent requests",

    /* ---- 班级广播 ---- */
    "（一次发送，本班学生 + 全体家长全部收到）": "(one send — reaches all students + parents of the class)",
    "🖼 添加图片（≤9 张，自动压缩）": "🖼 Add images (≤9, auto-compressed)",
    "🎬 添加视频（≤2 个，单个 ≤ 15MB）": "🎬 Add videos (≤2, each ≤ 15MB)",
    "🎬 视频": "🎬 Video",
    "📢 发送广播": "📢 Send Broadcast",
    "广播实时送达在线的本班学生和家长（班级群 + 家长群同时显示）。GIF 动图保持原样不压缩；视频较大时发送需要一点时间，请耐心等待发送完成提示。": "Broadcasts reach online students & parents instantly (shown in both class and parents groups). GIFs are sent as-is; larger videos take a moment — wait for the completion notice.",
    "📜 我发过的广播": "📜 My Broadcast History",
    "配文（选填，可写文字说明，也可粘贴视频链接）": "Caption (optional — text or a video link)",
    "请填写配文或添加图片 / 视频": "Add a caption or image / video first",
    "请选择广播班级": "Select a class to broadcast to",
    "连接未就绪，请稍后再试": "Connection not ready — try again shortly",
    "广播图片": "Broadcast image",
    "不是图片文件": "Not an image file",
    "图片超过 8MB": "Image exceeds 8MB",
    "图片解码失败": "Image decoding failed",
    "文件读取失败": "Failed to read the file",
    "不是视频文件": "Not a video file",
    "视频超过 15MB，请压缩或裁剪后再发": "Video exceeds 15MB — compress or trim it first",
    "移除": "Remove",
    "预览": "Preview",
    "还没有发过广播": "No broadcasts yet",
    "（无配文）": "(no caption)",
    "请填写说明内容": "Enter the details first",
    "本班暂未设置班主任，无法发送": "This class has no head teacher set — cannot send",

    /* ---- 学院分 ---- */
    "➕ 给学生加 / 扣学院分": "➕ Add / deduct points for a student",
    "自选分值加 / 扣": "Apply custom points",
    "说明：可点击固定分值，也可输入": "Tip: click a preset value, or enter a ",
    "自选分值": "custom value",
    "（正数加分、负数扣分，每次需填理由）；每次操作都会记录“谁 + 理由”。": " (positive adds, negative deducts; a reason is required). Every change logs who + reason.",
    "理由（必填，如：课堂表现优秀）": "Reason (required, e.g. excellent in class)",
    "🏆 班级学院分排行榜": "🏆 Class Points Ranking",
    "📊 全校排行榜（前 30）": "📊 School Ranking (Top 30)",
    "📜 最近加分记录": "📜 Recent Point Records",
    "还没有加分记录，去给同学加分吧": "No point records yet — go award some points!",
    "（全校学生）": "(all students in school)",
    " · 学号 ": " · ID ",
    "）当前": "), current ",
    " 分": " pts",
    "请先选择学生": "Select a student first",
    "请填写加 / 扣分理由": "Enter a reason for the points change",
    "自选分值需为非零整数（最大 9999，负数为扣分）": "Custom value must be a non-zero integer (max 9999; negative = deduct)",

    /* ---- 成绩 ---- */
    "✏️ 成绩录入": "✏️ Enter Grades",
    "（科目 + 分数 + E/M/D/B 等级）": "(subject + score + E/M/D/B level)",
    "等级": "Level",
    "E（最好）": "E (best)",
    "M（第二）": "M (2nd)",
    "D（第三）": "D (3rd)",
    "B（最差）": "B (worst)",
    "＋ 录入": "＋ Save",
    "等级标准：E 最好 · M 第二 · D 第三 · B 最差。录入分数后自动预选等级（E≥90 · M≥80 · D≥60 · B<60），可手动修改。": "Scale: E best · M 2nd · D 3rd · B worst. The score auto-suggests a level (E≥90 · M≥80 · D≥60 · B<60); you can change it manually.",
    "📊 各科目平均分": "📊 Average Score by Subject",
    "🥧 E / M / D / B 等级总占比": "🥧 E/M/D/B Level Distribution",
    "（E 最好 → M 第二 → D 第三 → B 最差）": "(E best → M 2nd → D 3rd → B worst)",
    "📜 成绩记录": "📜 Grade Records",
    "科目": "Subject",
    "科目（如 数学）": "Subject (e.g. Math)",
    "分数（0-150）": "Score (0-150)",
    "语文": "Chinese", "数学": "Math", "英语": "English", "物理": "Physics",
    "化学": "Chemistry", "生物": "Biology", "历史": "History", "地理": "Geography",
    "道德与法治": "Ethics & Law", "体育": "P.E.", "音乐": "Music", "美术": "Art", "信息科技": "IT",
    "请填写科目（1-10 字）": "Enter a subject (1-10 chars)",
    "分数需为 0-150 的数字（可带一位小数）": "Score must be 0-150 (one decimal allowed)",
    "请选择等级（E/M/D/B）": "Pick a level (E/M/D/B)",
    "选择学生…": "Select student…",
    "查看学生…": "View student…",
    "暂无成绩记录": "No grade records yet",
    "暂无等级数据": "No level data yet",
    "请先选择要查看的学生": "Select a student to view first",
    "未找到孩子的信息": "Child's info not found",
    " · 我的孩子": " · my child",
    " · 我": " · me",
    "（无学号）": "(no student ID)",

    /* ---- 学况反馈 ---- */
    "📨 给家长发学况反馈": "📨 Send learning report to parents",
    "（学习状况、在校表现等，家长离线也能收到）": "(learning status, school performance etc. — parents get it even offline)",
    "📨 老师发来的学况反馈": "📨 Learning Reports from Teachers",
    "暂无老师发来的学况反馈": "No learning reports from teachers yet",
    "该学生还没有注册的家长，无法发送": "This student has no registered parents — cannot send",
    "请填写学况内容": "Enter the report content first",
    "学况内容（如：近期课堂专注度明显提升，作业完成质量高）": "Report content (e.g. focus in class has improved a lot; homework quality is high)",

    /* ---- 课表 ---- */
    "➕ 添加课表": "➕ Add to Timetable",
    "（自己定义：星期 + 时间 + 班级 + 科目）": "(set your own: weekday + time + class + subject)",
    "星期": "Weekday",
    "周一": "Monday", "周二": "Tuesday", "周三": "Wednesday", "周四": "Thursday",
    "周五": "Friday", "周六": "Saturday", "周日": "Sunday",
    "＋ 添加": "＋ Add",
    "班级格式：数字 + 字母（6B = 六年级B班，班级 A-E）。课表保存在云端，换设备登录也能看到，仅自己可见。": "Class format: number + letter (6B = Grade 6 Class B, A–E). Timetables are stored in the cloud and follow your account across devices — only you can see them.",
    "🗓 我的课表": "🗓 My Timetable",
    "还没有课表，用上方表单添加（星期 + 时间 + 班级 + 科目）": "No lessons yet — add one with the form above (weekday + time + class + subject)",
    "已删除该节课": "Lesson deleted",
    "请选择星期": "Pick a weekday",
    "请填写开始和结束时间": "Enter start and end time",
    "结束时间需晚于开始时间": "End time must be after start time",
    "班级格式应为 数字+字母（如 6B = 六年级B班，班级 A-E）": "Class format should be number+letter (e.g. 6B = Grade 6 Class B, A–E)",
    "（今天）": "(today)",

    /* ---- 学生 / 学校管理 ---- */
    "👥 添加学生": "👥 Add Student",
    "（学生不能自行注册，账号由老师在此开通；学号必填且全校唯一）": "(students can't self-register — accounts are created here by teachers; student ID required & unique school-wide)",
    "年级": "Grade",
    "一年级": "Grade 1", "二年级": "Grade 2", "三年级": "Grade 3", "四年级": "Grade 4",
    "五年级": "Grade 5", "六年级": "Grade 6", "七年级": "Grade 7", "八年级": "Grade 8",
    "九年级": "Grade 9", "高一": "Grade 10", "高二": "Grade 11", "高三": "Grade 12",
    "班级": "Class",
    "A班": "Class A", "B班": "Class B", "C班": "Class C", "D班": "Class D", "E班": "Class E",
    "性别": "Gender",
    "男": "Male", "女": "Female",
    "📋 学生名单": "📋 Student List",
    "暂无学生，使用上方表单添加": "No students yet — add with the form above",
    "可创建教师 / 家长账号（学生请到「学生管理」添加），并可随时把管理员转让给其他教师。": "Create teacher / parent accounts (students are added in \"Students\"), and transfer admin to other teachers anytime.",
    "创建账号": "Create Account",
    "👥 学校成员（点击“转让”可将管理员交给对方）": "👥 School members (click \"Transfer\" to hand admin to them)",
    "转让": "Transfer",
    "姓名": "Name",
    "姓名（登录用户名）": "Name (login username)",
    "学号": "Student ID",
    "学号（必填，家长密码=学号）": "Student ID (required; parent password = ID)",
    "初始密码": "Initial password",
    "初始密码（4-20 位）": "Initial password (4–20 chars)",
    "新账号用户名（2-16 位）": "New account username (2–16 chars)",
    "密码需要 4-20 位": "Password must be 4–20 characters",
    "用户名 2-16 位，仅中文/字母/数字/下划线/连字符": "Username: 2–16 chars — Chinese/letters/digits/_/- only",
    "不能创建与你同名的账号": "Cannot create an account with your own name",
    "已创建": "Created ",
    "账号": "account",
    "教师账号": "teacher account",
    "家长账号": "parent account",
    "个账号": "accounts",
    "，请把用户名和初始密码告知对方": " — tell them the username and initial password",
    "姓名 2-16 位（登录用户名）": "Name: 2–16 chars (login username)",
    "学号必填（1-12 位字母/数字，家长密码 = 学号）": "Student ID required (1–12 letters/digits; parent password = ID)",
    "已被其他学生使用": " is already used by another student",
    "已被占用": "is already taken",
    "已被本校学生使用": "is already used by a student in this school",
    "在表内重复": " is duplicated in the sheet",
    "请选择年级": "Pick a grade",
    "请选择班级（A-E 班，每级最多 5 班）": "Pick a class (A–E, max 5 per grade)",
    "请选择性别": "Pick a gender",
    "已添加学生": "Student added:",
    "），请告知用户名和密码": ") — tell them the username and password",
    " · 班主任（": " · Head teacher (",
    "取消管理员": "Remove admin",
    "至少保留一位管理员（可直接把管理员设给其他教师）": "Keep at least one admin (you can grant admin to another teacher instead)",
    "设为管理员": "Make Admin",
    "</b> 设为管理员": "</b> is now an admin",
    "移除成员": "Removed member",
    "已移除成员": "Removed member",
    "并删除其账号": " and deleted their account",
    "暂无成员": "No members",
    "确定将": "Remove ",
    "移出学校？其账号将被删除，无法再登录。": " from the school? Their account will be deleted and they can no longer log in.",
    "取消": "Cancel ",
    "的管理员权限？": "'s admin rights?",
    "确定把": "Make ",
    "设为管理员？管理员可管理学校成员、创建各角色账号、管理学生会群成员。": " an admin? Admins manage school members, create accounts, and manage council members.",
    "已将": "",

    /* ---- Excel 批量导入 ---- */
    "📥 Excel 批量导入": "📥 Excel Bulk Import",
    "（把表格文件拖入对应区域，或点击区域选择文件）": "(drag a spreadsheet into a zone, or click a zone to browse)",
    "🧑‍🎓 学生表格": "🧑‍🎓 Student sheet",
    "：拖入 .xlsx / .xls / .csv 表格文件": ": drop in a .xlsx / .xls / .csv file",
    "请拖入 .xlsx / .xls / .csv 表格文件": "Drop in a .xlsx / .xls / .csv file",
    "第一列 姓名 · 第二列 学号 · 第三列 密码 · 第四列 班级（如 6B = 六年级B班，最多 E 班）· 第五 / 六列可选 First name / Last name（英文名，英文模式显示用）": "Col 1 Name · Col 2 Student ID · Col 3 Password · Col 4 Class (e.g. 6B = Grade 6 Class B, up to E) · Cols 5/6 optional First name / Last name (shown in English mode)",
    "🧑‍🏫 教师表格": "🧑‍🏫 Teacher sheet",
    "第一列 姓名 · 第二列 班主任 / 非班主任 · 第三列 班级（班主任必填，如 6B；非班主任留空）· 第四列 密码 · 第五 / 六列可选 First name / Last name（英文名，英文模式显示用）": "Col 1 Name · Col 2 Head teacher / not · Col 3 Class (required for head teachers, e.g. 6B; blank otherwise) · Col 4 Password · Cols 5/6 optional First name / Last name (shown in English mode)",
    "First name（英文名）": "First name",
    "Last name（英文姓）": "Last name",
    "First name（英文名，可空）": "First name (optional)",
    "Last name（英文姓，可空）": "Last name (optional)",
    "英文名（<b>英文模式</b>下全站显示为 First name + Last name；可留空，留空则始终显示中文名）": "English name (shown as <b>First name + Last name</b> everywhere in English mode; optional — otherwise the Chinese name is always shown)",
    "导入前会逐行校验并预览，确认无误后才会批量创建账号（家长账号不在此创建，家长自行注册）。": "Rows are validated & previewed before import; accounts are only created after you confirm (parent accounts aren't created here — parents self-register).",
    "班主任 · ": "Head teacher · ",
    "表格解析组件未加载（需联网加载 CDN），请检查网络后刷新页面": "Spreadsheet parser not loaded (CDN needs internet) — check the network and refresh",
    "只有管理员可以批量导入": "Only admins can bulk import",
    "学校数据未就绪，请稍后再试": "School data not ready — try again shortly",
    "表格解析失败：": "Failed to parse the sheet: ",
    "表格文件读取失败": "Failed to read the file",
    "表格中没有可导入的数据（请检查列顺序是否符合格式说明）": "Nothing to import (check column order against the format notes)",
    "表格解析完成：": "Sheet parsed: ",
    "条有效": " valid",
    "数据无效": "invalid",
    "第 ": "Line ",
    " 行": "",
    "导入": "Import ",
    " 条": " rows",
    "✅ 已导入": "✅ Imported ",
    "个账号（初始密码为表中密码，班主任名单已同步）": " accounts (initial passwords as in the sheet; head-teacher roster synced)",
    "已批量导入": "Bulk imported",
    "姓名「": "Name \"",
    "」需 2-16 位中文/字母/数字": "\" must be 2–16 chars (Chinese/letters/digits)",
    "不能导入与你（管理员）同名的账号": "Cannot import an account with your own (admin) name",
    "」已是本校成员": "\" is already a member of this school",
    "」在表内重复": "\" is duplicated in the sheet",
    "」密码需 4-20 位": "\" password must be 4–20 chars",
    "」学号需 1-12 位字母/数字": "\" student ID must be 1–12 letters/digits",
    "」班级「": "\" class \"",
    "」格式应为 数字+字母（如 6B，班级 A-E）": "\" format should be number+letter (e.g. 6B, classes A–E)",
    "」第二列需填「班主任」或「非班主任」": "\" col 2 must be \"Head teacher\" or \"Not head teacher\"",
    "」是班主任，第三列班级格式应为 数字+字母（如 6B）": "\" is a head teacher: col 3 class must be number+letter (e.g. 6B)",

    /* ---- 好友 ---- */
    "暂无好友": "No friends yet",
    "暂无申请": "No requests",
    "收到的好友申请": "Friend Requests Received",
    "添加": "Add",
    "请输入正确的用户名": "Enter a valid username",
    "不能添加自己": "You can't add yourself",
    "已经是好友了": "Already friends",
    "用户名": "Username",
    "不存在": "doesn't exist",
    "只能添加<b>同校</b>的人为好友（对方在": "You can only add people from the <b>same school</b> (they're in ",
    "已向": "Request sent to ",
    "发送好友申请": "",
    "接受": "Accept",
    "已添加好友": "Friend added:",
    "拒绝": "Decline",
    "成为好友": "is now your friend",
    "接受了你的好友申请": "accepted your friend request",
    "拒绝了你的好友申请": "declined your friend request",

    /* ---- @提及 ---- */
    "@全体成员": "@Everyone",
    "全体成员": "everyone",
    "@管理员": "@Admin",
    "只有班主任 / 管理员可以 @全体成员": "Only head teachers / admins can @everyone",
    "只有管理员可以 @全体成员": "Only admins can @everyone",
    "已 @管理员，对方在线会收到提醒": "@Admin sent — they'll be alerted if online",

    /* ---- 学生会 ---- */
    "你不是本校学生会成员（管理员自动在群内；学生需由管理员拉入）。": "You're not in this school's student council (admins are in automatically; students must be added by an admin).",
    "你不是本校学生会成员，或尚未登录。": "You're not in the student council, or not logged in.",
    "管理员仅负责成员管理（右侧拉学生进群 / 移出）；聊天与会议由学生会自主进行。": "Admins only manage members (add / remove on the right); council chat & meetings are student-run.",
    "你是学生会成员：可自由发言、直接发起会议、@管理员会提醒对方。": "You're a member: chat freely, start meetings directly, @admin notifies them.",
    "👥 学生会成员管理": "👥 Council Members",
    " · 管理员（成员管理）": " · Admin (Members)",
    "移出学生会群": "was removed from the student council",
    "拉进学生会群": "was added to the student council",
    "已把": "",
    "⭐ 学生会群": "⭐ Student Council",
    "💬 学生会讨论": "💬 Council Chat",
    "❓ 询问管理员": "❓ Ask Admin",
    "👥 群成员": "👥 Members",
    "➕ 拉学生进学生会群": "➕ Add Students to the Council",
    "拉入": "Add",
    "发言 / 询问管理员…（@管理员 或 @成员名 会提醒对方，可直接粘贴图片）": "Chat / ask admins… (@Admin or @name notifies them; you can paste images directly)",
    "向管理员提问，管理员会收到醒目提醒": "Ask the admins — they get a prominent alert",
    "向管理员提问（学生可自由询问管理员）": "Ask the admins (students may ask freely)",
    "【询问管理员】": "[Ask Admin] ",
    "已发送给管理员": "Sent to the admins",
    "创建": "Create",
    "提交申请": "Submit",
    "申请已提交，等待管理员批准": "Request submitted — awaiting admin approval",
    "拒绝该会议申请？": "Reject this meeting request?",
    "等待管理员批准…": "Waiting for admin approval…",
    "已批准": "Approved ",
    "的会议申请，会议已发布到群里": "'s meeting request — posted to the group",

    /* ---- 登录 / 注册（signin.html） ---- */
    "① 学校": "① School",
    "② 身份": "② Role",
    "③ 登录": "③ Login",
    "欢迎来到嘻嗨校园": "Welcome to XiHai Campus",
    "第一步：填写你的学校名称": "Step 1: enter your school name",
    "下一步": "Next",
    "填写学校后自动检查是否为新学校；新学校将由首位教师确认创建。学生不能自行注册，账号由创校老师在「学生管理」中开通；已有学校的教师账号同样由管理员在「学校管理」中开通。": "We'll check whether the school exists; new schools are confirmed by the first teacher. Students can't self-register — accounts are created by the founding teacher in \"Students\"; teacher accounts in existing schools are likewise created by the admin in \"School\".",
    "选择你的身份": "Choose your role",
    "学校：": "School: ",
    "学校「": "School \"",
    "⏳ 正在检查学校…": "⏳ Checking school…",
    "⏳ 正在检查学校是否存在…": "⏳ Checking if the school exists…",
    "⚠ 暂时无法连接服务器，登录时会再检查": "⚠ Can't reach the server right now — will check again at login",
    "✅ 学校已存在：学生 / 家长可登录，教师账号需管理员开通": "✅ School exists — students / parents can log in; teacher accounts are created by the admin",
    "创建新学校（首任即管理员）；已有学校需管理员开通": "Create a new school (founder = admin); existing schools need admin setup",
    "账号由创校老师开通，不能自行注册": "Account created by the founding teacher — no self-registration",
    "注册需孩子学号作密码，无需管理员邀请": "Register with your child's student ID as the password — no admin invite needed",
    "← 返回修改学校": "← Back to school",
    "登录 / 注册": "Login / Register",
    "教师类型": "Teacher type",
    "🏅 班主任": "🏅 Head Teacher",
    "📚 非班主任": "📚 Subject Teacher",
    "家长信息（": "Parent info (",
    "注册": "register",
    "时填写全部；已注册": " — fill in everything; already registered? Just ",
    "只需下方用户名和密码）": " with username & password below)",
    "选择你的孩子（本校，注册必填）": "Pick your child (this school; required to register)",
    "选择学生（本校）": "Pick a student (this school)",
    "本校暂无学生（需老师先开通）": "No students in this school yet (teachers must create them first)",
    "监护人": "Guardian",
    "妈妈": "Mom", "爸爸": "Dad", "爷爷": "Grandpa", "奶奶": "Grandma",
    "外公": "Grandpa (maternal)", "外婆": "Grandma (maternal)",
    "哥哥": "Elder brother", "姐姐": "Elder sister", "其他亲属": "Other relative",
    "用户名全局唯一；新用户名将自动注册并绑定当前学校与身份": "Usernames are globally unique; a new one auto-registers & binds to the current school and role",
    "← 返回重选学校 / 身份": "← Back to school / role",
    "学校名称（2-20 字）": "School name (2–20 chars)",
    "学校名称至少 2 个字符": "School name needs at least 2 characters",
    "学校名称只能包含中文、字母、数字、下划线、连字符": "School name: Chinese/letters/digits/_/- only",
    "用户名（2-16 位）": "Username (2–16 chars)",
    "用户名（你的姓名）需 2-16 位中文/字母/数字": "Username (your name): 2–16 chars — Chinese/letters/digits",
    "密码（4-20 位）": "Password (4–20 chars)",
    "密码（孩子的学号）": "Password (your child's student ID)",
    "显示 / 隐藏密码": "Show / hide password",
    "登录": "Log in",
    "✓ 登录成功，正在进入…": "✓ Logged in — entering…",
    "欢迎，": "Welcome, ",
    "请输入密码（注册时密码 = 孩子的学号）": "Enter the password (on registration it's your child's student ID)",
    "正在连接服务器…": "Connecting to the server…",
    "用户名至少 2 个字符": "Username needs at least 2 characters",
    "用户名只能包含中文、字母、数字、下划线、连字符": "Username: Chinese/letters/digits/_/- only",
    "请选择任课年级": "Pick the grade you teach",
    "无法连接服务器，请检查网络后重试": "Can't reach the server — check the network and retry",
    "密码错误，登录失败": "Wrong password — login failed",
    "无法验证班主任人数，请稍后重试": "Couldn't verify the head-teacher count — try again later",
    "无法连接服务器，请重试": "Can't reach the server — please retry",
    "注册成功，请记住密码": "registered — remember the password",
    "其他身份": "Other roles",
    "密码错误（家长密码 = 孩子的学号）": "Wrong password (parent password = child's student ID)",
    "注册需选择你的孩子（学生需已由本校老师开通并录入学号）": "Registration needs your child selected (the student must be created by a teacher with a student ID)",
    "所选学生不存在，请返回重新选择": "Selected student not found — go back and re-pick",
    "等待确认…": "Waiting for confirmation…",
    "」未被使用，可创建": "\" is unused and can be created",
    "」尚未被任何人创建，是一个": "\" hasn't been created yet — it's a ",
    "新学校，请确认并成为教师。确认后你将成为该校的": "New school: confirm to become its teacher. You'll then be the ",
    "创校教师（管理员）": "founding teacher (admin)",
    "，可在主页「学生管理」中添加学生，也可增加教师 / 家长账号。": " — you can add students in \"Students\" and create teacher / parent accounts.",
    "✓ 确认并成为教师": "✓ Confirm & Become Teacher",
    "已取消创建学校": "School creation cancelled",
    "学校 · 老师 · 学生 · 家长，一个页面全连通": "School · Teachers · Students · Parents — all connected in one page",
    "高清视频会议 · 班级直播 / 家长会 / 在线答疑": "HD video meetings · class live / parent meetings / online Q&A",
    "按学校组织：教师可创建学校并管理成员": "Organized by school: teachers create schools & manage members",
    "校内加好友 · 快速会议 / 会议码 / 定时会议": "In-school friends · quick / code / scheduled meetings",
    "学生会群 · 班级群 · 学院分激励": "Student council · class groups · points",
    "王老师 · 直播授课中": "Mr. Wang · live teaching",
    "三年二班 · 家长会": "Class 3-2 · Parent Meeting",
    "李同学 · 课堂连线": "Student Li · in-class call",
    "学校名称": "School name",
    "学生不能自行注册：": "Students can't self-register: ",
    "：账号需由创校老师在主页「学生管理」中创建（填写姓名、学号、年级、班级、性别、密码），请向老师获取用户名和密码后登录。": ": accounts are created by the founding teacher in \"Students\" (name, ID, grade, class, gender, password). Ask the teacher for the username & password, then log in.",
    "请让创校老师在主页「学生管理」中为你创建账号（填写姓名、学号、年级、班级、性别、密码），再回来登录": "Ask the founding teacher to create your account in \"Students\" (name, ID, grade, class, gender, password), then come back to log in",
    "直接输入用户名和密码登录；仅<b>新学校首次注册</b>时才需要选择教师类型（班主任需选年级 + 班级，A-E 班）。已有学校的教师账号由管理员创建。": "Enter your username and password to log in; teacher type (head teachers pick grade + class, A–E) is only needed when registering a <b>new school</b>. Teacher accounts in existing schools are created by the admin.",
    "教师类型（仅新学校首次注册时需要）": "Teacher type (only for first-time registration of a new school)",
    "新学校注册需先选择教师类型：请选「班主任」并选择年级 + 班级（A-E 班），或选「非班主任」": "New-school registration needs a teacher type first: pick \"Head teacher\" and choose grade + class (A–E), or pick \"Non-head teacher\"",
    "」已存在：教师账号需由学校管理员在主页「学校管理」中创建（或用 Excel 批量导入），不能自行注册": "\" already exists: teacher accounts must be created by the school admin in \"School\" (or imported via Excel) — no self-registration",
    "」已存在，无法重复创建；请返回第一步核对校名，或以正确身份登录": "\" already exists — it can't be created twice; go back to step 1 to check the name, or log in with the right role",
    "用户名「": "Username \"",
    "」已在本校使用，请换一个名字（可加姓氏或称呼）": "\" is already used in this school — pick another name",
    "该身份不能自行注册，请联系学校管理员开通账号": "This role can't self-register — ask the school admin to create the account",

    /* ---- 表情 / GIF ---- */
    "表情": "Emoji",
    "GIF 表情包": "GIF Stickers",

    /* ---- 通用弹窗 ---- */
    "确定": "OK",
    "请输入…": "Type here…",
    "发送": "Send",
    "删除": "Delete",
    "无": "None",

    /* ---- SMART Goal（学生主页） ---- */
    "🎯 新建 SMART Goal": "🎯 New SMART Goal",
    "📋 我的 goal": "📋 My Goals",
    "模板：学期全科都达到某等级及以上": "Template: all subjects at a level or above this term",
    "模板：某科期末考试达到某分数以上": "Template: a subject final exam above a score",
    "模板：学院分累计达到某分数": "Template: total points reach a target",
    "自定义 goal（仅自己可批准完成）": "Custom goal (self-approved only)",
    "全科等级不低于": "All subjects at or above level",
    "科目（可改，如 数学）": "Subject (editable, e.g. Math)",
    "期末目标分数（0-150）": "Target final-exam score (0-150)",
    "目标学院分（正整数，如 100）": "Target points (positive integer, e.g. 100)",
    "描述你的 goal（如：每天阅读 30 分钟，坚持一个月）": "Describe your goal (e.g. read 30 minutes every day for a month)",
    "＋ 创建 goal": "＋ Create Goal",
    "说明：模板 goal 会根据你的成绩 / 学院分自动判定是否完成；自定义 goal 由你自己批准完成。每次进入主页都会提示 goal 完成进度。": "Template goals are auto-checked against your grades / points; custom goals are approved by yourself. Your goal progress is shown every time you open the page.",
    "还没有 goal，用上方模板或自定义创建第一个吧。": "No goals yet — create your first one above with a template or custom.",
    "✅ 已完成": "✅ Done",
    "⏳ 进行中（自动判定）": "⏳ In progress (auto-checked)",
    "⏳ 进行中": "⏳ In progress",
    "批准完成": "Approve as done",
    "撤销完成": "Undo done",
    "（自动判定）": " (auto-checked)",
    "模板 · 创建于 ": "Template · created ",
    "自定义 · 创建于 ": "Custom · created ",
    " · 完成于 ": " · done ",
    "已完成 ": "Done ",
    "你的 goal「": "Your goal \"",
    "」已完成 ": "\" — done ",
    "，请再接再厉": ", keep it up!",
    "🎉 你的 goal「": "🎉 Your goal \"",
    "」已达成，太棒了！": "\" has been achieved. Awesome!",
    "🎯 已创建 goal「」": "🎯 Goal created: ",
    "你还没有设置 SMART Goal，去「SMART Goal」页用模板或自定义创建一个吧": "No SMART Goal yet — create one on the SMART Goal page",
    "目标预览：": "Preview: ",
    "（自定义 goal，仅自己可批准完成）": "(custom goal, self-approved only)",
    "（模板 goal，系统根据成绩 / 学院分自动判定）": "(template goal, auto-checked against grades / points)",
    "请填写 goal 描述（2-100 字）": "Enter a goal description (2-100 chars)",
    "目标分数需为 1-150 的数字": "Target score must be a number from 1-150",
    "目标学院分需为正整数": "Target points must be a positive integer",
    "goal 最多 20 个，请先删除一些再创建": "Up to 20 goals — delete some first",
    "确定删除该 goal？": "Delete this goal?",
    "连接尚未就绪，请稍后再试": "Connection not ready — please try again shortly",

    /* ---- 学科圆环（主页激励） ---- */
    "⭕ 学科圆环": "⭕ Subject Rings",
    "（环 = 平均分进度 · 颜色 = 最近等级 · 金色细环 = 冲刺 goal 进度）": "(ring = average progress · color = latest level · gold ring = sprint goal progress)",
    "平均分": "avg",
    " 次记录 · 最近 ": " records · latest ",
    "🎯 目标 ": "🎯 target ",
    "暂无成绩记录，老师录入成绩后这里会亮起来": "No grades yet — rings will light up once your teacher records scores",
    /* ---- 评分标准（grading.html + 成绩页） ---- */
    "📐 评分标准": "📐 Grading Scale",
    "评分标准": "Grading Scale",
    "📊 当前全校标准": "📊 Current School-wide Scale",
    "⚙️ 调整标准": "⚙️ Adjust Scale",
    "（教师 / 管理员可修改，保存后全校立即生效）": "(teachers / admins only — applies school-wide immediately)",
    "⚙️ 查看 / 调整评分标准": "⚙️ View / Adjust Grading Scale",
    "📐 调整全校评分标准": "📐 Adjust School Grading Scale",
    "当前全校标准：": "Current school scale: ",
    "（全校统一的 E / M / D / B 自动评级）": "(school-wide automatic E/M/D/B rating)",
    "（最后由 ": "(last set by ",
    " 设定）": ")",
    "（当前为系统默认标准）": "(system default scale)",
    "阈值方式": "Threshold mode",
    "百分比（相对满分，如 98%）": "Percentage (of full score, e.g. 98%)",
    "绝对分（直接填分数，如 98 分）": "Absolute score (raw points, e.g. 98)",
    "自定义满分（1-1000）": "Custom full score (1-1000)",
    "（填百分数，如 98 表示 98%）": "(percentage — 98 means 98%)",
    "（填分数，如 98 表示 98 分）": "(raw score — 98 means 98 points)",
    "百分比": "Percentage",
    "阈值": "Threshold",
    "分数线（满分 ": "Cut-off (full score ",
    "含义": "Meaning",
    "最好（优秀）": "Best (excellent)",
    "第二（良好）": "2nd (good)",
    "第三（及格）": "3rd (pass)",
    "最差（待提高）": "Worst (needs work)",
    "满分 ": "Full score ",
    " 分）": " pts)",
    " 分 → ": " pts → ",
    "💾 保存为本校标准": "💾 Save as School Scale",
    "↺ 恢复默认（98/70/60）": "↺ Reset to default (98/70/60)",
    "🧮 批量试算": "🧮 Batch Preview",
    "（按当前填写的标准，看看各分数段落在哪一级）": "(see which level each score falls into under the values above)",
    "试算：": "Try: ",
    "输入一个分数，看会被评为什么等级": "Enter a score to see which level it gets",
    "输入分数后显示等级": "Enter a score to see the level",
    "已保存：": "Saved: ",
    "已填入默认标准（98 / 70 / 60），别忘了保存": "Default scale filled in (98 / 70 / 60) — remember to save",
    "只有教师和管理员可以修改评分标准": "Only teachers and admins can change the grading scale",
    "满分需为 1-1000 的整数": "Full score must be an integer between 1 and 1000",
    "请填写 ": "Please enter ",
    " 的阈值": " threshold",
    "阈值需在 0 ~ ": "Threshold must be 0 ~ ",
    " 范围内（": " (level ",
    " 级）": ")",
    "云端标准刚刚被 ": "The cloud scale was just changed by ",
    " 修改过（": " (",
    "），仍要覆盖吗？": ") — overwrite anyway?",
    "覆盖保存": "Overwrite & Save",
    "你是学生 / 家长身份，只能查看标准；需要调整请联系老师或管理员。": "You're a student / parent — this page is read-only. Ask a teacher or admin to adjust it.",
    "说明：E 最好 · M 第二 · D 第三 · B 最差（低于 D 线即为 B）。保存后立即影响成绩录入的自动评级与学科圆环的满分刻度；已录入的历史成绩等级不会被改写。只有教师和管理员能修改，其他人只能查看。": "Levels: E best · M 2nd · D 3rd · B worst (below the D line = B). Saving affects the auto level when recording scores and the ring's full-score scale; existing records are not rewritten. Only teachers and admins can edit; others can view.",
    "等级标准：E 最好 · M 第二 · D 第三 · B 最差。录入分数后会按本校标准自动预选等级，可手动修改。": "Levels: E best · M 2nd · D 3rd · B worst. A level is auto-suggested from your school scale; you can change it manually.",
    "分数需为 0-": "Score must be 0-",
    " 的数字（可带一位小数）": " (one decimal allowed)",
    "尚未登录，正在跳转到登录页…": "Not signed in — redirecting to the login page…",
    "← 主页": "← Home",
    "返回主页": "Back to Home",

    /* ---- 标点兜底（放最后，长度排序自然靠后） ---- */
    "「": "\"", "」": "\"",
    "【": "[", "】": "]",
    "（": " (", "）": ")",
    "，": ", ", "。": ".",
    "！": "!", "？": "?",
    "：": ": ",
    "、": ", "
  };

  var KEYS = null;
  window.__I18N_EN = true; // esc() 检测此标记，为用户数据加保护哨兵
  var RE_SENTINEL = /\u0003([\s\S]*?)\u0003/g;
  function TR(s) {
    if (typeof s !== "string" || !s) return s;
    if (!/[\u4e00-\u9fa5]/.test(s)) { return s.replace(/\u0003/g, ""); } // 无中文：只需清掉哨兵
    /* 1) esc() 保护的用户内容（姓名/消息正文/说明等）先摘出，绝不翻译 */
    var stash = [];
    s = s.replace(RE_SENTINEL, function (_, c) { stash.push(c); return "\u0004" + (stash.length - 1) + "\u0004"; });
    if (!KEYS) KEYS = Object.keys(EN_MAP).sort(function (a, b) { return b.length - a.length; });
    /* 2) 数字年级/班级组合先保护成 token，防止被词典拆散（如 6B班 / 6年级B班） */
    s = s.replace(/(\d{1,2})年级([A-E])班/g, "\u0001$1|$2\u0001");
    s = s.replace(/(\d{1,2})([A-E])班/g, "\u0001$1|$2\u0001");
    s = s.replace(/(\d{1,2})年级/g, "\u0002$1\u0002");
    /* 3) 词典最长优先替换 */
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (s.indexOf(k) !== -1) s = s.split(k).join(EN_MAP[k]);
    }
    /* 4) 恢复 token + 拼接衔接修正 */
    s = s.replace(/\u0001(\d{1,2})\|([A-E])\u0001/g, "Grade $1 Class $2");
    s = s.replace(/\u0002(\d{1,2})\u0002/g, "Grade $1");
    s = s.replace(/(\d)(Class |Grade )/g, "$1 $2");
    /* 5) 还原被保护的用户内容，清理任何残留哨兵 */
    s = s.replace(/\u0004(\d+)\u0004/g, function (_, i2) { return stash[+i2] !== undefined ? stash[+i2] : ""; });
    return s.replace(/\u0003/g, "");
  }
  window.TR = TR;

  /* ================= DOM 赋值拦截 ================= */
  try {
    var dInner = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    Object.defineProperty(Element.prototype, "innerHTML", {
      get: function () { return dInner.get.call(this); },
      set: function (v) { dInner.set.call(this, typeof v === "string" ? TR(v) : v); },
      configurable: true
    });
    var dText = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    Object.defineProperty(Node.prototype, "textContent", {
      get: function () { return dText.get.call(this); },
      set: function (v) { dText.set.call(this, typeof v === "string" ? TR(v) : v); },
      configurable: true
    });
    [["HTMLElement", "title"], ["HTMLInputElement", "placeholder"], ["HTMLTextAreaElement", "placeholder"]].forEach(function (pair) {
      var proto = window[pair[0]] && window[pair[0]].prototype;
      if (!proto) return;
      var d = Object.getOwnPropertyDescriptor(proto, pair[1]);
      if (!d || !d.set) return;
      Object.defineProperty(proto, pair[1], {
        get: d.get,
        set: function (v) { d.set.call(this, typeof v === "string" ? TR(v) : v); },
        configurable: true
      });
    });
    var sa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      if (typeof v === "string" && /^(placeholder|title|value|aria-label)$/i.test(n)) v = TR(v);
      return sa.call(this, n, v);
    };
    /* 原生弹窗 */
    var _confirm = window.confirm, _alert = window.alert, _prompt = window.prompt;
    window.confirm = function (s) { return _confirm.call(window, TR(String(s))); };
    window.alert = function (s) { _alert.call(window, TR(String(s))); };
    window.prompt = function (s, d) { return _prompt.call(window, TR(String(s)), d); };
  } catch (err) { /* 拦截失败时静默降级为中文 */ }

  /* ================= 静态 DOM 扫描 ================= */
  function scan(root) {
    try {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      var n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && /[\u4e00-\u9fa5]/.test(n.nodeValue)) n.nodeValue = TR(n.nodeValue);
      }
    } catch (err) {}
  }
  function scanAll() {
    scan(document.body || document.documentElement);
    try {
      document.querySelectorAll("input[placeholder],textarea[placeholder],[title]").forEach(function (el) {
        if (el.placeholder && /[\u4e00-\u9fa5]/.test(el.placeholder)) el.placeholder = TR(el.placeholder);
        if (el.title && /[\u4e00-\u9fa5]/.test(el.title)) el.title = TR(el.title);
      });
      if (document.title && /[\u4e00-\u9fa5]/.test(document.title)) document.title = TR(document.title);
    } catch (err) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scanAll);
  else scanAll();
})();
