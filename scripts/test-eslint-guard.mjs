/**
 * Self-test ESLint rule draft-guard Sianjab (bukan bagian dari bundle aplikasi).
 *
 * Jalankan:  node scripts/test-eslint-guard.mjs
 * Ekspektasi: exit 0 bila rule menangkap pola buruk dan membiarkan pola jujur.
 */
import { createRequire } from "node:module";
import { Linter } from "eslint";

const require = createRequire(import.meta.url);
const plugin = require("./eslint-plugin-sianjab-local.js");

const ruleName = "sianjab-local/no-localstorage-draft-without-server-guard";
const writeRuleName = "sianjab-local/no-localstorage-draft-write-without-timestamp";

const config = {
  plugins: { "sianjab-local": plugin },
  rules: {
    [ruleName]: "error",
    [writeRuleName]: "error",
  },
};

const cases = [
  {
    name: "bad: getItem anjab_draft_ tanpa guard -> HARUS error",
    code: `function f() {
      const saved = localStorage.getItem(\`anjab_draft_identitas_\${id}\`);
      if (saved) { return JSON.parse(saved); }
      return null;
    }`,
    expect: 1,
  },
  {
    name: "bad: setItem anjab_draft_ tanpa _draftSavedAt -> HARUS error",
    code: `function f() {
      localStorage.setItem(\`anjab_draft_tugas_\${id}\`, JSON.stringify(form));
    }`,
    expect: 1,
  },
  {
    name: "good: getItem dengan guard updatedAt + _draftSavedAt -> HARUS lolos",
    code: `function f(jabatan) {
      const savedDraft = localStorage.getItem(\`anjab_draft_identitas_\${jabatan.id}\`);
      let draftMeta = null;
      try { draftMeta = savedDraft ? JSON.parse(savedDraft) : null; } catch { draftMeta = null; }
      const draftIsNewer = !!(savedDraft && jabatan.updatedAt && draftMeta?._draftSavedAt &&
        new Date(draftMeta._draftSavedAt).getTime() > new Date(jabatan.updatedAt).getTime());
      if (savedDraft && draftIsNewer) { return draftMeta; }
      return null;
    }`,
    expect: 0,
  },
  {
    name: "good: setItem dengan _draftSavedAt -> HARUS lolos",
    code: `function f(jabatan, form) {
      localStorage.setItem(\`anjab_draft_identitas_\${jabatan.id}\`, JSON.stringify({
        ...form,
        _draftSavedAt: new Date().toISOString(),
      }));
    }`,
    expect: 0,
  },
  {
    name: "unrelated: getItem non-draft -> HARUS lolos",
    code: `function f() {
      return localStorage.getItem('sianjab_active_year');
    }`,
    expect: 0,
  },
];

const linter = new Linter();
let failed = 0;

for (const c of cases) {
  const messages = linter.verify(c.code, config, "test.js");
  const hits = messages.filter((m) => m.ruleId && m.ruleId.startsWith("sianjab-local"));
  const gotHits = hits.length > 0;
  const wantHits = c.expect > 0;

  if (gotHits === wantHits) {
    console.log(`PASS  ${c.name}`);
  } else {
    failed++;
    console.log(`FAIL  ${c.name}`);
    console.log("      expect hit:", wantHits, "got:", gotHits);
    for (const m of messages) console.log("      ->", m.ruleId || "(parse)", m.message);
  }
}

if (failed > 0) {
  console.log(`\n${failed} kasus gagal`);
  process.exit(1);
}
console.log("\nSemua self-test draft-guard lulus.");
