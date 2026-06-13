// Regression dam for cross-tenant-leakage / silent-fail-open patterns.
// Source of truth for rationale: _audit/FORBIDDEN_PATTERNS.md
//
// If this test fails, DO NOT just add to the allowlist. Read the audit doc,
// confirm the new occurrence is safe (global read-only data, not per-tenant
// state; or a documented fail-open path that never gates a decision), then
// add an allowlist entry in BOTH this file and FORBIDDEN_PATTERNS.md.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';
import { fromFileUrl, join } from 'https://deno.land/std@0.224.0/path/mod.ts';

const ROOT = fromFileUrl(new URL('../', import.meta.url));
const SCAN_DIRS = ['decision', 'agents'];

// ── Allowlist ────────────────────────────────────────────────────────────────
// Keyed by `${relativeFilePath}:${lineNumber}` so a move/edit forces re-review.
// Update FORBIDDEN_PATTERNS.md whenever you add an entry here.
const ALLOWLIST: Record<string, Set<string>> = {
  F1_module_let_underscore: new Set([
    'agents/intent-classifier.ts:35',
    'agents/intent-classifier.ts:36',
    'agents/next-crop-recommender.ts:114',
    'agents/next-crop-recommender.ts:115',
  ]),
  F2_singleton_instance: new Set([]),
  F3_module_map: new Set([
    'decision/causal-hypothesis-engine.ts:224',
    'decision/causal-hypothesis-engine.ts:225',
  ]),
  // F4 is allowlisted by "FAIL-OPEN BY DESIGN" comment within ±5 lines.
};

async function readAllFiles(): Promise<Array<{ rel: string; lines: string[] }>> {
  const out: Array<{ rel: string; lines: string[] }> = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    for await (const entry of walk(abs, { exts: ['.ts'], includeDirs: false })) {
      const rel = entry.path.slice(ROOT.length).replace(/\\/g, '/');
      const text = await Deno.readTextFile(entry.path);
      out.push({ rel, lines: text.split('\n') });
    }
  }
  return out;
}

function scan(
  files: Array<{ rel: string; lines: string[] }>,
  regex: RegExp,
  allow: Set<string>,
): string[] {
  const violations: string[] = [];
  for (const { rel, lines } of files) {
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (regex.test(line)) {
        const key = `${rel}:${lineNo}`;
        if (!allow.has(key)) violations.push(`${key}  → ${line.trim()}`);
      }
    });
  }
  return violations;
}

Deno.test('F1: no module-level `let _<name>` (cross-tenant leakage)', async () => {
  const files = await readAllFiles();
  const violations = scan(files, /^let _\w+/, ALLOWLIST.F1_module_let_underscore);
  assertEquals(
    violations,
    [],
    `New module-level mutable state introduced. See _audit/FORBIDDEN_PATTERNS.md (F1).\n${violations.join('\n')}`,
  );
});

Deno.test('F2: no singleton `let <name>Instance` wrappers', async () => {
  const files = await readAllFiles();
  const violations = scan(files, /^let \w+Instance\b/, ALLOWLIST.F2_singleton_instance);
  assertEquals(
    violations,
    [],
    `New singleton wrapper introduced. Use buildXxx(scope) factory. See _audit/FORBIDDEN_PATTERNS.md (F2).\n${violations.join('\n')}`,
  );
});

Deno.test('F3: no module-level `new Map()` (memory leak / tenant leakage)', async () => {
  const files = await readAllFiles();
  const violations = scan(files, /^(const|let) \w+\s*[:=].*new Map\(\)/, ALLOWLIST.F3_module_map);
  assertEquals(
    violations,
    [],
    `New module-level Map introduced. See _audit/FORBIDDEN_PATTERNS.md (F3).\n${violations.join('\n')}`,
  );
});

Deno.test('F4: every `return [];` after catch/if(error) carries FAIL-OPEN BY DESIGN', async () => {
  const files = await readAllFiles();
  const violations: string[] = [];
  // Heuristic: a `return [];` line is suspect when within the prior 5 lines
  // there is a `catch (` opener or an `if (error` guard, AND there is NO
  // `FAIL-OPEN BY DESIGN` comment within ±5 lines.
  for (const { rel, lines } of files) {
    lines.forEach((line, idx) => {
      if (!/^\s*return \[\];\s*$/.test(line)) return;
      const windowStart = Math.max(0, idx - 5);
      const windowEnd = Math.min(lines.length, idx + 6);
      const before = lines.slice(windowStart, idx).join('\n');
      const around = lines.slice(windowStart, windowEnd).join('\n');
      const suspect = /catch\s*\(|if\s*\(\s*error\b/.test(before);
      if (!suspect) return;
      if (/FAIL-OPEN BY DESIGN/.test(around)) return;
      violations.push(`${rel}:${idx + 1}  → ${line.trim()}`);
    });
  }
  assertEquals(
    violations,
    [],
    `Silent fail-open detected. Either throw a typed error or add FAIL-OPEN BY DESIGN justification. See _audit/FORBIDDEN_PATTERNS.md (F4).\n${violations.join('\n')}`,
  );
});
