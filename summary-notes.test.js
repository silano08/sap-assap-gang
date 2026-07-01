const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createSummaryNote,
  addSummaryNote,
  loadSummaryNotes,
  clearSummaryNotes,
  filterSummaryNotes,
  markdownToHtml,
  removeSummaryNote,
  mergeSummaryNotes,
  upsertSummaryNote,
  markSummaryNoteDeleted,
  filterDeletedSummaryNotes,
  filterSummaryNotesBySection,
  MISC_SECTION_ID,
  updateSummaryNote,
} = require("./summary-notes");

function fakeStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

test("addSummaryNote stores notes newest first and keeps the selected user", () => {
  const storage = fakeStorage();
  const first = createSummaryNote({ user: "가연", title: "IAM", content: "# IAM\n정리", now: "2026-06-28T01:00:00.000Z" });
  const second = createSummaryNote({ user: "소울", title: "SCP", content: "SCP 정리", now: "2026-06-28T02:00:00.000Z" });

  addSummaryNote(storage, first);
  addSummaryNote(storage, second);

  assert.deepEqual(loadSummaryNotes(storage).map((note) => note.title), ["SCP", "IAM"]);
  assert.deepEqual(filterSummaryNotes(loadSummaryNotes(storage), "가연").map((note) => note.title), ["IAM"]);
});

test("createSummaryNote falls back to a date title and trims content", () => {
  const note = createSummaryNote({ user: "가연", title: "", sectionId: "section-3", content: "  내용  ", now: "2026-06-28T03:00:00.000Z" });

  assert.equal(note.title, "2026-06-28 요약");
  assert.equal(note.content, "내용");
  assert.equal(note.date, "2026-06-28");
  assert.equal(note.sectionId, "section-3");
});

test("clearSummaryNotes removes stored summaries", () => {
  const storage = fakeStorage();
  addSummaryNote(storage, createSummaryNote({ user: "가연", title: "IAM", content: "내용", now: "2026-06-28T01:00:00.000Z" }));

  clearSummaryNotes(storage);

  assert.deepEqual(loadSummaryNotes(storage), []);
});

test("removeSummaryNote deletes only the matching note id", () => {
  const storage = fakeStorage();
  addSummaryNote(storage, { id: "keep", user: "가연", date: "2026-06-28", title: "남길 요약", content: "남김", createdAt: "2026-06-28T01:00:00.000Z" });
  addSummaryNote(storage, { id: "delete", user: "가연", date: "2026-06-28", title: "지울 요약", content: "삭제", createdAt: "2026-06-28T02:00:00.000Z" });

  assert.equal(removeSummaryNote(storage, "delete"), true);

  assert.deepEqual(loadSummaryNotes(storage).map((note) => note.id), ["keep"]);
});

test("deleted summary ids hide remote notes after refresh", () => {
  const storage = fakeStorage();
  const notes = [
    { id: "remote", user: "가연", date: "2026-06-28", sectionId: "section-3", title: "원격", content: "remote", createdAt: "2026-06-28T01:00:00.000Z" },
    { id: "keep", user: "가연", date: "2026-06-28", sectionId: "section-4", title: "유지", content: "keep", createdAt: "2026-06-28T02:00:00.000Z" },
  ];

  markSummaryNoteDeleted(storage, "remote");

  assert.deepEqual(filterDeletedSummaryNotes(notes, storage).map((note) => note.id), ["keep"]);
});

test("filterSummaryNotesBySection keeps notes under their lecture section", () => {
  const notes = [
    { id: "s3", user: "가연", sectionId: "section-3", title: "IAM", content: "iam", createdAt: "2026-06-28T01:00:00.000Z" },
    { id: "s4", user: "가연", sectionId: "section-4", title: "KMS", content: "kms", createdAt: "2026-06-28T02:00:00.000Z" },
  ];

  assert.deepEqual(filterSummaryNotesBySection(notes, "section-3").map((note) => note.id), ["s3"]);
});

test("legacy summary notes without sectionId are treated as misc", () => {
  const storage = fakeStorage();
  storage.setItem("sap-summary-notes-v1", JSON.stringify([
    { id: "legacy", user: "가연", date: "2026-06-28", title: "예전 요약", content: "legacy", createdAt: "2026-06-28T01:00:00.000Z" },
  ]));

  const notes = loadSummaryNotes(storage);

  assert.equal(MISC_SECTION_ID, "misc");
  assert.equal(notes[0].sectionId, "misc");
  assert.deepEqual(filterSummaryNotesBySection(notes, "misc").map((note) => note.id), ["legacy"]);
});

test("mergeSummaryNotes combines remote and local notes by id with local winning", () => {
  const remote = [
    { id: "same", user: "가연", date: "2026-06-28", title: "원격", content: "remote", createdAt: "2026-06-28T01:00:00.000Z" },
    { id: "remote", user: "소울", date: "2026-06-28", title: "원격만", content: "remote only", createdAt: "2026-06-28T02:00:00.000Z" },
  ];
  const local = [
    { id: "same", user: "가연", date: "2026-06-28", title: "로컬", content: "local", createdAt: "2026-06-28T03:00:00.000Z" },
  ];

  const merged = mergeSummaryNotes(remote, local);

  assert.deepEqual(merged.map((note) => note.id), ["same", "remote"]);
  assert.equal(merged[0].title, "로컬");
});

test("upsertSummaryNote inserts newest note first and replaces matching id", () => {
  const notes = [
    { id: "old", user: "가연", date: "2026-06-28", title: "기존", content: "old", createdAt: "2026-06-28T01:00:00.000Z" },
  ];

  const inserted = upsertSummaryNote(notes, { id: "new", user: "가연", date: "2026-06-28", title: "새 노트", content: "new", createdAt: "2026-06-28T02:00:00.000Z" });
  const replaced = upsertSummaryNote(inserted, { id: "old", user: "가연", date: "2026-06-28", title: "수정", content: "changed", createdAt: "2026-06-28T03:00:00.000Z" });

  assert.deepEqual(inserted.map((note) => note.id), ["new", "old"]);
  assert.equal(replaced.find((note) => note.id === "old").title, "수정");
});

test("updateSummaryNote preserves id and owner while changing editable fields", () => {
  const notes = [
    {
      id: "note-1",
      user: "가연",
      date: "2026-06-28",
      sectionId: "section-3",
      title: "IAM",
      content: "old",
      createdAt: "2026-06-28T01:00:00.000Z",
    },
  ];

  const updated = updateSummaryNote(notes, "note-1", {
    sectionId: "misc",
    title: "수정한 요약",
    content: "new",
    now: "2026-07-01T01:00:00.000Z",
  });

  assert.equal(updated[0].id, "note-1");
  assert.equal(updated[0].user, "가연");
  assert.equal(updated[0].date, "2026-06-28");
  assert.equal(updated[0].sectionId, "misc");
  assert.equal(updated[0].title, "수정한 요약");
  assert.equal(updated[0].content, "new");
  assert.equal(updated[0].updatedAt, "2026-07-01T01:00:00.000Z");
});

test("markdownToHtml renders common markdown blocks safely", () => {
  const html = markdownToHtml([
    "# IAM",
    "",
    "- Role은 임시 권한",
    "- **SCP**는 상한선",
    "",
    "> 시험 포인트",
    "",
    "`code`와 <script>alert(1)</script>",
  ].join("\n"));

  assert.match(html, /<h3>IAM<\/h3>/);
  assert.match(html, /<ul><li>Role은 임시 권한<\/li><li><strong>SCP<\/strong>는 상한선<\/li><\/ul>/);
  assert.match(html, /<blockquote>시험 포인트<\/blockquote>/);
  assert.match(html, /<code>code<\/code>와 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("markdownToHtml renders fenced code blocks", () => {
  const html = markdownToHtml("```json\n{\"Effect\":\"Allow\"}\n```");

  assert.equal(html, '<pre><code>{&quot;Effect&quot;:&quot;Allow&quot;}</code></pre>');
});
