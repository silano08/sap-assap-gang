(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapStudyTimer = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "sap-study-timer-v1";

  function loadTimer(storage) {
    try {
      const timer = JSON.parse(storage.getItem(KEY) || "null");
      return timer && timer.user && timer.startedAt ? timer : null;
    } catch {
      return null;
    }
  }

  function saveTimer(storage, timer) {
    storage.setItem(KEY, JSON.stringify(timer));
  }

  function clearTimer(storage) {
    storage.removeItem(KEY);
  }

  function startTimer(storage, user, now = new Date().toISOString()) {
    const timer = { user, startedAt: now };
    saveTimer(storage, timer);
    return timer;
  }

  function elapsedMinutes(startedAt, endedAt = new Date().toISOString()) {
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.max(1, Math.ceil((end - start) / 60000));
  }

  function stopTimer(storage, now = new Date().toISOString()) {
    const timer = loadTimer(storage);
    if (!timer) return null;
    const elapsedMin = elapsedMinutes(timer.startedAt, now);
    clearTimer(storage);
    return { ...timer, endedAt: now, elapsedMin };
  }

  return {
    KEY,
    startTimer,
    stopTimer,
    loadTimer,
    clearTimer,
    elapsedMinutes,
  };
});
