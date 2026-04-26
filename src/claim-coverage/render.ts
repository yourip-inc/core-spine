/**
 * Claim-coverage report renderers.
 *
 * Story T1-S1-F-02. AC: "Report output format is Markdown and HTML" and
 * "Report generation deterministic and reproducible".
 *
 * Both renderers produce byte-stable output for a given input — no dates in
 * the body beyond a frozen `generatedAtUtcMs` header the caller supplies.
 *
 * Audit §4.3 remediation (2026-04-22): when a row's coverage carries
 * diagnostics (only reachable via the registry-testFiles fallback branches),
 * they are rendered inline beneath the test list as "why this row was
 * downgraded" notes.
 */

import type { CoverageReport, CoverageReportRow, CoverageResult } from "./types.js";

export function renderMarkdown(report: CoverageReport): string {
  const { summary, rows, generatedAtUtcMs } = report;
  const lines: string[] = [];

  lines.push("# Claim Coverage Report");
  lines.push("");
  lines.push(`Generated at UTC ms: \`${generatedAtUtcMs.toString()}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total claims tracked: **${summary.total}**`);
  lines.push(`- 🟢 Green (implemented, passing): **${summary.green}**`);
  lines.push(`- 🟡 Yellow (legacy naming, pending rename): **${summary.yellowLegacy}**`);
  lines.push(`- 🔴 Red — failing tests: **${summary.redFailing}**`);
  lines.push(`- 🔴 Red — no tests: **${summary.redMissing}**`);
  lines.push("");
  lines.push("## Claims");
  lines.push("");
  lines.push("| Claim | Title | Status | Tests |");
  lines.push("|---|---|---|---|");
  for (const row of rows) {
    lines.push(`| ${row.claim.id} | ${escapeMd(row.claim.title)} | ${statusBadge(row)} | ${testCellMd(row)} |`);
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

export function renderHtml(report: CoverageReport): string {
  const { summary, rows, generatedAtUtcMs } = report;
  const body = rows.map((r) => {
    const status = statusBadge(r);
    const tests = testCellHtml(r);
    return `<tr><td>${escapeHtml(r.claim.id)}</td><td>${escapeHtml(r.claim.title)}</td><td>${status}</td><td>${tests}</td></tr>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Claim Coverage Report</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 960px; margin: 2rem auto; color: #222; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #e5e5e5; text-align: left; vertical-align: top; }
  th { background: #fafafa; }
  .green { color: #0a7a3a; font-weight: 600; }
  .red   { color: #b81c1c; font-weight: 600; }
  .yellow{ color: #8a6d00; font-weight: 600; }
  code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; }
  li { margin-bottom: 2px; }
  .diagnostic { color: #8a6d00; font-size: 0.9em; display: block; margin-top: 4px; }
</style>
</head><body>
<h1>Claim Coverage Report</h1>
<p>Generated at UTC ms: <code>${generatedAtUtcMs.toString()}</code></p>
<h2>Summary</h2>
<ul>
  <li>Total claims tracked: <strong>${summary.total}</strong></li>
  <li><span class="green">Green</span> (implemented, passing): <strong>${summary.green}</strong></li>
  <li><span class="yellow">Yellow</span> (legacy naming, pending rename): <strong>${summary.yellowLegacy}</strong></li>
  <li><span class="red">Red</span> — failing tests: <strong>${summary.redFailing}</strong></li>
  <li><span class="red">Red</span> — no tests: <strong>${summary.redMissing}</strong></li>
</ul>
<h2>Claims</h2>
<table>
<thead><tr><th>Claim</th><th>Title</th><th>Status</th><th>Tests</th></tr></thead>
<tbody>
${body}
</tbody>
</table>
</body></html>
`;
}

function statusBadge(row: CoverageReportRow): string {
  switch (row.coverage.kind) {
    case "green":
      return `🟢 implemented (${row.coverage.passingCount} test${row.coverage.passingCount === 1 ? "" : "s"})`;
    case "yellow_legacy":
      return `🟡 legacy — rename to \`${row.claim.renameTarget ?? "?"}\``;
    case "red_failing":
      return `🔴 failing (${row.coverage.failingCount})`;
    case "red_missing":
      return row.claim.blockedBy
        ? `🔴 no tests — blocked by ${row.claim.blockedBy}`
        : "🔴 no tests";
  }
}

function testCellMd(row: CoverageReportRow): string {
  const files = filesFromCoverage(row.coverage);
  const diagnostics = diagnosticsFromCoverage(row.coverage);

  const parts: string[] = [];
  if (files.length > 0) {
    parts.push(files.map((f) => `\`${escapeMd(f)}\``).join("<br>"));
  }
  for (const d of diagnostics) {
    parts.push(`⚠ ${escapeMd(d)}`);
  }
  return parts.length === 0 ? "—" : parts.join("<br>");
}

function testCellHtml(row: CoverageReportRow): string {
  const files = filesFromCoverage(row.coverage);
  const diagnostics = diagnosticsFromCoverage(row.coverage);

  if (files.length === 0 && diagnostics.length === 0) return "—";

  const parts: string[] = [];
  for (const f of files) parts.push(`<code>${escapeHtml(f)}</code>`);
  for (const d of diagnostics) parts.push(`<span class="diagnostic">⚠ ${escapeHtml(d)}</span>`);
  return parts.join("<br>");
}

function filesFromCoverage(c: CoverageResult): string[] {
  if (c.kind === "green" || c.kind === "red_failing" || c.kind === "yellow_legacy") {
    return c.tests;
  }
  return [];
}

function diagnosticsFromCoverage(c: CoverageResult): string[] {
  if (c.kind === "yellow_legacy" || c.kind === "red_missing") {
    return c.diagnostics ?? [];
  }
  return [];
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}
