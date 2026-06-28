const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createQuizCachePayload,
  loadQuizCache,
  saveQuizCache,
  clearQuizCache,
} = require("./quiz-cache");

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

test("saveQuizCache stores parsed questions without the DOCX binary", () => {
  const storage = fakeStorage();
  const questions = [
    { number: 1, prompt: "문제", options: { A: "A", B: "B" }, answer: ["A"], explanation: "해설", link: "" },
  ];

  const payload = createQuizCachePayload("SAP-C02.docx", questions);
  saveQuizCache(storage, payload);

  const loaded = loadQuizCache(storage);
  assert.equal(loaded.source, "SAP-C02.docx");
  assert.equal(loaded.count, 1);
  assert.deepEqual(loaded.questions, questions);
  assert.equal(Object.prototype.hasOwnProperty.call(loaded, "docx"), false);
});

test("loadQuizCache ignores broken or empty cache entries", () => {
  assert.equal(loadQuizCache(fakeStorage()), null);
  assert.equal(loadQuizCache(fakeStorage({ "sap-quiz-bank-v1": "{broken" })), null);
  assert.equal(loadQuizCache(fakeStorage({ "sap-quiz-bank-v1": JSON.stringify({ questions: [] }) })), null);
});

test("clearQuizCache removes the cached problem bank", () => {
  const storage = fakeStorage();
  saveQuizCache(storage, createQuizCachePayload("old.docx", [
    { number: 3, prompt: "문제", options: { A: "A" }, answer: ["A"], explanation: "", link: "" },
  ]));

  clearQuizCache(storage);

  assert.equal(loadQuizCache(storage), null);
});
