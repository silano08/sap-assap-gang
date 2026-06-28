(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapSummaryNotes = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "sap-summary-notes-v1";

  function loadSummaryNotes(storage) {
    try {
      const notes = JSON.parse(storage.getItem(KEY) || "[]");
      return Array.isArray(notes)
        ? notes.filter((note) => note && note.user && note.content).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        : [];
    } catch {
      return [];
    }
  }

  function saveSummaryNotes(storage, notes) {
    storage.setItem(KEY, JSON.stringify(Array.isArray(notes) ? notes : []));
  }

  function createSummaryNote({ user, title, content, now = new Date().toISOString() }) {
    const date = now.slice(0, 10);
    const cleanTitle = String(title || "").trim() || `${date} 요약`;
    return {
      id: `${date}-${Math.random().toString(36).slice(2, 10)}`,
      user,
      date,
      title: cleanTitle,
      content: String(content || "").trim(),
      createdAt: now,
    };
  }

  function addSummaryNote(storage, note) {
    if (!note || !note.user || !String(note.content || "").trim()) return false;
    saveSummaryNotes(storage, [note, ...loadSummaryNotes(storage)]);
    return true;
  }

  function clearSummaryNotes(storage) {
    storage.removeItem(KEY);
  }

  function filterSummaryNotes(notes, user) {
    if (!user) return notes;
    return notes.filter((note) => note.user === user);
  }

  return {
    KEY,
    createSummaryNote,
    addSummaryNote,
    loadSummaryNotes,
    clearSummaryNotes,
    filterSummaryNotes,
  };
});
