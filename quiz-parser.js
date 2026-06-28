(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapQuizParser = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parseQuestions(paragraphs) {
    const starts = [];
    paragraphs.forEach((text, index) => {
      const match = String(text).trim().match(/^Q(\d+)$/);
      if (match) starts.push({ index, number: Number(match[1]) });
    });

    const questions = [];
    starts.forEach((start, position) => {
      const next = starts[position + 1];
      const block = paragraphs.slice(start.index + 1, next ? next.index : paragraphs.length);
      const question = parseQuestionBlock(start.number, block);
      if (question.prompt && Object.keys(question.options).length && question.answer.length) {
        questions.push(question);
      }
    });
    return questions;
  }

  function parseQuestionBlock(number, block) {
    const promptLines = [];
    const explanationLines = [];
    const options = {};
    let currentOption = null;
    let afterAnswer = false;
    let answer = [];
    let link = "";

    block.forEach((rawLine) => {
      const line = String(rawLine || "").trim();
      if (!line) return;

      const answerMatch = line.match(/^Answer\s*:\s*(.+)$/i);
      if (answerMatch) {
        answer = (answerMatch[1].toUpperCase().match(/[A-Z]/g) || []);
        currentOption = null;
        afterAnswer = true;
        return;
      }

      if (afterAnswer) {
        if (/^https?:\/\//.test(line)) {
          link = line;
        } else if (!/^(설명|Explanation)\s*:?\s*$/i.test(line)) {
          explanationLines.push(line);
        }
        return;
      }

      const optionMatch = line.match(/^([A-H])\.\s*(.*)$/);
      if (optionMatch) {
        currentOption = optionMatch[1];
        options[currentOption] = optionMatch[2].trim();
        return;
      }

      if (currentOption) {
        options[currentOption] = `${options[currentOption]} ${line}`.trim();
      } else {
        promptLines.push(line);
      }
    });

    return {
      number,
      prompt: promptLines.join("\n").trim(),
      options,
      answer,
      link,
      explanation: explanationLines.join("\n").trim(),
    };
  }

  async function parseDocxFile(file, JSZipCtor) {
    if (!JSZipCtor) throw new Error("DOCX 파싱 라이브러리(JSZip)를 불러오지 못했어요.");
    const zip = await JSZipCtor.loadAsync(file);
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) throw new Error("word/document.xml을 찾지 못했어요. DOCX 파일인지 확인해주세요.");
    const xmlText = await documentXml.async("text");
    const paragraphs = docxXmlToParagraphs(xmlText);
    return parseQuestions(paragraphs);
  }

  function docxXmlToParagraphs(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) throw new Error("DOCX XML을 읽는 중 오류가 났어요.");

    return Array.from(doc.getElementsByTagNameNS("*", "p"))
      .map((paragraph) => {
        const parts = [];
        paragraph.querySelectorAll("*").forEach((node) => {
          const name = node.localName;
          if (name === "t") parts.push(node.textContent || "");
          if (name === "tab" || name === "br" || name === "lastRenderedPageBreak") parts.push(" ");
        });
        return parts.join("").replace(/[ \t]+/g, " ").trim();
      })
      .filter(Boolean);
  }

  return {
    parseQuestions,
    parseQuestionBlock,
    parseDocxFile,
    docxXmlToParagraphs,
  };
});
