// FabriLearn — shared export utilities (CSV download + printable tables).
// Used by Reports; the print view opens a clean window the user can Save as PDF.

import { toCSV } from "./fab-model";

export function downloadText(filename, text, mime = "text/csv") {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Build a CSV with an optional metadata header block, then download it.
export function exportCSV({ filename, columns, rows, meta = [] }) {
  const esc = (v) => (/[",\n\r]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  const metaCsv = meta.length ? meta.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n\r\n" : "";
  downloadText(filename, metaCsv + toCSV(columns, rows), "text/csv");
}

// Open a clean print window (Save as PDF from the dialog).
export function printTable({ title, subtitle, meta = [], columns, rows }) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const metaHtml = meta.length
    ? `<div class="meta">${meta.map(([k, v]) => `<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join("")}</div>` : "";
  const thead = `<tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body{font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;margin:28px;}
      h1{font-size:17px;margin:0 0 2px;} .sub{color:#78716c;margin:0 0 14px;font-size:12px;}
      .meta{margin:0 0 14px;font-size:11px;color:#57534e;} .meta span{margin-right:14px;}
      table{width:100%;border-collapse:collapse;font-size:11px;}
      th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e7e5e4;vertical-align:top;}
      th{text-transform:uppercase;font-size:9px;letter-spacing:.04em;color:#78716c;}
      .foot{margin-top:18px;font-size:10px;color:#a8a29e;}
      @media print{body{margin:0;}}
    </style></head><body>
    <h1>${esc(title)}</h1>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ""}
    ${metaHtml}
    <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    <p class="foot">Generated ${new Date().toLocaleString()} · FabriLearn</p>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html); w.document.close();
}
