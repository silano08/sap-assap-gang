(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapQuizSession = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeLabels(labels) {
    return [...new Set((labels || []).map((label) => String(label).trim().toUpperCase()).filter(Boolean))].sort();
  }

  function isCorrectAnswer(selected, answer) {
    const left = normalizeLabels(selected);
    const right = normalizeLabels(answer);
    return left.length === right.length && left.every((label, index) => label === right[index]);
  }

  function summarizeAttempts(attempts) {
    const values = Array.from(attempts.values());
    return {
      dumps: values.length,
      correct: values.filter((attempt) => attempt.correct).length,
      wrong: values.filter((attempt) => !attempt.correct).length,
    };
  }

  function buildWrongProblemLines(attempts) {
    return Array.from(attempts.values())
      .filter((attempt) => !attempt.correct)
      .sort((a, b) => a.number - b.number)
      .map((attempt) => {
        const selected = normalizeLabels(attempt.selected).join(", ") || "없음";
        const answer = normalizeLabels(attempt.answer).join(", ");
        const note = String(attempt.note || "").trim();
        return `Q${attempt.number} x 선택 ${selected} / 정답 ${answer}${note ? ` / 메모 ${note}` : ""}`;
      });
  }

  function buildSavePreview(attempts) {
    const summary = summarizeAttempts(attempts);
    if (!summary.dumps) {
      return {
        disabled: true,
        lines: ["정답 보기를 누른 문제부터 저장할 수 있어요."],
      };
    }

    const wrongLines = buildWrongProblemLines(attempts);
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

  function parseWrongLine(line) {
    const match = String(line).match(/^(Q?\d+)\s+x\s+(.+)$/i);
    if (!match) return { id: String(line), ok: false, note: "" };
    return { id: match[1].toUpperCase().startsWith("Q") ? match[1].toUpperCase() : `Q${match[1]}`, ok: false, note: match[2].trim() };
  }

  function applyQuizSummaryToEntry(entry, summary) {
    const base = { ...(entry || {}) };
    const existingProblems = Array.isArray(base.problems) ? base.problems : [];
    const wrongProblems = (summary.wrongLines || []).map(parseWrongLine);
    return {
      ...base,
      dumps: (Number(base.dumps) || 0) + (Number(summary.dumps) || 0),
      correct: (Number(base.correct) || 0) + (Number(summary.correct) || 0),
      problems: [...existingProblems, ...wrongProblems],
    };
  }

  return {
    isCorrectAnswer,
    summarizeAttempts,
    buildWrongProblemLines,
    buildSavePreview,
    applyQuizSummaryToEntry,
  };
});
