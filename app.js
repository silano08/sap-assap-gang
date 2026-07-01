/* ===================================================================
   AWS SAP 스터디 트래커 — app.js
   - 저장된 학습 기록을 읽어 대시보드 렌더
   - 상단 토글: [가연] [소울] [합쳐서 보기] — 슬라이딩 + 페이지 전환 효과
   - 개인 뷰에서 문제풀이 세션을 저장하면 오늘 기록에 자동 반영
   - 합쳐서 보기는 비교 전용
   백엔드 없음. 정적 페이지에서 브라우저 저장과 선택적 GitHub 커밋을 사용.
=================================================================== */

const LOG_FILE = "study-log.jsonl";
const SUMMARY_FILE = "summary-notes.json";
const ALL_VIEW = "__ALL__";
const DEFAULT_USERS = ["가연", "소울"]; // 로그가 비어도 토글에 항상 표시
const PALETTE = ["#ff9900", "#2f6fed", "#1a8754", "#c026d3"]; // 유저별 색

let ALL = [];        // 화면에 쓰는 전체 = 커밋로그 + 로컬임시
let LOG = [];        // 커밋된 로그(study-log.jsonl)만
let REMOTE_SUMMARIES = [];
let USERS = [];      // 정렬된 유저 목록
let view = null;     // 현재 보기: 유저명 또는 ALL_VIEW
let segOrder = [];   // 토글 버튼 순서(값) — 전환 방향 계산용
let summaryEditingId = null;

const LS_KEY = "sap-local-entries-v1"; // 이 브라우저 임시 저장

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

/* ── 로컬 임시저장(localStorage) ──────────────────────────
   정적사이트라 파일에 직접 못 씀 → 이 브라우저에만 저장.
   커밋된 기록에 같은 (이름+날짜) 가 들어오면 그게 우선이고
   로컬 임시본은 자동으로 정리됨(중복 방지). =================== */
const keyOf = (e) => userOf(e) + "|" + e.date;

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function saveLocal(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) { console.warn("localStorage 저장 실패:", e); }
}
function upsertLocal(entry) { // 같은 (이름+날짜) 있으면 교체
  const arr = loadLocal().filter((e) => keyOf(e) !== keyOf(entry));
  arr.push(entry);
  saveLocal(arr);
}
function removeLocal(entry) {
  saveLocal(loadLocal().filter((e) => keyOf(e) !== keyOf(entry)));
}
function clearLocal() { saveLocal([]); }

// 커밋로그 + 로컬임시 합치기. 브라우저에서 방금 저장한 퀴즈 결과가 우선 보인다.
function mergeLocal(logEntries) {
  const local = loadLocal();
  const localKeys = new Set(local.map(keyOf));
  return [...logEntries.filter((e) => !localKeys.has(keyOf(e))), ...local].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function refreshData() { ALL = mergeLocal(LOG); }

/* ── GitHub API 자동 커밋 ─────────────────────────────────
   정적사이트지만 브라우저가 GitHub REST API 로 직접 커밋.
   토큰은 이 브라우저(localStorage)에만 저장 — 코드/깃엔 절대 없음.
   토큰은 fine-grained, 이 레포만 Contents:RW 권장. ============= */
const GH = { owner: "silano08", repo: "sap-assap-gang", branch: "main" };
const GH_TOKEN_KEY = "sap-gh-token";
const ghToken = () => localStorage.getItem(GH_TOKEN_KEY) || "";
const ghHeaders = () => ({
  "Authorization": "Bearer " + ghToken(),
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});
const b64encode = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

// 원문 텍스트에서 같은 (이름+날짜) 줄을 교체하고 새 줄 추가 (주석 보존)
function upsertLineInText(raw, entry) {
  const k = keyOf(entry);
  const kept = (raw || "").split("\n").filter((l) => {
    const t = l.trim();
    if (!t || t.startsWith("//")) return true;
    try { return keyOf(JSON.parse(t)) !== k; } catch { return true; }
  });
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  kept.push(JSON.stringify(entry));
  return kept.join("\n") + "\n";
}

async function ghGetFile(path) {
  const url = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${GH.branch}`;
  const res = await fetch(url, { headers: ghHeaders(), cache: "no-store" });
  if (res.status === 404) return { sha: null, text: "" };
  if (!res.ok) throw new Error(res.status === 401 ? "토큰 권한/만료 확인" : "GET " + res.status);
  const j = await res.json();
  return { sha: j.sha, text: b64decode(j.content || "") };
}

async function ghPutFile(path, text, sha, message) {
  const url = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${path}`;
  const body = { message, content: b64encode(text), branch: GH.branch };
  if (sha) body.sha = sha;
  return fetch(url, { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) });
}

// 최신본 받아 → 줄 교체 → 커밋. 충돌(409)나면 한 번 재시도.
async function commitEntry(entry) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha, text } = await ghGetFile(LOG_FILE);
    const newText = upsertLineInText(text, entry);
    const res = await ghPutFile(LOG_FILE, newText, sha, `log: ${userOf(entry)} ${entry.date}`);
    if (res.ok) { LOG = parseLog(newText); return true; }
    if (res.status === 409) continue; // 다른 사람이 먼저 커밋 → 다시
    throw new Error(res.status === 401 ? "토큰 권한/만료 확인" : "HTTP " + res.status);
  }
  throw new Error("커밋 충돌 — 다시 눌러줘");
}

function parseSummaryJson(text) {
  try {
    const parsed = JSON.parse(text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function summaryNotesForDisplay() {
  const merged = window.SapSummaryNotes.mergeSummaryNotes(REMOTE_SUMMARIES, window.SapSummaryNotes.loadSummaryNotes(localStorage));
  return window.SapSummaryNotes.filterDeletedSummaryNotes(merged, localStorage);
}

function writeLocalSummaryNotes(notes) {
  localStorage.setItem(window.SapSummaryNotes.KEY, JSON.stringify(notes));
}

async function commitSummaryNotes(nextNotes, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha, text } = await ghGetFile(SUMMARY_FILE);
    const remote = parseSummaryJson(text);
    const merged = window.SapSummaryNotes.mergeSummaryNotes(remote, nextNotes);
    const newText = JSON.stringify(merged, null, 2) + "\n";
    const res = await ghPutFile(SUMMARY_FILE, newText, sha, message);
    if (res.ok) {
      REMOTE_SUMMARIES = merged;
      writeLocalSummaryNotes(merged);
      return true;
    }
    if (res.status === 409) continue;
    throw new Error(res.status === 401 ? "토큰 권한/만료 확인" : "HTTP " + res.status);
  }
  throw new Error("커밋 충돌 — 다시 눌러줘");
}

async function commitSummaryDelete(id) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { sha, text } = await ghGetFile(SUMMARY_FILE);
    const remote = parseSummaryJson(text);
    const local = window.SapSummaryNotes.loadSummaryNotes(localStorage);
    const merged = window.SapSummaryNotes.mergeSummaryNotes(remote, local).filter((note) => note.id !== id);
    const newText = JSON.stringify(merged, null, 2) + "\n";
    const res = await ghPutFile(SUMMARY_FILE, newText, sha, "notes: delete summary");
    if (res.ok) {
      REMOTE_SUMMARIES = merged;
      writeLocalSummaryNotes(merged);
      return true;
    }
    if (res.status === 409) continue;
    throw new Error(res.status === 401 ? "토큰 권한/만료 확인" : "HTTP " + res.status);
  }
  throw new Error("커밋 충돌 — 다시 눌러줘");
}

function setCommitStatus(text, kind) {
  const el = $("commitStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "hint commit-status" + (kind ? " " + kind : "");
}
function updateGhState() {
  const el = $("ghState");
  if (!el) return;
  const on = !!ghToken();
  el.textContent = on ? "연결됨 ✓" : "미연결";
  el.classList.toggle("on", on);
}

/* ── 상단 토글 ────────────────────────────────────────── */
function buildToggle() {
  segOrder = [...USERS, ALL_VIEW];
  const labels = { [ALL_VIEW]: "합계" };

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

function activeEntryUser() {
  return view && view !== ALL_VIEW ? view : null;
}

function syncActiveUserUi() {
  const user = activeEntryUser();
  const quizButton = $("quizOpenBtn");
  if (quizButton) {
    quizButton.disabled = !user;
    quizButton.textContent = user ? `${user} 문제풀기` : "개인 탭에서 문제풀기";
    quizButton.title = user ? `${user}의 오늘 기록에 반영됩니다` : "가연 또는 소울 탭에서 문제풀이를 시작하세요";
  }
  const meta = $("quizModalMeta");
  if (meta) meta.textContent = user ? `${user}의 오늘 기록으로 자동 반영됩니다.` : "가연 또는 소울 탭에서 시작해주세요.";
  renderTimer();
  renderStudyPlan();
}

/* ── 전환 애니메이션 + 라우팅 ─────────────────────────── */
function renderView(dir = 1) {
  const root = $("viewRoot");
  root.classList.remove("view-left", "view-right");
  void root.offsetWidth; // 리플로우 → 애니메이션 재생
  root.classList.add(dir > 0 ? "view-right" : "view-left");

  // 합쳐서 보기 = 비교 전용
  const combined = view === ALL_VIEW;
  $("mainGrid").classList.add("solo");
  $("mainGrid").classList.toggle("hidden", combined);

  if (combined) renderCombined();
  else renderUser(view);
  renderCompare();
  syncActiveUserUi();
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
    $("mLecture").textContent = progressLabel(user);
    $("mConfusing").textContent = "문제풀기 버튼으로 첫 세션을 저장해보세요";
    $("streakNum").textContent = "0";
    renderSummaryNotes(user);
    renderTrend(mine);
    return;
  }

  $("heroDate").innerHTML = `${e.date === today ? "오늘" : "최근 기록"} · ${e.date} · ${dot(user)}${escapeHtml(user)}`;
  $("mTime").textContent = fmtMinutes(e.studyMin);
  $("mDumps").textContent = (e.dumps ?? 0) + "문제";
  const acc = e.dumps ? Math.round((e.correct / e.dumps) * 100) : null;
  $("mAcc").textContent = acc === null ? "–" : acc + "%";
  $("mWrong").textContent = (e.problems || []).filter((p) => p.ok === false).length + "개";
  $("mLecture").textContent = progressLabel(user) || e.lecture || "–";
  $("mConfusing").textContent = e.confusing || "기록 없음";

  $("streakNum").textContent = streakOf(mine);
  renderSummaryNotes(user);
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
    return `${dot(u)}${escapeHtml(u)} ${escapeHtml(progressLabel(u) || e?.lecture || "–")}`;
  }).join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  $("mConfusing").innerHTML = USERS.map((u) => {
    const e = ALL.find((x) => userOf(x) === u && x.date === day);
    return `${dot(u)}<b>${escapeHtml(u)}</b> ${escapeHtml(e?.confusing || "–")}`;
  }).join("<br>");

  $("streakNum").textContent = streakOf(ALL); // 둘 중 누구든 공부한 연속일
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

function renderSummaryNotes(user) {
  const box = $("summaryList");
  if (!box || !window.SapSummaryNotes) return;
  populateSummarySectionSelect($("summarySection"));
  const allNotes = summaryNotesForDisplay();
  const notes = window.SapSummaryNotes.filterSummaryNotes(allNotes, user);
  const canEdit = !!activeEntryUser();

  $("summaryCount").textContent = notes.length ? `${notes.length}개` : "";
  $("summarySaveBtn").disabled = !canEdit;
  $("summarySection").disabled = !canEdit;
  $("summaryTitle").disabled = !canEdit;
  $("summaryContent").disabled = !canEdit;
  $("summaryFile").disabled = !canEdit;
  if (!canEdit) setSummaryStatus("개인 탭에서 요약을 저장할 수 있어요.");

  box.innerHTML = "";
  if (!notes.length) {
    box.innerHTML = '<p class="empty">저장된 요약정리가 없어요.</p>';
    return;
  }

  summarySections().forEach((section) => {
    const sectionNotes = window.SapSummaryNotes.filterSummaryNotesBySection(notes, section.id);
    if (!sectionNotes.length) return;
    const group = document.createElement("details");
    group.className = "summary-section";
    group.open = true;
    group.innerHTML = `
      <summary>
        <span>${section.number ? `섹션 ${section.number}` : "Dump"} · ${escapeHtml(section.title)}</span>
        <span class="muted">${sectionNotes.length}개</span>
      </summary>
      <div class="summary-section-body"></div>
    `;
    const body = group.querySelector(".summary-section-body");
    sectionNotes.forEach((note, index) => {
    const detail = document.createElement("details");
    detail.className = "summary-note";
    if (index === 0) detail.open = true;
    const userTag = user ? "" : `${dot(note.user)}${escapeHtml(note.user)} · `;
    detail.innerHTML = `
      <summary>
        <span class="summary-note-title">${escapeHtml(note.title)}</span>
        <span class="summary-note-side">
          <span class="summary-note-meta">${userTag}${escapeHtml(note.date)}</span>
          <button class="summary-edit-btn" type="button" data-summary-edit="${escapeHtml(note.id)}" aria-label="${escapeHtml(note.title)} 수정">수정</button>
          <button class="summary-delete-btn" type="button" data-summary-delete="${escapeHtml(note.id)}" aria-label="${escapeHtml(note.title)} 삭제">삭제</button>
        </span>
      </summary>
      <div class="summary-note-content">${window.SapSummaryNotes.markdownToHtml(note.content)}</div>
    `;
    detail.querySelector("[data-summary-edit]")?.addEventListener("click", editSummaryNote);
    detail.querySelector("[data-summary-delete]")?.addEventListener("click", deleteSummaryNote);
      body.appendChild(detail);
    });
    box.appendChild(group);
  });
}

function setSummaryStatus(text, kind = "") {
  const el = $("summaryStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "hint" + (kind ? " " + kind : "");
}

async function loadSummaryFile(file) {
  if (!file) return;
  const text = await file.text();
  $("summaryTitle").value = file.name.replace(/\.(md|txt)$/i, "");
  $("summaryContent").value = text;
  setSummaryStatus(`${file.name} 불러옴`, "ok");
}

async function loadRemoteSummaries() {
  try {
    const res = await fetch(SUMMARY_FILE + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    REMOTE_SUMMARIES = parseSummaryJson(await res.text());
  } catch (err) {
    console.warn("요약정리 fetch 실패:", err.message);
    REMOTE_SUMMARIES = [];
  }
}

async function saveSummaryNote() {
  const user = activeEntryUser();
  if (!user) {
    setSummaryStatus("가연 또는 소울 탭에서 저장해주세요.", "err");
    return;
  }
  const content = $("summaryContent").value.trim();
  if (!content) {
    setSummaryStatus("저장할 요약 내용이 없어요.", "err");
    return;
  }
  const title = $("summaryTitle").value;
  const sectionId = $("summarySection").value;
  const nextLocalNotes = summaryEditingId
    ? window.SapSummaryNotes.updateSummaryNote(summaryNotesForDisplay(), summaryEditingId, { sectionId, title, content })
    : window.SapSummaryNotes.upsertSummaryNote(
      summaryNotesForDisplay(),
      window.SapSummaryNotes.createSummaryNote({ user, sectionId, title, content })
    );
  const note = summaryEditingId
    ? nextLocalNotes.find((item) => item.id === summaryEditingId)
    : nextLocalNotes[0];
  writeLocalSummaryNotes(nextLocalNotes);
  let synced = false;
  if (ghToken()) {
    setSummaryStatus(summaryEditingId ? "요약 수정 중..." : "요약 저장 중...", "pending");
    try {
      await commitSummaryNotes(nextLocalNotes, `notes: ${summaryEditingId ? "edit" : user} ${note.title}`);
      synced = true;
    } catch (err) {
      setSummaryStatus("원격 반영 실패: " + err.message + " · 브라우저에는 저장됐어요", "err");
    }
  }
  const wasEditing = !!summaryEditingId;
  resetSummaryForm();
  if (!ghToken()) setSummaryStatus(`${user} 요약 ${wasEditing ? "수정" : "저장"}됨 · 토큰 연결 시 원격에도 반영돼요`, "ok");
  else if (synced) setSummaryStatus(`${user} 요약 ${wasEditing ? "수정" : "저장"}됨 · 원격 반영 완료`, "ok");
  renderSummaryNotes(view === ALL_VIEW ? null : user);
}

function resetSummaryForm() {
  summaryEditingId = null;
  $("summaryTitle").value = "";
  $("summaryContent").value = "";
  $("summaryFile").value = "";
  if ($("summarySection") && window.SapSummaryNotes) $("summarySection").value = window.SapSummaryNotes.MISC_SECTION_ID;
  $("summarySaveBtn").textContent = "요약 저장";
  $("summaryCancelEditBtn")?.classList.add("hidden");
}

function editSummaryNote(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const id = ev.currentTarget.dataset.summaryEdit;
  const note = summaryNotesForDisplay().find((item) => item.id === id);
  if (!note) return;
  if (note.user !== activeEntryUser()) {
    setSummaryStatus("해당 사용자 탭에서만 수정할 수 있어요.", "err");
    return;
  }
  summaryEditingId = id;
  populateSummarySectionSelect($("summarySection"));
  $("summarySection").value = note.sectionId || window.SapSummaryNotes.MISC_SECTION_ID;
  $("summaryTitle").value = note.title;
  $("summaryContent").value = note.content;
  $("summarySaveBtn").textContent = "수정 저장";
  $("summaryCancelEditBtn")?.classList.remove("hidden");
  setSummaryStatus("요약을 수정하는 중이에요.", "pending");
  $("summaryContent").focus();
}

async function deleteSummaryNote(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const id = ev.currentTarget.dataset.summaryDelete;
  if (!id) return;
  if (!confirm("이 요약정리를 삭제할까요?")) return;
  const nextNotes = summaryNotesForDisplay().filter((note) => note.id !== id);
  if (nextNotes.length === summaryNotesForDisplay().length) return;
  REMOTE_SUMMARIES = REMOTE_SUMMARIES.filter((note) => note.id !== id);
  window.SapSummaryNotes.markSummaryNoteDeleted(localStorage, id);
  writeLocalSummaryNotes(nextNotes);
  if (ghToken()) {
    setSummaryStatus("요약정리 삭제 중...", "pending");
    try {
      await commitSummaryDelete(id);
      setSummaryStatus("요약정리를 삭제하고 원격에도 반영했어요.", "ok");
    } catch (err) {
      setSummaryStatus("원격 삭제 실패: " + err.message + " · 브라우저에서는 삭제됐어요", "err");
    }
  } else {
    setSummaryStatus("요약정리를 삭제했어요 · 토큰 연결 시 원격에도 반영돼요.", "ok");
  }
  renderSummaryNotes(activeEntryUser());
}

let timerTick = null;

function currentProgressFor(user) {
  return window.SapStudyPlan?.progressForUser(window.SapStudyPlan.loadProgress(localStorage), user) || null;
}

function progressLabel(user) {
  const progress = currentProgressFor(user);
  if (!progress || !window.SapStudyPlan) return "–";
  const section = window.SapStudyPlan.sectionById(progress.sectionId);
  const lecture = section.lectures ? ` ${progress.lecture}/${section.lectures}강` : "";
  return `섹션 ${section.number || ""} ${section.title}${lecture}${progress.done ? " · 완료" : ""}`.trim();
}

function renderTimer() {
  if (!window.SapStudyTimer) return;
  const user = activeEntryUser();
  const timer = window.SapStudyTimer.loadTimer(localStorage);
  const display = $("timerDisplay");
  const startBtn = $("timerStartBtn");
  const stopBtn = $("timerStopBtn");
  const clearBtn = $("timerClearBtn");
  if (!display || !startBtn || !stopBtn || !clearBtn) return;

  const isMine = !!timer && timer.user === user;
  const elapsed = timer ? window.SapStudyTimer.elapsedMinutes(timer.startedAt) : 0;
  const seconds = timer ? Math.max(0, Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 1000)) : 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  display.textContent = timer ? `${pad(h)}:${pad(m)}:${pad(s)}` : "00:00:00";

  $("timerOwner").textContent = timer ? `${timer.user} 타이머 실행 중` : (user ? `${user} 순공시간` : "개인 탭에서 사용");
  startBtn.disabled = !user || !!timer;
  stopBtn.disabled = !isMine;
  clearBtn.disabled = !isMine;

  if (!user) $("timerStatus").textContent = "가연 또는 소울 탭에서 타이머를 사용할 수 있어요.";
  else if (!timer) $("timerStatus").textContent = "시작 시각을 저장하고, 종료할 때 실제 경과 시간으로 오늘 공부시간에 더해요.";
  else if (isMine) $("timerStatus").textContent = `${timer.user} · ${fmtMinutes(elapsed)} 경과 중. 종료하면 오늘 공부시간에 누적됩니다.`;
  else $("timerStatus").textContent = `${timer.user} 타이머가 실행 중이라 ${user} 타이머는 잠시 사용할 수 없어요.`;
}

function startStudyTimer() {
  const user = activeEntryUser();
  if (!user || !window.SapStudyTimer) return;
  window.SapStudyTimer.startTimer(localStorage, user);
  renderTimer();
}

async function stopStudyTimer() {
  if (!window.SapStudyTimer) return;
  const stopped = window.SapStudyTimer.stopTimer(localStorage);
  if (!stopped || !stopped.user) return;
  if (stopped.elapsedMin <= 0) {
    renderTimer();
    return;
  }
  const entry = todayEntryFor(stopped.user);
  entry.studyMin = (entry.studyMin || 0) + stopped.elapsedMin;
  await saveQuizEntry(entry);
  setCommitStatus(`${stopped.user} 순공시간 ${fmtMinutes(stopped.elapsedMin)} 저장됨`, "ok");
  renderTimer();
}

function clearStudyTimer() {
  if (!window.SapStudyTimer) return;
  if (!confirm("실행 중인 타이머를 저장하지 않고 초기화할까요?")) return;
  window.SapStudyTimer.clearTimer(localStorage);
  renderTimer();
}

function ensureTimerTick() {
  if (timerTick) return;
  timerTick = setInterval(renderTimer, 1000);
}

function populateSectionSelect(select, includeAll = false) {
  if (!select || !window.SapStudyPlan) return;
  const current = select.value;
  select.innerHTML = [
    ...(includeAll ? ['<option value="">전체 섹션</option>'] : []),
    ...window.SapStudyPlan.SECTIONS.map((section) => (
      `<option value="${escapeHtml(section.id)}">${section.number ? `섹션 ${section.number}: ` : ""}${escapeHtml(section.title)}</option>`
    )),
  ].join("");
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function summarySections() {
  return [
    ...window.SapStudyPlan.SECTIONS,
    { id: window.SapSummaryNotes.MISC_SECTION_ID, number: null, title: "기타" },
  ];
}

function populateSummarySectionSelect(select) {
  if (!select || !window.SapStudyPlan || !window.SapSummaryNotes) return;
  const current = select.value || window.SapSummaryNotes.MISC_SECTION_ID;
  select.innerHTML = summarySections().map((section) => (
    `<option value="${escapeHtml(section.id)}">${section.number ? `섹션 ${section.number}: ` : ""}${escapeHtml(section.title)}</option>`
  )).join("");
  select.value = [...select.options].some((option) => option.value === current)
    ? current
    : window.SapSummaryNotes.MISC_SECTION_ID;
}

function renderStudyPlan() {
  if (!window.SapStudyPlan) return;
  const user = activeEntryUser();
  const progress = window.SapStudyPlan.loadProgress(localStorage);
  const rows = window.SapStudyPlan.compareProgress(progress, USERS);
  const controls = $("planControls");
  const sectionSelect = $("progressSection");
  const lectureInput = $("progressLecture");
  const doneInput = $("progressDone");
  const saveBtn = $("progressSaveBtn");
  const summary = $("planSummary");
  if (!controls || !sectionSelect || !lectureInput || !doneInput || !saveBtn) return;

  populateSectionSelect(sectionSelect);
  const mine = user ? window.SapStudyPlan.progressForUser(progress, user) : null;
  const section = window.SapStudyPlan.sectionById(mine?.sectionId || "section-3");
  sectionSelect.value = section.id;
  lectureInput.max = section.lectures || "";
  lectureInput.value = mine?.lecture ?? 0;
  doneInput.checked = !!mine?.done;
  controls.classList.toggle("hidden", !user);
  saveBtn.disabled = !user;
  summary.textContent = user ? `${user}: ${progressLabel(user)}` : "합계: 둘의 현재 위치 비교";

  renderProgressCompare(rows);
  renderSectionList(rows);
}

function renderProgressCompare(rows) {
  const box = $("progressCompare");
  if (!box) return;
  box.innerHTML = rows.map((row) => `
    <div class="progress-person ${row.user === view ? "active" : ""}">
      <div class="progress-person-top">
        <strong>${dot(row.user)}${escapeHtml(row.user)}</strong>
        <span>${row.percent}%</span>
      </div>
      <div class="progress-track"><span style="width:${Math.max(row.percent, 3)}%;background:${userColor(row.user)}"></span></div>
      <p>${row.progress ? `${row.section.number ? `섹션 ${row.section.number}` : "Dump"} · ${escapeHtml(row.section.title)} ${row.section.lectures ? `${row.lecture}/${row.section.lectures}강` : ""}` : "아직 진도 없음"}</p>
    </div>
  `).join("");
}

function renderSectionList(rows) {
  const box = $("sectionList");
  if (!box || !window.SapStudyPlan) return;
  const byUser = new Map(rows.map((row) => [row.user, row]));
  box.innerHTML = window.SapStudyPlan.SECTIONS.map((section) => {
    const marks = USERS.map((user) => {
      const row = byUser.get(user);
      const here = row?.section.id === section.id;
      return `<span class="section-user ${here ? "here" : ""}">${dot(user)}${escapeHtml(user)}${here ? ` ${row.lecture || 0}/${section.lectures || "-"}${row.done ? " 완료" : ""}` : ""}</span>`;
    }).join("");
    return `
      <div class="section-row">
        <div>
          <strong>${section.number ? `섹션 ${section.number}` : "Dump"}</strong>
          <span>${escapeHtml(section.title)}</span>
          <small>${section.lectures ? `${section.lectures}강 · ` : ""}${escapeHtml(section.duration)} · ${escapeHtml(section.estimate)}</small>
        </div>
        <div class="section-users">${marks}</div>
      </div>
    `;
  }).join("");
}

function saveStudyProgress() {
  const user = activeEntryUser();
  if (!user || !window.SapStudyPlan) return;
  const section = window.SapStudyPlan.sectionById($("progressSection").value);
  const lecture = Math.max(0, Math.min(Number($("progressLecture").value || 0), section.lectures || Number($("progressLecture").value || 0)));
  window.SapStudyPlan.updateProgress(localStorage, {
    user,
    sectionId: section.id,
    lecture,
    done: $("progressDone").checked,
    updatedAt: new Date().toISOString(),
  });
  $("progressStatus").textContent = `${user} 진도를 저장했어요.`;
  $("progressStatus").className = "hint ok";
  renderStudyPlan();
  renderUser(user);
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

/* ── DOCX 문제풀이 ───────────────────────────────────── */
const quiz = {
  questions: [],
  current: 0,
  selected: new Set(),
  revealed: false,
  source: "",
  savedAt: "",
  attempts: new Map(),
};

function setQuizStatus(text, kind = "") {
  const el = $("quizStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "quiz-status" + (kind ? " " + kind : "");
}

function loadQuizBank(questions, source, savedAt = "") {
  quiz.questions = Array.isArray(questions) ? questions : [];
  quiz.current = 0;
  quiz.selected = new Set();
  quiz.revealed = false;
  quiz.source = source || "저장된 문제은행";
  quiz.savedAt = savedAt;
  quiz.attempts = new Map();
  renderQuizBankState();
}

function renderQuizBankState() {
  const hasBank = !!quiz.questions.length;
  $("quizReady")?.classList.toggle("hidden", !hasBank);
  $("quizPlayArea")?.classList.toggle("hidden", !hasBank);
  $("quizClearCacheBtn")?.classList.toggle("hidden", !hasBank);
  if (hasBank) {
    $("quizCount").textContent = `${quiz.questions.length}문제`;
    $("quizSource").textContent = ` · ${quiz.source}`;
    $("quizCacheMeta").textContent = quiz.savedAt ? ` · 저장됨 ${quiz.savedAt.slice(0, 10)}` : "";
  }
}

function restoreCachedQuizBank() {
  if (!window.SapQuizCache) return false;
  const cached = window.SapQuizCache.loadQuizCache(localStorage);
  if (!cached) return false;
  loadQuizBank(cached.questions, cached.source, cached.savedAt);
  setQuizStatus(`저장된 문제은행 ${cached.count}문제를 불러왔어요.`, "ok");
  return true;
}

function clearCachedQuizBank() {
  window.SapQuizCache?.clearQuizCache(localStorage);
  quiz.questions = [];
  quiz.current = 0;
  quiz.selected = new Set();
  quiz.revealed = false;
  quiz.source = "";
  quiz.savedAt = "";
  quiz.attempts = new Map();
  $("quizFile").value = "";
  renderQuizBankState();
  renderQuizSavePreview();
  setQuizStatus("저장된 문제은행을 삭제했어요. DOCX를 다시 선택할 수 있습니다.", "ok");
}

async function loadQuizDocx(file) {
  if (!file) return;
  setQuizStatus("DOCX 읽는 중…", "loading");
  try {
    if (!window.JSZip) throw new Error("JSZip을 불러오지 못했어요. 인터넷 연결 또는 CDN 차단 여부를 확인해주세요.");
    if (!window.SapQuizParser) throw new Error("퀴즈 파서를 불러오지 못했어요.");
    const questions = await window.SapQuizParser.parseDocxFile(file, window.JSZip);
    if (!questions.length) throw new Error("문제 패턴을 찾지 못했어요. Q1, Answer: A 형식인지 확인해주세요.");

    const payload = window.SapQuizCache.createQuizCachePayload(file.name, questions);
    window.SapQuizCache.saveQuizCache(localStorage, payload);
    loadQuizBank(payload.questions, payload.source, payload.savedAt);
    $("quizModalMeta").textContent = `${questions.length}문제 · ${file.name} · ${activeEntryUser()} 기록`;
    setQuizStatus("문제를 불러오고 브라우저에 저장했어요.", "ok");
    showRandomQuizQuestion();
  } catch (err) {
    quiz.questions = [];
    renderQuizBankState();
    setQuizStatus("불러오기 실패: " + err.message, "err");
    renderQuizSavePreview();
  }
}

function openQuizModal() {
  if (!activeEntryUser()) {
    alert("가연 또는 소울 탭에서 문제풀이를 시작해주세요.");
    return;
  }
  $("quizModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
  syncActiveUserUi();
  if (quiz.questions.length) {
    renderQuizBankState();
    if (!quiz.attempts.size) showRandomQuizQuestion();
    else renderQuizQuestion();
  } else {
    renderQuizBankState();
    if (!restoreCachedQuizBank()) setQuizStatus("DOCX를 선택하면 바로 문제풀이가 시작됩니다.");
    if (quiz.questions.length) showRandomQuizQuestion();
    renderQuizSavePreview();
  }
}

function closeQuizModal() {
  $("quizModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function showRandomQuizQuestion() {
  if (!quiz.questions.length) return;
  quiz.current = Math.floor(Math.random() * quiz.questions.length);
  quiz.selected = new Set();
  quiz.revealed = false;
  renderQuizQuestion();
}

function jumpQuizQuestion() {
  const n = parseInt($("quizJump").value, 10);
  const idx = quiz.questions.findIndex((q) => q.number === n);
  if (idx < 0) {
    setQuizStatus(`Q${isNaN(n) ? "?" : n} 문제를 찾지 못했어요.`, "err");
    return;
  }
  quiz.current = idx;
  quiz.selected = new Set();
  quiz.revealed = false;
  setQuizStatus("문제를 이동했어요.", "ok");
  renderQuizQuestion();
}

function toggleQuizOption(label) {
  if (quiz.revealed) return;
  if (quiz.selected.has(label)) quiz.selected.delete(label);
  else quiz.selected.add(label);
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const q = quiz.questions[quiz.current];
  if (!q) return;

  $("quizNumber").textContent = `Q${q.number}`;
  $("quizProgress").textContent = `${quiz.current + 1} / ${quiz.questions.length}`;
  $("quizPrompt").textContent = q.prompt;

  const options = $("quizOptions");
  options.innerHTML = "";
  Object.entries(q.options).forEach(([label, text]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-option";
    if (quiz.selected.has(label)) btn.classList.add("selected");
    if (quiz.revealed && q.answer.includes(label)) btn.classList.add("correct");
    if (quiz.revealed && quiz.selected.has(label) && !q.answer.includes(label)) btn.classList.add("wrong");
    btn.innerHTML = `<span>${label}</span><b></b>`;
    btn.querySelector("b").textContent = text;
    btn.addEventListener("click", () => toggleQuizOption(label));
    options.appendChild(btn);
  });

  const answer = $("quizAnswer");
  const attempt = quiz.attempts.get(q.number);
  answer.classList.toggle("hidden", !quiz.revealed);
  answer.innerHTML = "";
  if (quiz.revealed) {
    const isWrong = attempt && !attempt.correct;
    answer.innerHTML = `
      <div><strong>정답: ${escapeHtml(q.answer.join(", "))}</strong></div>
      ${q.link ? `<div class="quiz-link"><a href="${escapeHtml(q.link)}" target="_blank" rel="noopener">토론 링크 열기</a></div>` : ""}
      ${q.explanation ? `<p>${escapeHtml(q.explanation)}</p>` : `<p class="muted">설명이 없는 문제입니다.</p>`}
      ${isWrong ? `
        <label class="quiz-wrong-note">
          <span>왜 틀렸는지 메모</span>
          <textarea id="quizWrongMemo" rows="3" placeholder="예: 조건에서 Multi-AZ가 아니라 read replica를 묻고 있었음">${escapeHtml(attempt.note || "")}</textarea>
        </label>` : ""}
    `;
    $("quizWrongMemo")?.addEventListener("input", (ev) => {
      const current = quiz.attempts.get(q.number);
      if (!current) return;
      current.note = ev.target.value;
      quiz.attempts.set(q.number, current);
      renderQuizSavePreview();
    });
  }
  renderQuizSessionStats();
}

function revealQuizAnswer() {
  const q = quiz.questions[quiz.current];
  if (!q) return;
  quiz.revealed = true;
  const selected = [...quiz.selected].sort();
  const correct = window.SapQuizSession.isCorrectAnswer(selected, q.answer);
  quiz.attempts.set(q.number, {
    number: q.number,
    selected,
    answer: q.answer,
    correct,
    note: quiz.attempts.get(q.number)?.note || "",
  });
  setQuizApplyButtonEnabled(true);
  renderQuizQuestion();
}

function renderQuizSessionStats() {
  const summary = window.SapQuizSession.summarizeAttempts(quiz.attempts);
  $("quizSessionSolved").textContent = `푼 문제 ${summary.dumps}`;
  $("quizSessionCorrect").textContent = `정답 ${summary.correct}`;
  $("quizSessionAccuracy").textContent = summary.dumps ? `정답률 ${Math.round((summary.correct / summary.dumps) * 100)}%` : "정답률 –";
  renderQuizSavePreview();
}

function renderQuizSavePreview() {
  const button = $("quizApplyBtn");
  const preview = $("quizSavePreview");
  if (!button || !preview) return;

  let state;
  try {
    state = buildQuizSavePreviewState();
  } catch (err) {
    state = {
      disabled: !quiz.attempts.size,
      lines: quiz.attempts.size
        ? [`푼 문제 ${quiz.attempts.size}개`, "세션 저장을 누르면 오늘 기록에 반영돼요."]
        : ["정답 보기를 누른 문제부터 저장할 수 있어요."],
    };
  }
  setQuizApplyButtonEnabled(!state.disabled);
  button.title = state.lines.join("\n");
  preview.innerHTML = `
    <strong>${state.disabled ? "아직 저장할 세션이 없어요" : "세션 저장 미리보기"}</strong>
    ${state.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
  `;
}

function setQuizApplyButtonEnabled(enabled) {
  const button = $("quizApplyBtn");
  if (!button) return;
  button.disabled = !enabled;
}

function buildQuizSavePreviewState() {
  if (window.SapQuizSession?.buildSavePreview) {
    return window.SapQuizSession.buildSavePreview(quiz.attempts);
  }

  const summary = window.SapQuizSession.summarizeAttempts(quiz.attempts);
  if (!summary.dumps) {
    return { disabled: true, lines: ["정답 보기를 누른 문제부터 저장할 수 있어요."] };
  }
  const wrongLines = window.SapQuizSession.buildWrongProblemLines(quiz.attempts);
  return {
    disabled: false,
    lines: [
      `푼 문제 ${summary.dumps}개`,
      `정답 ${summary.correct}개 · 오답 ${summary.wrong}개`,
      ...wrongLines.slice(0, 3).map((line) => `오답: ${line}`),
      ...(wrongLines.length > 3 ? [`오답 ${wrongLines.length - 3}개 더 있음`] : []),
    ],
  };
}

function todayEntryFor(user) {
  const date = todayStr();
  return ALL.find((entry) => userOf(entry) === user && entry.date === date)
    || LOG.find((entry) => userOf(entry) === user && entry.date === date)
    || { user, date };
}

async function saveQuizEntry(entry) {
  upsertLocal(entry);
  refreshData();
  view = userOf(entry);
  renderAll();
  updateLocalBadge();

  if (!ghToken()) {
    setCommitStatus("브라우저에 저장됨 · 깃 토큰을 연결하면 자동 커밋돼요", "");
    return;
  }

  setCommitStatus("깃 커밋 중...", "pending");
  try {
    await commitEntry(entry);
    removeLocal(entry);
    refreshData();
    renderAll();
    updateLocalBadge();
    setCommitStatus("깃에 커밋됨 · 다른 사람도 새로고침하면 보여요", "ok");
  } catch (err) {
    setCommitStatus("자동 커밋 실패: " + err.message + " · 브라우저 임시 기록에는 저장됐어요", "err");
  }
}

async function applyQuizSessionToEntry() {
  const user = activeEntryUser();
  if (!user) {
    setQuizStatus("가연 또는 소울 탭에서만 기록에 반영할 수 있어요.", "err");
    return;
  }
  const summary = window.SapQuizSession.summarizeAttempts(quiz.attempts);
  if (!summary.dumps) {
    setQuizStatus("아직 정답 보기를 누른 문제가 없어서 반영할 기록이 없어요.", "err");
    return;
  }

  const wrongLines = window.SapQuizSession.buildWrongProblemLines(quiz.attempts);
  const entry = window.SapQuizSession.applyQuizSummaryToEntry(todayEntryFor(user), { ...summary, wrongLines });
  await saveQuizEntry(entry);

  setQuizStatus(`${user} 오늘 기록에 ${summary.dumps}문제, 정답 ${summary.correct}개를 저장했어요.`, "ok");
  quiz.attempts = new Map();
  renderQuizSessionStats();
  closeQuizModal();
  document.querySelector(".hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initQuiz() {
  $("quizFile")?.addEventListener("change", (ev) => loadQuizDocx(ev.target.files[0]));
  $("quizClearCacheBtn")?.addEventListener("click", clearCachedQuizBank);
  $("quizOpenBtn")?.addEventListener("click", openQuizModal);
  $("quizCloseBtn")?.addEventListener("click", closeQuizModal);
  $("quizModalBackdrop")?.addEventListener("click", closeQuizModal);
  $("quizRandomBtn")?.addEventListener("click", showRandomQuizQuestion);
  $("quizNextBtn")?.addEventListener("click", showRandomQuizQuestion);
  $("quizRevealBtn")?.addEventListener("click", revealQuizAnswer);
  $("quizApplyBtn")?.addEventListener("click", applyQuizSessionToEntry);
  $("quizJumpBtn")?.addEventListener("click", jumpQuizQuestion);
  $("quizJump")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") jumpQuizQuestion();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !$("quizModal").classList.contains("hidden")) closeQuizModal();
  });
  restoreCachedQuizBank();
}

function initSummaryNotes() {
  $("summaryFile")?.addEventListener("change", (ev) => {
    loadSummaryFile(ev.target.files[0]).catch((err) => setSummaryStatus("파일 읽기 실패: " + err.message, "err"));
  });
  $("summarySaveBtn")?.addEventListener("click", saveSummaryNote);
  $("summaryCancelEditBtn")?.addEventListener("click", () => {
    resetSummaryForm();
    setSummaryStatus("수정을 취소했어요.");
  });
}

function initStudyTools() {
  $("timerStartBtn")?.addEventListener("click", startStudyTimer);
  $("timerStopBtn")?.addEventListener("click", () => {
    stopStudyTimer().catch((err) => setCommitStatus("타이머 저장 실패: " + err.message, "err"));
  });
  $("timerClearBtn")?.addEventListener("click", clearStudyTimer);
  $("progressSaveBtn")?.addEventListener("click", saveStudyProgress);
  $("progressSection")?.addEventListener("change", () => {
    const section = window.SapStudyPlan.sectionById($("progressSection").value);
    $("progressLecture").max = section.lectures || "";
    $("progressLecture").value = Math.min(Number($("progressLecture").value || 0), section.lectures || Number($("progressLecture").value || 0));
  });
  ensureTimerTick();
}

/* ── 데이터 로드 ──────────────────────────────────────── */
async function load() {
  try {
    await loadRemoteSummaries();
    const res = await fetch(LOG_FILE + "?v=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    LOG = parseLog(await res.text());
    refreshData();
    renderAll();
  } catch (err) {
    console.warn("기록 fetch 실패 (file:// 환경일 수 있음):", err.message);
    await loadRemoteSummaries();
    // 커밋로그를 못 읽어도 로컬 임시저장만으로 토글·대시보드는 보여줌
    LOG = [];
    refreshData();
    renderAll();
    $("loadFallback").classList.remove("hidden");
    $("filePicker")?.addEventListener("change", (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { $("loadFallback").classList.add("hidden"); LOG = parseLog(reader.result); refreshData(); renderAll(); };
      reader.readAsText(file);
    });
  }
}

function updateLocalBadge() {
  const n = loadLocal().length;
  const el = $("localBadge");
  if (!el) return;
  el.classList.toggle("hidden", n === 0);
  const cnt = $("localCount");
  if (cnt) cnt.textContent = n;
}

/* ── 초기화 ───────────────────────────────────────────── */
function init() {
  initQuiz();
  initSummaryNotes();
  initStudyTools();
  window.addEventListener("resize", moveIndicator);

  $("ghSaveBtn")?.addEventListener("click", () => {
    const t = $("ghToken").value.trim();
    if (!t) return;
    localStorage.setItem(GH_TOKEN_KEY, t);
    $("ghToken").value = "";
    updateGhState();
    setCommitStatus("토큰 저장됨 · 이제 문제풀이 세션 저장이 자동 커밋돼요", "ok");
  });
  $("ghClearBtn")?.addEventListener("click", () => {
    localStorage.removeItem(GH_TOKEN_KEY);
    updateGhState();
    setCommitStatus("토큰 해제됨 — 자동 커밋 끔", "");
  });

  $("clearLocalBtn")?.addEventListener("click", () => {
    if (!confirm("이 브라우저에 임시 저장된 기록을 모두 지울까요?\n(이미 동기화된 기록은 그대로예요)")) return;
    clearLocal();
    refreshData();
    renderAll();
    updateLocalBadge();
  });
  load();
  updateLocalBadge();
  updateGhState();
}
document.addEventListener("DOMContentLoaded", init);
