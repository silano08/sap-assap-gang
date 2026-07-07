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

  function normalizeQuestion(question) {
    return {
      number: Number(question?.number || 0),
      prompt: String(question?.prompt || ""),
      options: { ...(question?.options || {}) },
      answer: normalizeLabels(question?.answer),
      explanation: String(question?.explanation || ""),
      link: String(question?.link || ""),
    };
  }

  function wrongRecordId(user, source, number) {
    return `${String(user || "").trim()}|${String(source || "문제은행").trim()}|${Number(number || 0)}`;
  }

  function quizHistoryRecordId(user, source, number, attemptType) {
    return `${wrongRecordId(user, source, number)}|${normalizeAttemptType(undefined, attemptType)}`;
  }

  function createWrongQuizRecord({ user, source, question, attempt, now = new Date().toISOString() }) {
    const normalizedQuestion = normalizeQuestion(question);
    const previousCount = Number(attempt?.wrongCount || 0);
    return {
      id: wrongRecordId(user, source, normalizedQuestion.number),
      user,
      source: source || "문제은행",
      number: normalizedQuestion.number,
      question: normalizedQuestion,
      selected: normalizeLabels(attempt?.selected),
      answer: normalizeLabels(attempt?.answer || normalizedQuestion.answer),
      note: String(attempt?.note || "").trim(),
      wrongCount: previousCount || 1,
      createdAt: attempt?.createdAt || now,
      updatedAt: now,
    };
  }

  function upsertWrongQuizRecord(records, record) {
    if (!record || !record.id || !record.user || !record.number) {
      return normalizeWrongQuizRecords(records);
    }
    const existing = normalizeWrongQuizRecords(records).find((item) => item.id === record.id);
    const nextRecord = {
      ...record,
      wrongCount: existing ? Number(existing.wrongCount || 1) + 1 : Number(record.wrongCount || 1),
      createdAt: existing?.createdAt || record.createdAt || record.updatedAt || new Date().toISOString(),
    };
    return normalizeWrongQuizRecords([
      nextRecord,
      ...normalizeWrongQuizRecords(records).filter((item) => item.id !== record.id),
    ]);
  }

  function removeWrongQuizRecord(records, id) {
    return normalizeWrongQuizRecords(records).filter((record) => record.id !== id);
  }

  function wrongRecordsForUser(records, user) {
    return normalizeWrongQuizRecords(records).filter((record) => record.user === user);
  }

  function mergeWrongQuizRecords(...groups) {
    const options = groups.length && !Array.isArray(groups[groups.length - 1]) ? groups.pop() : {};
    const deleted = new Set(Array.isArray(options?.deletedIds) ? options.deletedIds : []);
    const byId = new Map();
    groups.flat().forEach((record) => {
      const [normalized] = normalizeWrongQuizRecords([record]);
      if (!normalized || deleted.has(normalized.id)) return;
      const existing = byId.get(normalized.id);
      if (!existing || String(normalized.updatedAt).localeCompare(String(existing.updatedAt)) >= 0) {
        byId.set(normalized.id, normalized);
      }
    });
    return normalizeWrongQuizRecords([...byId.values()]);
  }

  function normalizeWrongQuizRecords(records) {
    return (Array.isArray(records) ? records : [])
      .filter((record) => record && record.id && record.user && record.number && record.question)
      .map((record) => ({
        ...record,
        question: normalizeQuestion(record.question),
        selected: normalizeLabels(record.selected),
        answer: normalizeLabels(record.answer || record.question?.answer),
        note: String(record.note || ""),
        wrongCount: Math.max(1, Number(record.wrongCount || 1)),
        updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
      }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function createQuizHistoryRecord({ user, source, mode = "random", question, attempt, now = new Date().toISOString() }) {
    const normalizedQuestion = normalizeQuestion(question);
    const selected = normalizeLabels(attempt?.selected);
    const answer = normalizeLabels(attempt?.answer || normalizedQuestion.answer);
    const attemptType = normalizeAttemptType(mode, attempt?.attemptType);
    const outcome = normalizeOutcome(!!attempt?.correct, attempt?.outcome);
    return {
      id: quizHistoryRecordId(user, source, normalizedQuestion.number, attemptType),
      user,
      source: source || "문제은행",
      mode,
      attemptType,
      outcome,
      wrongRecordAction: wrongRecordActionFor(attemptType, outcome, attempt?.wrongRecordAction),
      number: normalizedQuestion.number,
      prompt: normalizedQuestion.prompt,
      selected,
      answer,
      correct: !!attempt?.correct,
      note: String(attempt?.note || "").trim(),
      explanation: normalizedQuestion.explanation,
      link: normalizedQuestion.link,
      answeredAt: now,
      updatedAt: now,
    };
  }

  function normalizeAttemptType(mode, attemptType) {
    if (attemptType === "wrong_review" || attemptType === "random") return attemptType;
    return mode === "wrong" || mode === "wrong_review" ? "wrong_review" : "random";
  }

  function normalizeOutcome(correct, outcome) {
    if (outcome === "correct" || outcome === "wrong") return outcome;
    return correct ? "correct" : "wrong";
  }

  function wrongRecordActionFor(attemptType, outcome, action) {
    if (["created", "updated", "resolved", "none"].includes(action)) return action;
    if (attemptType === "wrong_review") return outcome === "correct" ? "resolved" : "updated";
    return outcome === "wrong" ? "created" : "none";
  }

  function normalizeQuizHistoryRecords(records) {
    return (Array.isArray(records) ? records : [])
      .filter((record) => record && record.id && record.user && record.number)
      .map((record) => {
        const correct = !!record.correct;
        const attemptType = normalizeAttemptType(record.mode, record.attemptType);
        const outcome = normalizeOutcome(correct, record.outcome);
        const source = record.source || "문제은행";
        return {
          ...record,
          id: quizHistoryRecordId(record.user, source, record.number, attemptType),
          source,
          attemptType,
          outcome,
          wrongRecordAction: wrongRecordActionFor(attemptType, outcome, record.wrongRecordAction),
          selected: normalizeLabels(record.selected),
          answer: normalizeLabels(record.answer),
          correct,
          note: String(record.note || ""),
          answeredAt: record.answeredAt || record.updatedAt || new Date().toISOString(),
          updatedAt: record.updatedAt || record.answeredAt || new Date().toISOString(),
        };
      })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function mergeQuizHistoryRecords(...groups) {
    const byId = new Map();
    groups.flat().forEach((record) => {
      const [normalized] = normalizeQuizHistoryRecords([record]);
      if (!normalized) return;
      const existing = byId.get(normalized.id);
      if (!existing || String(normalized.updatedAt).localeCompare(String(existing.updatedAt)) >= 0) {
        byId.set(normalized.id, normalized);
      }
    });
    return normalizeQuizHistoryRecords([...byId.values()]);
  }

  function chooseNextRandomIndex(currentIndex, count, random = Math.random) {
    const total = Math.max(0, Number(count) || 0);
    if (total <= 1) return 0;
    const current = Math.max(0, Math.min(Number(currentIndex) || 0, total - 1));
    const next = Math.max(0, Math.min(Math.floor(random() * total), total - 1));
    return next === current ? (next + 1) % total : next;
  }

  function quizAttemptStorageKey(mode, question) {
    const normalizedMode = mode === "wrong" ? "wrong" : "all";
    return `${normalizedMode}|${Number(question?.number || 0)}`;
  }

  return {
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
    normalizeWrongQuizRecords,
    createQuizHistoryRecord,
    normalizeQuizHistoryRecords,
    mergeQuizHistoryRecords,
    chooseNextRandomIndex,
    quizAttemptStorageKey,
  };
});
