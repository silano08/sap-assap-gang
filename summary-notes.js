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

  function normalizeSummaryNotes(notes) {
    return (Array.isArray(notes) ? notes : [])
      .filter((note) => note && note.id && note.user && note.content)
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
    createSummaryNote,
    addSummaryNote,
    loadSummaryNotes,
    clearSummaryNotes,
    removeSummaryNote,
    filterSummaryNotes,
    mergeSummaryNotes,
    upsertSummaryNote,
    markdownToHtml,
  };
});
