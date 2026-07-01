(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapSummaryNotes = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "sap-summary-notes-v1";
  const DELETED_KEY = "sap-summary-deleted-v1";
  const MISC_SECTION_ID = "misc";

  function loadSummaryNotes(storage) {
    try {
      const notes = JSON.parse(storage.getItem(KEY) || "[]");
      return normalizeSummaryNotes(notes);
    } catch {
      return [];
    }
  }

  function loadDeletedSummaryIds(storage) {
    try {
      const ids = JSON.parse(storage.getItem(DELETED_KEY) || "[]");
      return Array.isArray(ids) ? ids.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveDeletedSummaryIds(storage, ids) {
    storage.setItem(DELETED_KEY, JSON.stringify([...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])]));
  }

  function markSummaryNoteDeleted(storage, id) {
    if (!id) return false;
    saveDeletedSummaryIds(storage, [...loadDeletedSummaryIds(storage), id]);
    removeSummaryNote(storage, id);
    return true;
  }

  function filterDeletedSummaryNotes(notes, storage) {
    const deleted = new Set(loadDeletedSummaryIds(storage));
    return normalizeSummaryNotes(notes).filter((note) => !deleted.has(note.id));
  }

  function saveSummaryNotes(storage, notes) {
    storage.setItem(KEY, JSON.stringify(Array.isArray(notes) ? notes : []));
  }

  function createSummaryNote({ user, title, content, sectionId = MISC_SECTION_ID, now = new Date().toISOString() }) {
    const date = now.slice(0, 10);
    const cleanTitle = String(title || "").trim() || `${date} 요약`;
    return {
      id: `${date}-${Math.random().toString(36).slice(2, 10)}`,
      user,
      sectionId,
      date,
      title: cleanTitle,
      content: String(content || "").trim(),
      createdAt: now,
    };
  }

  function addSummaryNote(storage, note) {
    if (!note || !note.user || !String(note.content || "").trim()) return false;
    saveSummaryNotes(storage, upsertSummaryNote(loadSummaryNotes(storage), note));
    return true;
  }

  function clearSummaryNotes(storage) {
    storage.removeItem(KEY);
  }

  function removeSummaryNote(storage, id) {
    const notes = loadSummaryNotes(storage);
    const next = notes.filter((note) => note.id !== id);
    if (next.length === notes.length) return false;
    saveSummaryNotes(storage, next);
    return true;
  }

  function filterSummaryNotes(notes, user) {
    if (!user) return notes;
    return notes.filter((note) => note.user === user);
  }

  function filterSummaryNotesBySection(notes, sectionId) {
    if (!sectionId) return notes;
    return notes.filter((note) => (note.sectionId || MISC_SECTION_ID) === sectionId);
  }

  function normalizeSummaryNotes(notes) {
    return (Array.isArray(notes) ? notes : [])
      .filter((note) => note && note.id && note.user && note.content)
      .map((note) => ({ ...note, sectionId: note.sectionId || MISC_SECTION_ID }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function mergeSummaryNotes(remoteNotes, localNotes) {
    const byId = new Map();
    normalizeSummaryNotes(remoteNotes).forEach((note) => byId.set(note.id, note));
    normalizeSummaryNotes(localNotes).forEach((note) => byId.set(note.id, note));
    return normalizeSummaryNotes([...byId.values()]);
  }

  function upsertSummaryNote(notes, note) {
    if (!note || !note.id) return normalizeSummaryNotes(notes);
    return normalizeSummaryNotes([note, ...normalizeSummaryNotes(notes).filter((item) => item.id !== note.id)]);
  }

  function updateSummaryNote(notes, id, changes = {}) {
    const existing = normalizeSummaryNotes(notes).find((note) => note.id === id);
    if (!existing) return normalizeSummaryNotes(notes);
    const updated = {
      ...existing,
      sectionId: changes.sectionId || existing.sectionId || MISC_SECTION_ID,
      title: String(changes.title || "").trim() || existing.title,
      content: String(changes.content || "").trim() || existing.content,
      updatedAt: changes.now || new Date().toISOString(),
    };
    return upsertSummaryNote(notes, updated);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  function renderInlineMarkdown(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let listOpen = false;
    let codeOpen = false;
    let codeLines = [];

    function closeList() {
      if (!listOpen) return;
      html.push("</ul>");
      listOpen = false;
    }

    function closeCode() {
      if (!codeOpen) return;
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeOpen = false;
      codeLines = [];
    }

    lines.forEach((rawLine) => {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        if (codeOpen) closeCode();
        else {
          closeList();
          codeOpen = true;
          codeLines = [];
        }
        return;
      }

      if (codeOpen) {
        codeLines.push(line);
        return;
      }

      if (!trimmed) {
        closeList();
        return;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 2, 5);
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        return;
      }

      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        if (!listOpen) {
          html.push("<ul>");
          listOpen = true;
        }
        html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
        return;
      }

      const quote = trimmed.match(/^>\s?(.+)$/);
      if (quote) {
        closeList();
        html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
        return;
      }

      closeList();
      html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    });

    closeCode();
    closeList();
    return html.join("");
  }

  return {
    KEY,
    MISC_SECTION_ID,
    createSummaryNote,
    addSummaryNote,
    loadSummaryNotes,
    clearSummaryNotes,
    removeSummaryNote,
    markSummaryNoteDeleted,
    loadDeletedSummaryIds,
    filterDeletedSummaryNotes,
    filterSummaryNotes,
    filterSummaryNotesBySection,
    mergeSummaryNotes,
    upsertSummaryNote,
    updateSummaryNote,
    markdownToHtml,
  };
});
