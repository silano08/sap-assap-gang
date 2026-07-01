const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SECTIONS,
  loadProgress,
  saveProgress,
  updateProgress,
  progressForUser,
  compareProgress,
} = require("./study-plan");

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

test("SECTIONS keeps the SAP curriculum order", () => {
  assert.equal(SECTIONS[0].id, "section-2");
  assert.equal(SECTIONS[0].title, "슬라이드 다운로드");
  assert.equal(SECTIONS.at(-1).id, "dump");
});

test("updateProgress stores the current section and lecture per user", () => {
  const storage = fakeStorage();

  const progress = updateProgress(storage, {
    user: "가연",
    sectionId: "section-5",
    lecture: 7,
    done: false,
    updatedAt: "2026-07-01T12:00:00.000Z",
  });

  assert.equal(progressForUser(progress, "가연").sectionId, "section-5");
  assert.equal(progressForUser(progress, "가연").lecture, 7);
  assert.deepEqual(loadProgress(storage), progress);
});

test("compareProgress returns each user's section position", () => {
  const storage = fakeStorage();
  saveProgress(storage, [
    { user: "가연", sectionId: "section-5", lecture: 3, done: false, updatedAt: "2026-07-01T10:00:00.000Z" },
    { user: "소울", sectionId: "section-4", lecture: 29, done: true, updatedAt: "2026-07-01T11:00:00.000Z" },
  ]);

  const rows = compareProgress(loadProgress(storage), ["가연", "소울"]);

  assert.deepEqual(rows.map((row) => row.user), ["가연", "소울"]);
  assert.equal(rows[0].section.title, "컴퓨팅(Compute) & 로드 밸런싱");
  assert.equal(rows[0].percent, 11);
  assert.equal(rows[1].done, true);
});
