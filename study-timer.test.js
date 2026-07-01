const assert = require("node:assert/strict");
const test = require("node:test");

const {
  startTimer,
  stopTimer,
  loadTimer,
  clearTimer,
} = require("./study-timer");

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

test("startTimer stores the user and start timestamp", () => {
  const storage = fakeStorage();

  const timer = startTimer(storage, "가연", "2026-07-01T10:00:00.000Z");

  assert.deepEqual(timer, { user: "가연", startedAt: "2026-07-01T10:00:00.000Z" });
  assert.deepEqual(loadTimer(storage), timer);
});

test("stopTimer calculates elapsed minutes from stored start time", () => {
  const storage = fakeStorage();
  startTimer(storage, "소울", "2026-07-01T10:00:00.000Z");

  const result = stopTimer(storage, "2026-07-01T10:37:30.000Z");

  assert.equal(result.user, "소울");
  assert.equal(result.elapsedMin, 38);
  assert.equal(loadTimer(storage), null);
});

test("stopTimer preserves short sessions as at least one minute", () => {
  const storage = fakeStorage();
  startTimer(storage, "가연", "2026-07-01T10:00:00.000Z");

  const result = stopTimer(storage, "2026-07-01T10:00:12.000Z");

  assert.equal(result.elapsedMin, 1);
});

test("clearTimer removes a running session", () => {
  const storage = fakeStorage();
  startTimer(storage, "가연", "2026-07-01T10:00:00.000Z");

  clearTimer(storage);

  assert.equal(loadTimer(storage), null);
});
