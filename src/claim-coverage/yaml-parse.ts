/**
 * Hand-rolled minimal YAML reader for tests/claim_registry.yaml.
 *
 * Scope: only the YAML subset actually used in claim_registry.yaml:
 *   - 2-space indented mappings
 *   - lists of mappings under `claims:`
 *   - scalar values: strings (quoted or bare), inline empty list `[]`
 *   - comments starting with `#` (full-line or trailing)
 *
 * Rejects anything else with a clear error. This is NOT a general YAML parser.
 * If the registry schema grows (folded strings, anchors, flow mappings), swap
 * in js-yaml and delete this file.
 */

import type { ClaimRegistry, ClaimEntry, ClaimStatus } from "./types.js";

const VALID_STATUSES: readonly ClaimStatus[] = ["implemented", "placeholder", "legacy"];

export function parseClaimRegistry(source: string): ClaimRegistry {
  const lines = source.split(/\r?\n/).map(stripComment);
  let i = 0;

  // Skip leading blank lines until we find `claims:`
  while (i < lines.length && lines[i]!.trim() === "") i++;
  if (i >= lines.length || lines[i]!.trim() !== "claims:") {
    throw new Error(`registry: expected top-level 'claims:' as first non-blank line, got: ${lines[i] ?? "<eof>"}`);
  }
  i++;

  const entries: ClaimEntry[] = [];
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Entry must start with "  - id:"
    if (!/^  - id:\s*/.test(line)) {
      throw new Error(`registry: expected '  - id:' at line ${i + 1}, got: ${line}`);
    }
    const { entry, nextIndex } = parseEntry(lines, i);
    entries.push(entry);
    i = nextIndex;
  }

  // Validate counts + uniqueness
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) throw new Error(`registry: duplicate claim id '${e.id}'`);
    ids.add(e.id);
  }

  return { claims: entries };
}

function parseEntry(lines: string[], start: number): { entry: ClaimEntry; nextIndex: number } {
  // First line: `  - id: "N"` or `  - id: N`
  const idMatch = lines[start]!.match(/^  - id:\s*(.+?)\s*$/);
  if (!idMatch) throw new Error(`registry: malformed id line: ${lines[start]}`);
  const id = unquote(idMatch[1]!);

  let i = start + 1;
  const fields: Record<string, string | string[]> = {};

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Next entry starts with "  - id:" — stop
    if (/^  - id:\s*/.test(line)) break;
    // Continuation fields for this entry start with 4 spaces + key
    const kvMatch = line.match(/^    ([a-z_]+):\s*(.*)$/);
    if (!kvMatch) {
      throw new Error(`registry: unexpected indentation at line ${i + 1}: ${line}`);
    }
    const key = kvMatch[1]!;
    const rawValue = kvMatch[2]!.trim();

    if (rawValue === "") {
      // Continuation with list items at 6-space indent
      const items: string[] = [];
      i++;
      while (i < lines.length) {
        const L = lines[i]!;
        if (L.trim() === "") { i++; continue; }
        const m = L.match(/^      - (.+)$/);
        if (!m) break;
        items.push(unquote(m[1]!.trim()));
        i++;
      }
      fields[key] = items;
    } else if (rawValue === "[]") {
      fields[key] = [];
      i++;
    } else {
      fields[key] = unquote(rawValue);
      i++;
    }
  }

  // Build typed entry
  const title = getString(fields, "title", id);
  const status = getString(fields, "status", id);
  if (!VALID_STATUSES.includes(status as ClaimStatus)) {
    throw new Error(`registry: claim ${id} has invalid status '${status}'; expected one of ${VALID_STATUSES.join(", ")}`);
  }
  const test_files = (fields.test_files ?? []) as string[];
  if (!Array.isArray(test_files)) {
    throw new Error(`registry: claim ${id} test_files must be a list`);
  }

  const entry: ClaimEntry = {
    id,
    title,
    status: status as ClaimStatus,
    testFiles: test_files,
  };
  if (typeof fields.blocked_by === "string") entry.blockedBy = fields.blocked_by;
  if (typeof fields.rename_target === "string") entry.renameTarget = fields.rename_target;
  if (typeof fields.rename_story === "string") entry.renameStory = fields.rename_story;

  return { entry, nextIndex: i };
}

function getString(fields: Record<string, string | string[]>, key: string, claimId: string): string {
  const v = fields[key];
  if (typeof v !== "string") {
    throw new Error(`registry: claim ${claimId} missing required string field '${key}'`);
  }
  return v;
}

function unquote(s: string): string {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function stripComment(line: string): string {
  // Strip trailing "# ..." BUT not "#" inside a quoted string. Our registry has
  // no quoted "#" so a simple scan is safe.
  const idx = line.indexOf("#");
  if (idx === -1) return line;
  // Avoid stripping "# foo" if it's part of a quoted value — simple heuristic:
  // if there's an odd number of quotes before `#`, it's inside a string. Since
  // we don't use `#` in values, this is defensive only.
  const before = line.slice(0, idx);
  const quoteCount = (before.match(/"/g) ?? []).length;
  if (quoteCount % 2 !== 0) return line; // inside a string — leave alone
  return before.replace(/\s+$/, "");
}
