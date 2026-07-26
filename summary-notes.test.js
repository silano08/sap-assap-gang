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
  buildSummaryLibrary,
  MISC_SECTION_ID,
  updateSummaryNote,
  splitSummaryContent,
  createChunkedSummaryNote,
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

test("buildSummaryLibrary searches notes and groups them by lecture section order", () => {
  const notes = [
    { id: "misc", user: "가연", date: "2026-06-28", sectionId: "misc", title: "기타 메모", content: "prefix list", createdAt: "2026-06-28T03:00:00.000Z" },
    { id: "security", user: "가연", date: "2026-06-28", sectionId: "section-4", title: "KMS", content: "암호화", createdAt: "2026-06-28T02:00:00.000Z" },
    { id: "iam", user: "가연", date: "2026-06-28", sectionId: "section-3", title: "IAM", content: "SCP와 권한 평가", createdAt: "2026-06-28T01:00:00.000Z" },
  ];

  const library = buildSummaryLibrary(notes, {
    query: "권한",
    sections: [
      { id: "section-3", title: "자격 증명" },
      { id: "section-4", title: "보안" },
      { id: "misc", title: "기타" },
    ],
  });

  assert.deepEqual(library.groups.map((group) => group.id), ["section-3"]);
  assert.deepEqual(library.groups[0].notes.map((note) => note.id), ["iam"]);
  assert.equal(library.total, 1);
});

test("buildSummaryLibrary filters by section and keeps newest notes first inside the section", () => {
  const notes = [
    { id: "old", user: "가연", date: "2026-06-28", sectionId: "section-5", title: "EC2", content: "old", createdAt: "2026-06-28T01:00:00.000Z" },
    { id: "new", user: "가연", date: "2026-06-29", sectionId: "section-5", title: "Lambda", content: "new", createdAt: "2026-06-29T01:00:00.000Z" },
    { id: "other", user: "가연", date: "2026-06-29", sectionId: "section-6", title: "S3", content: "other", createdAt: "2026-06-29T02:00:00.000Z" },
  ];

  const library = buildSummaryLibrary(notes, {
    sectionId: "section-5",
    sections: [
      { id: "section-5", title: "컴퓨팅" },
      { id: "section-6", title: "스토리지" },
    ],
  });

  assert.deepEqual(library.groups.map((group) => group.id), ["section-5"]);
  assert.deepEqual(library.groups[0].notes.map((note) => note.id), ["new", "old"]);
  assert.equal(library.total, 2);
});

test("buildSummaryLibrary can search externally loaded chunk content", () => {
  const notes = [
    {
      id: "chunked",
      user: "가연",
      date: "2026-07-07",
      sectionId: "section-5",
      title: "큰 요약",
      content: "",
      contentPreview: "앞부분",
      contentRef: { type: "chunks", paths: ["summary-chunks/chunked-001.md"] },
      createdAt: "2026-07-07T01:00:00.000Z",
    },
  ];

  const library = buildSummaryLibrary(notes, {
    query: "PrivateLink",
    sections: [{ id: "section-5", title: "컴퓨팅" }],
    contentById: new Map([["chunked", "본문 전체에 PrivateLink 설명이 있음"]]),
  });

  assert.equal(library.total, 1);
  assert.equal(library.groups[0].notes[0].id, "chunked");
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

test("markdownToHtml renders markdown tables", () => {
  const html = markdownToHtml([
    "| 서비스 | 포인트 |",
    "| --- | --- |",
    "| `Lambda` | **15분** 제한 |",
    "| ECS | 컨테이너 실행 |",
  ].join("\n"));

  assert.match(html, /<table>/);
  assert.match(html, /<th>서비스<\/th>/);
  assert.match(html, /<td><code>Lambda<\/code><\/td>/);
  assert.match(html, /<td><strong>15분<\/strong> 제한<\/td>/);
  assert.doesNotMatch(html, /\| --- \| --- \|/);
});

test("markdownToHtml renders horizontal rules and ordered lists", () => {
  const html = markdownToHtml([
    "첫 문단",
    "",
    "----",
    "",
    "1. 첫째",
    "2. 둘째",
  ].join("\n"));

  assert.match(html, /<p>첫 문단<\/p><hr><ol><li>첫째<\/li><li>둘째<\/li><\/ol>/);
});

test("splitSummaryContent splits large markdown on line boundaries when possible", () => {
  const content = ["# Title", "A".repeat(10), "B".repeat(10), "C".repeat(10)].join("\n");

  const chunks = splitSummaryContent(content, 18);

  assert.deepEqual(chunks, ["# Title\nAAAAAAAAAA", "BBBBBBBBBB", "CCCCCCCCCC"]);
});

test("createChunkedSummaryNote stores large content as external chunk references", () => {
  const note = {
    id: "note-1",
    user: "가연",
    date: "2026-07-07",
    title: "큰 요약",
    content: "A".repeat(20),
    createdAt: "2026-07-07T01:00:00.000Z",
  };

  const chunked = createChunkedSummaryNote(note, { chunkSize: 8, baseDir: "summary-chunks" });

  assert.equal(chunked.note.content, "");
  assert.deepEqual(chunked.note.contentRef, {
    type: "chunks",
    paths: [
      "summary-chunks/note-1-001.md",
      "summary-chunks/note-1-002.md",
      "summary-chunks/note-1-003.md",
    ],
  });
  assert.deepEqual(chunked.files.map((file) => file.path), chunked.note.contentRef.paths);
  assert.deepEqual(chunked.files.map((file) => file.text), ["AAAAAAAA", "AAAAAAAA", "AAAA"]);
});
