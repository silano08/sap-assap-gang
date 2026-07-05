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

  function buildSummaryLibrary(notes, { query = "", sectionId = "", sections = [] } = {}) {
    const normalized = normalizeSummaryNotes(notes);
    const sectionMap = new Map((Array.isArray(sections) ? sections : []).map((section, index) => [
      section.id,
      { ...section, order: index },
    ]));
    const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);

    const matchesSearch = (note) => {
      if (!terms.length) return true;
      const section = sectionMap.get(note.sectionId || MISC_SECTION_ID);
      const haystack = [
        note.title,
        note.content,
        note.date,
        note.user,
        section?.title,
        section?.number ? `섹션 ${section.number}` : "",
      ].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    };

    const filtered = normalized.filter((note) => {
      const noteSection = note.sectionId || MISC_SECTION_ID;
      return (!sectionId || noteSection === sectionId) && matchesSearch(note);
    });

    const groups = [];
    const bySection = new Map();
    filtered.forEach((note) => {
      const noteSection = note.sectionId || MISC_SECTION_ID;
      if (!bySection.has(noteSection)) bySection.set(noteSection, []);
      bySection.get(noteSection).push(note);
    });

    [...bySection.entries()]
      .sort(([a], [b]) => {
        const sectionA = sectionMap.get(a);
        const sectionB = sectionMap.get(b);
        const orderA = sectionA ? sectionA.order : Number.MAX_SAFE_INTEGER;
        const orderB = sectionB ? sectionB.order : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return String(a).localeCompare(String(b));
      })
      .forEach(([id, sectionNotes]) => {
        const section = sectionMap.get(id) || { id, number: null, title: id === MISC_SECTION_ID ? "기타" : id };
        groups.push({
          id,
          title: section.title,
          number: section.number || null,
          notes: normalizeSummaryNotes(sectionNotes),
        });
      });

    return {
      total: filtered.length,
      groups,
    };
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
    let listType = "";
    let codeOpen = false;
    let codeLines = [];

    function closeList() {
      if (!listType) return;
      html.push(`</${listType}>`);
      listType = "";
    }

    function openList(type) {
      if (listType === type) return;
      closeList();
      html.push(`<${type}>`);
      listType = type;
    }

    function closeCode() {
      if (!codeOpen) return;
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeOpen = false;
      codeLines = [];
    }

    function parseTableCells(row) {
      let text = row.trim();
      if (text.startsWith("|")) text = text.slice(1);
      if (text.endsWith("|")) text = text.slice(0, -1);
      return text.split("|").map((cell) => cell.trim());
    }

    function isTableDivider(row) {
      const cells = parseTableCells(row);
      return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
    }

    function isTableRow(row) {
      return row.includes("|") && parseTableCells(row).length > 1;
    }

    function renderTable(header, rows) {
      const head = header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("");
      const body = rows.map((row) => (
        `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`
      )).join("");
      html.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
    }

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        if (codeOpen) closeCode();
        else {
          closeList();
          codeOpen = true;
          codeLines = [];
        }
        continue;
      }

      if (codeOpen) {
        codeLines.push(line);
        continue;
      }

      if (!trimmed) {
        closeList();
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 2, 5);
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }

      if (/^-{3,}$/.test(trimmed)) {
        closeList();
        html.push("<hr>");
        continue;
      }

      if (isTableRow(trimmed) && lines[i + 1] && isTableDivider(lines[i + 1].trim())) {
        closeList();
        const header = parseTableCells(trimmed);
        const rows = [];
        i += 2;
        while (i < lines.length && isTableRow(lines[i].trim())) {
          rows.push(parseTableCells(lines[i]));
          i += 1;
        }
        i -= 1;
        renderTable(header, rows);
        continue;
      }

      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        openList("ul");
        html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
        continue;
      }

      const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (ordered) {
        openList("ol");
        html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
        continue;
      }

      const quote = trimmed.match(/^>\s?(.+)$/);
      if (quote) {
        closeList();
        html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
        continue;
      }

      closeList();
      html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    }

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
    buildSummaryLibrary,
    mergeSummaryNotes,
    upsertSummaryNote,
    updateSummaryNote,
    markdownToHtml,
  };
});
