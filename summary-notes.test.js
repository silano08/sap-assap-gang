const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createSummaryNote,
  addSummaryNote,
  loadSummaryNotes,
  clearSummaryNotes,
  filterSummaryNotes,
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
  const note = createSummaryNote({ user: "가연", title: "", content: "  내용  ", now: "2026-06-28T03:00:00.000Z" });

  assert.equal(note.title, "2026-06-28 요약");
  assert.equal(note.content, "내용");
  assert.equal(note.date, "2026-06-28");
});

test("clearSummaryNotes removes stored summaries", () => {
  const storage = fakeStorage();
  addSummaryNote(storage, createSummaryNote({ user: "가연", title: "IAM", content: "내용", now: "2026-06-28T01:00:00.000Z" }));

  clearSummaryNotes(storage);

  assert.deepEqual(loadSummaryNotes(storage), []);
});
