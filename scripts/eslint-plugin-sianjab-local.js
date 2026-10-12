/**
 * Plugin ESLint lokal Sianjab.
 *
 * Rule : sianjab-local/no-localstorage-draft-without-server-guard
 * Tujuan: mencegah regresi bug "draft localStorage menimpa data server".
 *
 * Riwayat bug (2026-10): TabIdentitas & TabTugasPokok selalu memilih draft
 * `anjab_draft_*` dari localStorage dan mengabaikan data server, sehingga
 * hasil Import Anjab / Draf AI terlihat "tidak terupdate" di editor.
 *
 * Aturan praktisnya (tengara dalam komen penjelasan + penegakan di bawah):
 *   1. Draft yang DIBACA dari localStorage hanya boleh dipakai jika ada
 *      pembanding kebaruan dengan `updatedAt` data server.
 *   2. Draft yang DITULIS ke localStorage wajib memuat timestamp
 *      `_draftSavedAt` agar perbandingan di (1) mungkin dilakukan.
 *
 * Rule ini heuristik (berbasis token, bukan analisis tipe) yang dirancang
 * agar false-negative-nya mudah dideteksi: bila pola draft-putus-putus
 * muncul lagi, developer akan melihat error jelas beserta petunjuk perbaikan
 * yang merujuk ke komentar deskripsi rule ini.
 */
"use strict";

const draftKeyPattern = /anjab_draft_/;

// Bentuk teks yang dianggap sebagai bukti perbandingan dengan `updatedAt`.
const guardTokenPatterns = [
  /\.updatedAt\b/,
  /\bdraftIsNewer\b/,
  /_draftSavedAt\b/,
];

// Bentuk teks yang dianggap sebagai bukti timestamp disertakan saat menulis draft.
const savedAtTokenPatterns = [/_draftSavedAt\b/];

function rule({ context, mode }) {
  return {
    CallExpression(node) {
      if (mode !== "read") return;

      const callee = node.callee;
      const isGet =
        callee?.type === "MemberExpression" &&
        callee.object?.name === "localStorage" &&
        callee.property?.name === "getItem";

      if (!isGet) return;
      const [arg] = node.arguments;
      if (!arg || arg.type !== "TemplateLiteral") return;

      const hasDraftKey = arg.quasis.some((q) => draftKeyPattern.test(q.value.raw));
      if (!hasDraftKey) return;

      // Guard dinilai per-FILE: asalkan file tersebut membandingkan draft
      // dengan updatedAt/_draftSavedAt/draftIsNewer di bagian manapun, semua
      // getItem draft file itu dianggap ber-guard. Pemeriksaan per-statement
      // terlalu rapuh untuk pola guard multi-baris yang kebetulan berada di
      // ekspresi berbeda dari pemanggilan getItem.
      const guarded = guardTokenPatterns.some((re) => {
        try {
          return re.test(context.sourceCode.getText());
        } catch {
          return false;
        }
      });
      if (guarded) return;

      context.report({
        node,
        messageId: "missingGuard",
        data: {
          fix: [
            "Pola draft localStorage tanpa guard terdeteksi.",
            "Draft hanya boleh memenangkan data server bila lebih baru:",
            "  const draftMeta = JSON.parse(savedDraft) ?? {};",
            "  const draftIsNewer = draftMeta?._draftSavedAt && jabatan.updatedAt &&",
            "    new Date(draftMeta._draftSavedAt) > new Date(jabatan.updatedAt);",
            "Rujuk: TabIdentitas.tsx / TabTugasPokok.tsx sebagai contoh benar.",
          ].join(" "),
        },
      });
    },
  };
}

function makeRule(mode) {
  return (context) => rule({ context, mode });
}

module.exports = {
  rules: {
    "no-localstorage-draft-without-server-guard": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Draft `anjab_draft_*` dari localStorage wajib dibandingkan dengan `updatedAt` data server sebelum menimpa tampilan, dan penulisan draft wajib menyertakan `_draftSavedAt`.",
        },
        schema: [],
        messages: {
          missingGuard:
            "Pembacaan draft localStorage '{{key}}' tanpa guard updatedAt server. {{fix}}",
          missingSavedAt:
            "Penulisan draft localStorage '{{key}}' tanpa timestamp '_draftSavedAt'. Guard pembacaan membutuhkan timestamp ini untuk membandingkan kebaruan dengan updatedAt server.",
        },
      },
      create: makeRule("read"),
    },

    "no-localstorage-draft-write-without-timestamp": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Penulisan `anjab_draft_*` ke localStorage wajib menyertakan field timestamp `_draftSavedAt`.",
        },
        schema: [],
        messages: {
          missingSavedAt:
            "Penulisan draft localStorage '{{key}}' tanpa timestamp '_draftSavedAt'. Guard pembacaan membutuhkan timestamp ini untuk membandingkan kebaruan dengan updatedAt server.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            const callee = node.callee;
            const isSet =
              callee?.type === "MemberExpression" &&
              callee.object?.name === "localStorage" &&
              callee.property?.name === "setItem";
            if (!isSet) return;

            const [keyArg] = node.arguments;
            if (!keyArg || keyArg.type !== "TemplateLiteral") return;
            const hasDraftKey = keyArg.quasis.some((q) => draftKeyPattern.test(q.value.raw));
            if (!hasDraftKey) return;
            if (node.arguments.length < 2) return;

            const valueArg = node.arguments[1];
            const hasTimestamp = savedAtTokenPatterns.some((re) => {
              try {
                return re.test(context.sourceCode.getText(valueArg));
              } catch {
                return false;
              }
            });
            if (hasTimestamp) return;

            context.report({
              node: valueArg,
              messageId: "missingSavedAt",
              data: { key: keyArg.quasis.map((q) => q.value.raw).join("${...}") },
            });
          },
        };
      },
    },
  },
};
