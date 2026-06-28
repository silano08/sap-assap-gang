const assert = require("node:assert/strict");
const test = require("node:test");

const { parseQuestions } = require("./quiz-parser");

test("parseQuestions extracts prompt, options, answer, link, and explanation", () => {
  const paragraphs = [
    "Exam : SAP-C02(Kor)",
    "Q1",
    "회사는 DNS 솔루션을 설계해야 합니다.",
    "요구 사항을 충족하는 솔루션은 무엇입니까?",
    "A. 첫 번째 선택지",
    "B. 두 번째 선택지",
    "C. 세 번째 선택지",
    "D. 네 번째 선택지",
    "Answer: C",
    "https://example.com/discussion",
    "설명:",
    "C가 맞는 이유입니다.",
    "Q2",
    "다음 문제입니다.",
    "A. 선택 A",
    "B. 선택 B",
    "Answer: A",
  ];

  const questions = parseQuestions(paragraphs);

  assert.equal(questions.length, 2);
  assert.equal(questions[0].number, 1);
  assert.equal(questions[0].prompt, "회사는 DNS 솔루션을 설계해야 합니다.\n요구 사항을 충족하는 솔루션은 무엇입니까?");
  assert.deepEqual(questions[0].answer, ["C"]);
  assert.equal(questions[0].link, "https://example.com/discussion");
  assert.equal(questions[0].options.A, "첫 번째 선택지");
  assert.equal(questions[0].explanation, "C가 맞는 이유입니다.");
});

test("parseQuestions supports multi-answer questions and E/F options", () => {
  const questions = parseQuestions([
    "Q10",
    "복수 정답 문제입니다.",
    "A. 선택 A",
    "B. 선택 B",
    "C. 선택 C",
    "D. 선택 D",
    "E. 선택 E",
    "F. 선택 F",
    "Answer: A, C, F",
  ]);

  assert.equal(questions[0].number, 10);
  assert.deepEqual(questions[0].answer, ["A", "C", "F"]);
  assert.deepEqual(Object.keys(questions[0].options), ["A", "B", "C", "D", "E", "F"]);
});
