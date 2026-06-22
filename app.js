/* ===================================================================
   AWS SAP 스터디 트래커 — app.js
   - study-log.jsonl 을 읽어 대시보드 렌더 (읽기 전용)
   - 상단 토글: [가연] [소울] [합쳐서 보기] — 슬라이딩 + 페이지 전환 효과
   - 개인 뷰에서만 타이머 + 오늘 기록 입력폼 → 붙여넣을 JSONL 한 줄 생성
   - 합쳐서 보기는 비교 전용(입력 카드 숨김)
   백엔드 없음. 데이터는 오직 study-log.jsonl 한 곳에서 관리.
=================================================================== */

const LOG_FILE = "study-log.jsonl";
const ALL_VIEW = "__ALL__";
const DEFAULT_USERS = ["가연", "소울"]; // 로그가 비어도 토글에 항상 표시
const PALETTE = ["#ff9900", "#2f6fed", "#1a8754", "#c026d3"]; // 유저별 색

let ALL = [];        // 전체 로그
let USERS = [];      // 정렬된 유저 목록
let view = null;     // 현재 보기: 유저명 또는 ALL_VIEW
let segOrder = [];   // 토글 버튼 순서(값) — 전환 방향 계산용

/* ── 유틸 ─────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtMinutes(min) {
  if (!min && min !== 0) return "–";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
function userOf(e) { return e.user || "나"; }
function userColor(u) { return PALETTE[Math.max(0, USERS.indexOf(u)) % PALETTE.length]; }
function dot(u) { return `<span class="udot" style="background:${userColor(u)}"></span>`; }

function parseLog(text) {
  return text.split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .map((l, i) => { try { return JSON.parse(l); } catch (e) { console.warn(`로그 ${i + 1}줄 파싱 실패:`, l); return null; } })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ── 상단 토글 ────────────────────────────────────────── */
function buildToggle() {
  segOrder = [...USERS, ALL_VIEW];
  const labels = { [ALL_VIEW]: "합쳐서 보기" };

  const box = $("viewToggle");
  box.innerHTML = '<span class="seg-ind" id="segInd"></span>';
  segOrder.forEach((val) => {
    const b = document.createElement("button");
    b.className = "seg-btn";
    b.dataset.val = val;
    b.textContent = labels[val] || val;
    b.onclick = () => setView(val);
    box.appendChild(b);
  });

  if (!segOrder.includes(view)) view = USERS[0] || ALL_VIEW;
  markActive();
  // 레이아웃 잡힌 뒤 인디케이터 위치
  requestAnimationFrame(moveIndicator);
}

function markActive() {
  document.querySelectorAll(".seg-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.val === view));
}

function moveIndicator() {
  const btn = [...document.querySelectorAll(".seg-btn")].find((b) => b.dataset.val === view);
  const ind = $("segInd");
  if (!btn || !ind) return;
  ind.style.width = btn.offsetWidth + "px";
  ind.style.transform = `translateX(${btn.offsetLeft - 4}px)`;
}

function setView(val) {
  if (val === view) return;
  const dir = segOrder.indexOf(val) > segOrder.indexOf(view) ? 1 : -1;
  view = val;
  markActive();
  moveIndicator();
  renderView(dir);
}

/* ── 전환 애니메이션 + 라우팅 ─────────────────────────── */
function renderView(dir = 1) {
  const root = $("viewRoot");
  root.classList.remove("view-left", "view-right");
  void root.offsetWidth; // 리플로우 → 애니메이션 재생
  root.classList.add(dir > 0 ? "view-right" : "view-left");

  // 합쳐서 보기 = 비교 전용 → 타이머·입력 카드 숨김, 오답노트만 한 줄로
  const combined = view === ALL_VIEW;
  $("entryCard").style.display = combined ? "none" : "";
  $("mainGrid").classList.toggle("solo", combined);

  if (combined) renderCombined();
  else renderUser(view);
  renderCompare();
}

function renderAll() {
  // 데이터에 없는 사람이라도 기본 유저(가연·소울)는 항상 토글에 노출
  const inData = [...new Set(ALL.map(userOf))];
  USERS = [...DEFAULT_USERS, ...inData.filter((u) => !DEFAULT_USERS.includes(u))];
  buildToggle();
  renderView(1);
}

/* ── 단일 유저 보기 ───────────────────────────────────── */
function renderUser(user) {
  const mine = ALL.filter((e) => userOf(e) === user);
  const today = todayStr();
  const e = mine.find((x) => x.date === today) || mine[mine.length - 1];

  if (!e) { // 아직 이 사람 기록이 없음
    $("heroDate").innerHTML = `${dot(user)}${escapeHtml(user)} · 아직 기록 없음`;
    ["mTime", "mDumps", "mAcc", "mWrong"].forEach((id) => ($(id).textContent = "–"));
    $("mLecture").textContent = "–";
    $("mConfusing").textContent = "오른쪽에서 첫 기록을 만들어보세요";
    $("streakNum").textContent = "0";
    renderWrongNotes(mine, false);
    renderTrend(mine);
    return;
  }

  $("heroDate").innerHTML = `${e.date === today ? "오늘" : "최근 기록"} · ${e.date} · ${dot(user)}${escapeHtml(user)}`;
  $("mTime").textContent = fmtMinutes(e.studyMin);
  $("mDumps").textContent = (e.dumps ?? 0) + "문제";
  const acc = e.dumps ? Math.round((e.correct / e.dumps) * 100) : null;
  $("mAcc").textContent = acc === null ? "–" : acc + "%";
  $("mWrong").textContent = (e.problems || []).filter((p) => p.ok === false).length + "개";
  $("mLecture").textContent = e.lecture || "–";
  $("mConfusing").textContent = e.confusing || "기록 없음";

  $("streakNum").textContent = streakOf(mine);
  renderWrongNotes(mine, false);
  renderTrend(mine);
}

/* ── 합쳐서 보기 ──────────────────────────────────────── */
function renderCombined() {
  const day = [...new Set(ALL.map((e) => e.date))].sort().pop(); // 가장 최근 날짜

  if (!day) { // 아직 아무 기록도 없음
    $("heroDate").innerHTML = `오늘 합쳐서 · ` + USERS.map((u) => dot(u) + escapeHtml(u)).join(" + ");
    ["mTime", "mDumps", "mAcc", "mWrong"].forEach((id) => ($(id).textContent = "–"));
    $("mLecture").textContent = "–";
    $("mConfusing").textContent = "아직 기록 없음";
    $("streakNum").textContent = "0";
    renderWrongNotes([], true);
    renderTrendCombined();
    return;
  }

  const dayRows = USERS.map((u) => ALL.find((e) => userOf(e) === u && e.date === day)).filter(Boolean);

  const sum = (f) => dayRows.reduce((s, e) => s + (f(e) || 0), 0);
  const min = sum((e) => e.studyMin);
  const dumps = sum((e) => e.dumps);
  const correct = sum((e) => e.correct);
  const wrong = dayRows.reduce((s, e) => s + (e.problems || []).filter((p) => p.ok === false).length, 0);
  const acc = dumps ? Math.round((correct / dumps) * 100) : null;

  $("heroDate").innerHTML = `오늘 합쳐서 · ${day} · ` + USERS.map((u) => dot(u) + escapeHtml(u)).join(" + ");
  $("mTime").textContent = fmtMinutes(min);
  $("mDumps").textContent = dumps + "문제";
  $("mAcc").textContent = acc === null ? "–" : acc + "%";
  $("mWrong").textContent = wrong + "개";

  $("mLecture").innerHTML = USERS.map((u) => {
    const e = ALL.find((x) => userOf(x) === u && x.date === day);
    return `${dot(u)}${escapeHtml(u)} ${escapeHtml(e?.lecture || "–")}`;
  }).join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  $("mConfusing").innerHTML = USERS.map((u) => {
    const e = ALL.find((x) => userOf(x) === u && x.date === day);
    return `${dot(u)}<b>${escapeHtml(u)}</b> ${escapeHtml(e?.confusing || "–")}`;
  }).join("<br>");

  $("streakNum").textContent = streakOf(ALL); // 둘 중 누구든 공부한 연속일
  renderWrongNotes(ALL, true);                // 두 사람 오답 모두 (이름표)
  renderTrendCombined();                      // 날짜별 두 사람 막대
}

/* ── 공통 렌더 ────────────────────────────────────────── */
function streakOf(entries) {
  const dates = new Set(entries.map((e) => e.date));
  let streak = 0;
  const d = new Date();
  if (!dates.has(todayStr())) d.setDate(d.getDate() - 1);
  while (dates.has(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function renderWrongNotes(entries, showUser) {
  const box = $("wrongList");
  box.innerHTML = "";
  const items = [];
  [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((e) => {
    (e.problems || []).forEach((p) => { if (p.ok === false) items.push({ ...p, date: e.date, user: userOf(e) }); });
  });
  $("wrongCount").textContent = items.length ? `${items.length}개` : "";
  if (!items.length) { box.innerHTML = '<p class="empty">오답 기록이 없어요. 👏</p>'; return; }

  items.forEach((p) => {
    const tag = showUser ? `${dot(p.user)}${escapeHtml(p.user)} · ` : "";
    const el = document.createElement("div");
    el.className = "wrong-item";
    el.innerHTML = `
      <span class="wrong-id">${escapeHtml(p.id || "?")}</span>
      <div>
        <div class="wrong-note">${escapeHtml(p.note || "(메모 없음)")}</div>
        <div class="wrong-date">${tag}${p.date}</div>
      </div>`;
    box.appendChild(el);
  });
}

function renderTrend(entries) {
  const box = $("trend");
  box.innerHTML = "";
  const recent = entries.slice(-7);
  if (!recent.length) { box.innerHTML = '<p class="empty">기록 없음</p>'; return; }
  const maxMin = Math.max(...recent.map((e) => e.studyMin || 0), 1);
  const color = recent.length ? userColor(userOf(recent[0])) : "var(--accent)";

  recent.forEach((e) => {
    const pct = Math.round(((e.studyMin || 0) / maxMin) * 100);
    const acc = e.dumps ? Math.round((e.correct / e.dumps) * 100) : null;
    const row = document.createElement("div");
    row.className = "trend-row";
    row.innerHTML = `
      <span class="trend-date">${e.date.slice(5)}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.max(pct, 8)}%;background:${color}">${fmtMinutes(e.studyMin)}</div>
      </div>
      <span class="trend-meta">덤프 <b>${e.dumps ?? 0}</b> · 정답률 <b>${acc === null ? "–" : acc + "%"}</b></span>`;
    box.appendChild(row);
  });
}

function renderTrendCombined() {
  const box = $("trend");
  box.innerHTML = "";

  const dates = [...new Set(ALL.map((e) => e.date))].sort().slice(-7);
  const maxMin = Math.max(...ALL.map((e) => e.studyMin || 0), 1);

  // 범례
  const legend = document.createElement("div");
  legend.className = "trend-legend";
  legend.innerHTML = USERS.map((u) => `${dot(u)}${escapeHtml(u)}`).join("");
  box.appendChild(legend);

  if (!dates.length) { box.insertAdjacentHTML("beforeend", '<p class="empty">기록 없음</p>'); return; }

  dates.forEach((date) => {
    const row = document.createElement("div");
    row.className = "trend-c-row";
    const bars = USERS.map((u, i) => {
      const e = ALL.find((x) => userOf(x) === u && x.date === date);
      const pct = Math.round(((e?.studyMin || 0) / maxMin) * 100);
      const fill = e
        ? `<div class="bar-fill ${i === 0 ? "" : "u1"}" style="width:${Math.max(pct, 6)}%;background:${userColor(u)}">${fmtMinutes(e.studyMin)}</div>`
        : `<span class="empty" style="font-size:11px">기록 없음</span>`;
      return `<div class="trend-c-bar"><span class="trend-c-name">${dot(u)}</span><div class="bar-track">${fill}</div></div>`;
    }).join("");
    row.innerHTML = `<span class="trend-date">${date.slice(5)}</span><div class="trend-c-bars">${bars}</div>`;
    box.appendChild(row);
  });
}

/* ── 둘이 비교 카드 (항상 전체) ───────────────────────── */
function renderCompare() {
  const box = $("compareTable");
  box.innerHTML = "";
  const allDates = [...new Set(ALL.map((e) => e.date))].sort();
  const cutoff = allDates.slice(-7)[0];

  const rows = USERS.map((u) => {
    const es = ALL.filter((e) => userOf(e) === u && e.date >= cutoff);
    const min = es.reduce((s, e) => s + (e.studyMin || 0), 0);
    const dumps = es.reduce((s, e) => s + (e.dumps || 0), 0);
    const correct = es.reduce((s, e) => s + (e.correct || 0), 0);
    return { u, min, dumps, correct, acc: dumps ? Math.round((correct / dumps) * 100) : null, streak: streakOf(es) };
  });
  const maxMin = Math.max(...rows.map((r) => r.min), 1);
  const maxDumps = Math.max(...rows.map((r) => r.dumps), 1);
  const maxAcc = Math.max(...rows.map((r) => r.acc ?? 0), 1);

  const head = document.createElement("div");
  head.className = "cmp-row cmp-head";
  head.innerHTML = `<span>이름</span><span>공부시간</span><span>덤프</span><span>정답률</span><span>연속</span>`;
  box.appendChild(head);

  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "cmp-row" + (r.u === view ? " cmp-me" : "");
    const lead = (v, mx) => (v >= mx && mx > 1 ? " lead" : "");
    row.innerHTML = `
      <span class="cmp-name">${dot(r.u)}${escapeHtml(r.u)}${r.u === view ? " <em>보는중</em>" : ""}</span>
      <span class="cmp-val${lead(r.min, maxMin)}">${fmtMinutes(r.min)}</span>
      <span class="cmp-val${lead(r.dumps, maxDumps)}">${r.dumps}</span>
      <span class="cmp-val${lead(r.acc ?? 0, maxAcc)}">${r.acc === null ? "–" : r.acc + "%"}</span>
      <span class="cmp-val">${r.streak}일 🔥</span>`;
    box.appendChild(row);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── 데이터 로드 ──────────────────────────────────────── */
async function load() {
  try {
    const res = await fetch(LOG_FILE + "?v=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    ALL = parseLog(await res.text());
    renderAll();
  } catch (err) {
    console.warn("로그 fetch 실패 (file:// 환경일 수 있음):", err.message);
    $("loadFallback").classList.remove("hidden");
    $("filePicker").addEventListener("change", (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { $("loadFallback").classList.add("hidden"); ALL = parseLog(reader.result); renderAll(); };
      reader.readAsText(file);
    });
  }
}

/* ── 타이머 ───────────────────────────────────────────── */
let timerSec = 0, timerId = null;
function paintTimer() {
  const h = Math.floor(timerSec / 3600), m = Math.floor((timerSec % 3600) / 60), s = timerSec % 60;
  $("timerDisplay").textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function startTimer() { if (!timerId) timerId = setInterval(() => { timerSec++; paintTimer(); }, 1000); }
function pauseTimer() { clearInterval(timerId); timerId = null; $("fStudyMin").value = Math.round(timerSec / 60); }
function resetTimer() { pauseTimer(); timerSec = 0; paintTimer(); }

/* ── 입력폼 → JSONL 한 줄 ─────────────────────────────── */
function parseProblems(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\S+)\s+([oOxX])\s*(.*)$/);
    if (!m) return { id: line, ok: false, note: "" };
    return { id: m[1], ok: /[oO]/.test(m[2]), note: m[3].trim() };
  });
}
function buildEntry() {
  const studyMin = parseInt($("fStudyMin").value, 10);
  const dumps = parseInt($("fDumps").value, 10);
  const correct = parseInt($("fCorrect").value, 10);
  const problems = parseProblems($("fProblems").value);

  const entry = {};
  entry.user = $("fUser").value.trim() || (view && view !== ALL_VIEW ? view : USERS[0]) || "나";
  entry.date = todayStr();
  if (!isNaN(studyMin)) entry.studyMin = studyMin;
  else if (timerSec > 0) entry.studyMin = Math.round(timerSec / 60);
  if ($("fLecture").value.trim()) entry.lecture = $("fLecture").value.trim();
  if (!isNaN(dumps)) entry.dumps = dumps;
  if (!isNaN(correct)) entry.correct = correct;
  if (problems.length) entry.problems = problems;
  if ($("fConfusing").value.trim()) entry.confusing = $("fConfusing").value.trim();
  return JSON.stringify(entry);
}

/* ── 초기화 ───────────────────────────────────────────── */
function init() {
  paintTimer();
  $("tStart").addEventListener("click", startTimer);
  $("tPause").addEventListener("click", pauseTimer);
  $("tReset").addEventListener("click", resetTimer);
  window.addEventListener("resize", moveIndicator);

  $("entryForm").addEventListener("submit", (e) => {
    e.preventDefault();
    $("outLine").textContent = buildEntry();
    $("outBox").classList.remove("hidden");
    $("outBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  $("copyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("outLine").textContent);
      $("copyBtn").textContent = "✅ 복사됨";
      setTimeout(() => ($("copyBtn").textContent = "📋 복사"), 1500);
    } catch {
      const range = document.createRange();
      range.selectNodeContents($("outLine"));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }
  });

  load();
}
document.addEventListener("DOMContentLoaded", init);
