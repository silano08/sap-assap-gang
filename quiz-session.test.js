const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isCorrectAnswer,
  summarizeAttempts,
  buildWrongProblemLines,
  buildSavePreview,
  applyQuizSummaryToEntry,
} = require("./quiz-session");

test("isCorrectAnswer accepts multi answers regardless of order", () => {
  assert.equal(isCorrectAnswer(["C", "A", "F"], ["A", "C", "F"]), true);
  assert.equal(isCorrectAnswer(["A", "F"], ["A", "C", "F"]), false);
  assert.equal(isCorrectAnswer(["A", "C", "E"], ["A", "C", "F"]), false);
});

test("summarizeAttempts counts unique attempted questions and correct answers", () => {
  const attempts = new Map([
    [1, { number: 1, selected: ["A"], answer: ["A"], correct: true }],
    [2, { number: 2, selected: ["B"], answer: ["C"], correct: false }],
    [3, { number: 3, selected: ["A", "C"], answer: ["A", "C"], correct: true }],
  ]);

  assert.deepEqual(summarizeAttempts(attempts), { dumps: 3, correct: 2, wrong: 1 });
});

test("buildWrongProblemLines returns only wrong attempts for the entry form", () => {
  const attempts = new Map([
    [1, { number: 1, selected: ["A"], answer: ["A"], correct: true }],
    [2, { number: 2, selected: ["B"], answer: ["C"], correct: false, note: "RDS 백업 조건 헷갈림" }],
    [3, { number: 3, selected: [], answer: ["A", "D"], correct: false }],
  ]);

  assert.deepEqual(buildWrongProblemLines(attempts), [
    "Q2 x 선택 B / 정답 C / 메모 RDS 백업 조건 헷갈림",
    "Q3 x 선택 없음 / 정답 A, D",
  ]);
});

test("buildSavePreview summarizes pending session for the save tooltip", () => {
  const attempts = new Map([
    [1, { number: 1, selected: ["A"], answer: ["A"], correct: true }],
    [2, { number: 2, selected: ["B"], answer: ["C"], correct: false, note: "조건 오독" }],
  ]);

  assert.deepEqual(buildSavePreview(attempts), {
    disabled: false,
    lines: [
      "푼 문제 2개",
      "정답 1개 · 오답 1개",
      "오답: Q2 x 선택 B / 정답 C / 메모 조건 오독",
    ],
  });
});

test("buildSavePreview explains disabled save state", () => {
  assert.deepEqual(buildSavePreview(new Map()), {
    disabled: true,
    lines: ["정답 보기를 누른 문제부터 저장할 수 있어요."],
  });
});

test("applyQuizSummaryToEntry increments today's dump stats and appends wrong notes", () => {
  const entry = {
    user: "가연",
    date: "2026-06-28",
    dumps: 10,
    correct: 7,
    problems: [{ id: "Q1", ok: false, note: "기존 오답" }],
  };

  const next = applyQuizSummaryToEntry(entry, {
    dumps: 3,
    correct: 2,
    wrongLines: ["Q2 x 선택 B / 정답 C"],
  });

  assert.equal(next.dumps, 13);
  assert.equal(next.correct, 9);
  assert.deepEqual(next.problems, [
    { id: "Q1", ok: false, note: "기존 오답" },
    { id: "Q2", ok: false, note: "선택 B / 정답 C" },
  ]);
});
