// Client-side export of a generated report (markdown-ish text) to a downloadable
// PDF or Word .doc - with NO external libraries.
//   • PDF  → renders the report into a hidden iframe and triggers the browser's
//            native print dialog ("Save as PDF"). No npm package required.
//   • DOC  → a Word-compatible HTML blob that Word / Google Docs open natively.
// Anyone can export their own answers; team-wide reports are gated in the chat UI.

export type ExportFormat = "pdf" | "doc";

/** Sniff the format the user asked for, e.g. "...export as word" → 'doc'. */
export function detectFormat(text: string): ExportFormat | null {
  const t = text.toLowerCase();
  if (/\b(\.docx?|word|doc file|google doc|\bdoc\b)\b/.test(t)) return "doc";
  if (/\b(\.pdf|pdf)\b/.test(t)) return "pdf";
  return null;
}

// ── Tiny markdown block parser (headings, bullets, numbered, tables, paragraphs) ──
type Block =
  | { type: "h"; level: number; text: string }
  | { type: "li"; ordered: boolean; index: number; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "p"; text: string };

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}
const isTableRow = (line: string) => line.includes("|") && line.trim() !== "";
const isSeparator = (line: string) => {
  const cells = splitRow(line);
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, "")))
  );
};

function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let n = 0;
  const lines = md.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      n = 0;
      continue;
    }
    // GFM table
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() && isTableRow(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      blocks.push({ type: "table", header, rows });
      i = j - 1;
      n = 0;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ type: "h", level: h[1].length, text: h[2] });
      n = 0;
      continue;
    }
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ol) {
      n++;
      blocks.push({ type: "li", ordered: true, index: n, text: ol[2] });
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      blocks.push({ type: "li", ordered: false, index: 0, text: ul[1] });
      n = 0;
      continue;
    }
    blocks.push({ type: "p", text: line });
    n = 0;
  }
  return blocks;
}

function stripInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inlineToHtml(s: string): string {
  return escapeHtml(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
function timestamp(): string {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function safeName(title: string, ext: string): string {
  const base =
    (title || "vcos-report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "vcos-report";
  return `${base}.${ext}`;
}

/** Render the report body to HTML once; reused by both PDF (print) and DOC.
 *  Groups consecutive list items into real <ul>/<ol> and keeps the report's own
 *  H1 as the document title. */
function bodyToHtml(text: string): string {
  const parts: string[] = [];
  let ul: string[] = [];
  let ol: string[] = [];
  const flushUl = () => {
    if (ul.length) {
      parts.push(
        `<ul>${ul.map((t) => `<li>${inlineToHtml(t)}</li>`).join("")}</ul>`,
      );
      ul = [];
    }
  };
  const flushOl = () => {
    if (ol.length) {
      parts.push(
        `<ol>${ol.map((t) => `<li>${inlineToHtml(t)}</li>`).join("")}</ol>`,
      );
      ol = [];
    }
  };
  const flush = () => {
    flushUl();
    flushOl();
  };
  for (const b of parseBlocks(text)) {
    if (b.type === "li") {
      if (b.ordered) {
        flushUl();
        ol.push(b.text);
      } else {
        flushOl();
        ul.push(b.text);
      }
      continue;
    }
    flush();
    if (b.type === "h") {
      const lv = Math.min(b.level, 4);
      parts.push(`<h${lv}>${inlineToHtml(b.text)}</h${lv}>`);
      continue;
    }
    if (b.type === "table") {
      const thead = `<tr>${b.header.map((c) => `<th>${inlineToHtml(c)}</th>`).join("")}</tr>`;
      const tbody = b.rows
        .map(
          (r) =>
            `<tr>${b.header.map((_, ci) => `<td>${inlineToHtml(r[ci] ?? "")}</td>`).join("")}</tr>`,
        )
        .join("");
      parts.push(
        `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`,
      );
      continue;
    }
    parts.push(`<p>${inlineToHtml(b.text)}</p>`);
  }
  flush();
  return parts.join("\n  ");
}

// Branded, professional document style - shared by PDF and Word so every report
// looks identical. Uses table-based letterhead + web-safe fonts so it renders
// the same in the browser print dialog and in Microsoft Word / Google Docs.
const SHARED_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10.5pt; color:#1F2937; line-height:1.6; margin:0; }
  .doc { max-width: 760px; margin: 0 auto; padding: 8px 4px 24px; }
  .lh { width:100%; border-collapse:collapse; margin:0 0 4px; }
  .lh td { border:none; padding:0; vertical-align:bottom; }
  .brand-name { font-size:19pt; font-weight:800; color:#4F46E5; letter-spacing:-0.4px; }
  .brand-sub { font-size:9.5pt; color:#6B7280; padding-left:6px; }
  .lh-org { text-align:right; font-size:8.5pt; color:#6B7280; font-weight:600; line-height:1.5; text-transform:uppercase; letter-spacing:0.6px; }
  .rule { height:3px; background:#4F46E5; margin:6px 0 20px; }
  h1 { font-size:21pt; font-weight:800; color:#111827; margin:4px 0 2px; line-height:1.15; }
  h2 { font-size:12pt; font-weight:700; color:#4F46E5; text-transform:uppercase; letter-spacing:0.6px; margin:22px 0 9px; padding-bottom:5px; border-bottom:1px solid #E5E7EB; }
  h3 { font-size:11.5pt; font-weight:700; color:#111827; margin:15px 0 5px; }
  h4 { font-size:10.5pt; font-weight:700; color:#374151; margin:12px 0 4px; }
  p { margin:0 0 9px; }
  em { color:#6B7280; font-style:italic; }
  strong { color:#111827; }
  a { color:#4F46E5; text-decoration:none; }
  ul, ol { margin:4px 0 12px; padding-left:22px; }
  li { margin:0 0 4px; }
  code { font-family:Consolas, "Courier New", monospace; background:#F3F4F6; padding:1px 5px; border-radius:3px; font-size:9.5pt; color:#4338CA; }
  blockquote { margin:12px 0; padding:8px 16px; border-left:3px solid #4F46E5; background:#F9FAFB; color:#374151; }
  hr { border:none; border-top:1px solid #E5E7EB; margin:18px 0; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:10pt; }
  th { background:#EEF2FF; color:#3730A3; font-weight:700; text-align:left; padding:7px 11px; border:1px solid #C7D2FE; }
  td { padding:6px 11px; border:1px solid #E5E7EB; vertical-align:top; }
  tr:nth-child(even) td { background:#F9FAFB; }
  .footer { margin-top:28px; padding-top:10px; border-top:1px solid #E5E7EB; color:#9CA3AF; font-size:8pt; text-align:center; letter-spacing:0.3px; }
`;

// Assemble the full branded document (letterhead + body + footer).
function wrapDocument(title: string, body: string, word: boolean): string {
  const ns = word
    ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"'
    : "";
  const printCss = word ? "" : "\n  @page { size: letter; margin: 16mm; }";
  return `<!DOCTYPE html><html${ns}><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${SHARED_CSS}${printCss}</style></head>
<body>
<div class="doc">
  <table class="lh"><tr>
    <td><span class="brand-name">VCoS-AI</span><span class="brand-sub">Virtual Chief of Staff</span></td>
    <td class="lh-org">RampRate A-Team<br>ImpactSoul</td>
  </tr></table>
  <div class="rule"></div>
  ${body}
  <div class="footer">Generated by VCoS-AI · ${timestamp()} · Confidential - RampRate / ImpactSoul</div>
</div>
</body></html>`;
}

// ── PDF (native browser print → "Save as PDF"), no library ──
export function exportToPdf(text: string, title = "VCoS-AI Report") {
  const html = wrapDocument(
    safeName(title, "pdf").replace(/\.pdf$/, ""),
    bodyToHtml(text),
    false,
  );

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const fire = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* ignore */
    }
    setTimeout(() => iframe.remove(), 60_000); // keep alive until the print dialog resolves
  };
  if (iframe.contentWindow) setTimeout(fire, 300);
}

// ── DOC (HTML that Word opens), no library ──
export function exportToDoc(text: string, title = "VCoS-AI Report") {
  const html = wrapDocument(title, bodyToHtml(text), true);
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(title, "doc");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReport(
  text: string,
  format: ExportFormat,
  title?: string,
) {
  if (format === "doc") exportToDoc(text, title);
  else exportToPdf(text, title);
}

/** Derive a sensible document title from the report's first heading or line. */
export function deriveTitle(text: string): string {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) return stripInline(h[1]).slice(0, 70);
    return stripInline(line).replace(/[:.]$/, "").slice(0, 70);
  }
  return "VCoS-AI Report";
}
