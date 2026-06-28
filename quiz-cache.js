(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapQuizCache = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "sap-quiz-bank-v1";

  function createQuizCachePayload(source, questions, now = new Date().toISOString()) {
    const cleanQuestions = Array.isArray(questions) ? questions : [];
    return {
      source: String(source || "DOCX 문제은행"),
      savedAt: now,
      count: cleanQuestions.length,
      questions: cleanQuestions,
    };
  }

  function isValidPayload(payload) {
    return !!payload
      && typeof payload.source === "string"
      && Array.isArray(payload.questions)
      && payload.questions.length > 0
      && payload.questions.every((q) => Number.isFinite(q.number) && q.prompt && q.options && Array.isArray(q.answer));
  }

  function loadQuizCache(storage) {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!isValidPayload(payload)) return null;
      return {
        ...payload,
        count: payload.questions.length,
      };
    } catch {
      return null;
    }
  }

  function saveQuizCache(storage, payload) {
    if (!isValidPayload(payload)) return false;
    storage.setItem(KEY, JSON.stringify({ ...payload, count: payload.questions.length }));
    return true;
  }

  function clearQuizCache(storage) {
    storage.removeItem(KEY);
  }

  return {
    KEY,
    createQuizCachePayload,
    loadQuizCache,
    saveQuizCache,
    clearQuizCache,
  };
});
