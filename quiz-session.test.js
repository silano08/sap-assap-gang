const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isCorrectAnswer,
  summarizeAttempts,
  buildWrongProblemLines,
  buildSavePreview,
  applyQuizSummaryToEntry,
  createWrongQuizRecord,
  upsertWrongQuizRecord,
  removeWrongQuizRecord,
  wrongRecordsForUser,
  mergeWrongQuizRecords,
  createQuizHistoryRecord,
  mergeQuizHistoryRecords,
  chooseNextRandomIndex,
  quizAttemptStorageKey,
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

test("wrong quiz records keep the original question and latest wrong attempt per user", () => {
  const question = {
    number: 48,
    prompt: "Aurora 성능 개선?",
    options: { A: "Cluster endpoint", B: "RDS Proxy" },
    answer: ["B"],
    explanation: "연결 풀링에는 RDS Proxy",
    link: "https://example.com/q48",
  };
  const first = createWrongQuizRecord({
    user: "가연",
    source: "SAP dump",
    question,
    attempt: { number: 48, selected: ["A"], answer: ["B"], correct: false, note: "엔드포인트 오독" },
    now: "2026-07-07T01:00:00.000Z",
  });
  const second = createWrongQuizRecord({
    user: "가연",
    source: "SAP dump",
    question,
    attempt: { number: 48, selected: ["A", "B"], answer: ["B"], correct: false, note: "복수 선택 실수" },
    now: "2026-07-07T02:00:00.000Z",
  });

  const records = upsertWrongQuizRecord([first], second);

  assert.equal(records.length, 1);
  assert.equal(records[0].id, "가연|SAP dump|48");
  assert.equal(records[0].question.prompt, "Aurora 성능 개선?");
  assert.deepEqual(records[0].selected, ["A", "B"]);
  assert.equal(records[0].note, "복수 선택 실수");
  assert.equal(records[0].wrongCount, 2);
});

test("wrong quiz records can be filtered by user and removed after a correct review", () => {
  const records = [
    { id: "가연|dump|1", user: "가연", source: "dump", number: 1, question: { number: 1 }, updatedAt: "2026-07-07T01:00:00.000Z" },
    { id: "소울|dump|2", user: "소울", source: "dump", number: 2, question: { number: 2 }, updatedAt: "2026-07-07T02:00:00.000Z" },
  ];

  assert.deepEqual(wrongRecordsForUser(records, "가연").map((record) => record.number), [1]);
  assert.deepEqual(removeWrongQuizRecord(records, "가연|dump|1").map((record) => record.id), ["소울|dump|2"]);
});

test("mergeWrongQuizRecords keeps the newest wrong record and applies deletions", () => {
  const remote = [
    { id: "가연|dump|1", user: "가연", source: "dump", number: 1, question: { number: 1 }, note: "old", updatedAt: "2026-07-07T01:00:00.000Z" },
    { id: "소울|dump|2", user: "소울", source: "dump", number: 2, question: { number: 2 }, note: "keep", updatedAt: "2026-07-07T01:00:00.000Z" },
  ];
  const local = [
    { id: "가연|dump|1", user: "가연", source: "dump", number: 1, question: { number: 1 }, note: "new", updatedAt: "2026-07-07T02:00:00.000Z" },
  ];

  const merged = mergeWrongQuizRecords(remote, local, { deletedIds: ["소울|dump|2"] });

  assert.deepEqual(merged.map((record) => record.id), ["가연|dump|1"]);
  assert.equal(merged[0].note, "new");
});

test("quiz history records persist latest answer per user source question and attempt type", () => {
  const question = {
    number: 7,
    prompt: "Lambda timeout?",
    options: { A: "15분", B: "1시간" },
    answer: ["A"],
  };
  const oldRecord = createQuizHistoryRecord({
    user: "가연",
    source: "SAP dump",
    mode: "random",
    question,
    attempt: { number: 7, selected: ["B"], answer: ["A"], correct: false, note: "헷갈림" },
    now: "2026-07-07T01:00:00.000Z",
  });
  const newRecord = createQuizHistoryRecord({
    user: "가연",
    source: "SAP dump",
    mode: "wrong",
    question,
    attempt: { number: 7, selected: ["A"], answer: ["A"], correct: true, note: "" },
    now: "2026-07-07T02:00:00.000Z",
  });

  const merged = mergeQuizHistoryRecords([oldRecord], [newRecord]);

  assert.equal(merged.length, 2);
  const wrongReview = merged.find((record) => record.attemptType === "wrong_review");
  const random = merged.find((record) => record.attemptType === "random");
  assert.equal(random.id, "가연|SAP dump|7|random");
  assert.equal(random.correct, false);
  assert.equal(random.wrongRecordAction, "created");
  assert.equal(wrongReview.id, "가연|SAP dump|7|wrong_review");
  assert.equal(wrongReview.correct, true);
  assert.equal(wrongReview.mode, "wrong");
  assert.equal(wrongReview.outcome, "correct");
  assert.equal(wrongReview.wrongRecordAction, "resolved");
  assert.equal(wrongReview.updatedAt, "2026-07-07T02:00:00.000Z");
});

test("quiz history records classify random wrong answers as new wrong records", () => {
  const record = createQuizHistoryRecord({
    user: "가연",
    source: "SAP dump",
    mode: "random",
    question: { number: 48, answer: ["B"] },
    attempt: { number: 48, selected: ["C"], answer: ["B"], correct: false },
    now: "2026-07-07T03:00:00.000Z",
  });

  assert.equal(record.attemptType, "random");
  assert.equal(record.id, "가연|SAP dump|48|random");
  assert.equal(record.outcome, "wrong");
  assert.equal(record.wrongRecordAction, "created");
});

test("quiz history records classify wrong-review misses as updated wrong records", () => {
  const record = createQuizHistoryRecord({
    user: "가연",
    source: "SAP dump",
    mode: "wrong",
    question: { number: 48, answer: ["B"] },
    attempt: { number: 48, selected: ["C"], answer: ["B"], correct: false },
    now: "2026-07-07T04:00:00.000Z",
  });

  assert.equal(record.attemptType, "wrong_review");
  assert.equal(record.id, "가연|SAP dump|48|wrong_review");
  assert.equal(record.outcome, "wrong");
  assert.equal(record.wrongRecordAction, "updated");
});

test("chooseNextRandomIndex avoids the current question when possible", () => {
  assert.equal(chooseNextRandomIndex(2, 5, () => 0.5), 3);
  assert.equal(chooseNextRandomIndex(0, 1, () => 0), 0);
});

test("quizAttemptStorageKey separates random attempts from wrong-review attempts", () => {
  const question = { number: 48 };

  assert.notEqual(
    quizAttemptStorageKey("all", question),
    quizAttemptStorageKey("wrong", question),
  );
});
