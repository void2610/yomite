#!/usr/bin/env node
// Yomite 公開前チェック (スライド64「体裁のルールもスクリプトに」の再現)
//   node scripts/lint.mjs <file.html>
// 警告を出しますが、公開は止めません (exit code は常に 0)。
// チェック内容:
//   1. 図・画像が1枚も無いページへの警告 (図解の無い報告は判断しづらい)
//   2. AIっぽい定型句への警告 (下の AI_PHRASES で編集可能)
//   3. 表の見出し・色の崩れ: thead/th の欠落、th の背景色指定の欠落

// --- 編集可能: AIっぽい言い回しのリスト ---
export const AI_PHRASES = [
  "いかがでしたか",
  "お役に立てれば幸いです",
  "ご不明な点がございましたら",
  "まとめると",
  "結論として",
  "重要なのは",
  "ポイントは以下の通りです",
  "以下にまとめます",
  "ぜひご活用ください",
  "させていただきます",
  "の世界",
  "〜と言えるでしょう",
  "ではないでしょうか",
  "多岐にわたります",
  "包括的に",
  "シームレス",
  "ワンストップ",
  "ご参考になれば",
];

export function lintHtml(html, file = "") {
  const warnings = [];
  const push = (kind, msg) => warnings.push({ kind, msg, file });

  // 1. 図・画像チェック: <img>, <svg>, <canvas>, <figure>, 画像ファイルへのリンク
  const hasFigure =
    /<img[\s>]/i.test(html) ||
    /<svg[\s>]/i.test(html) ||
    /<canvas[\s>]/i.test(html) ||
    /<figure[\s>]/i.test(html) ||
    /\.(png|jpe?g|gif|webp|svg)(["'?#])/i.test(html);
  if (!hasFigure) {
    push("figure", "図・画像が1枚もありません。図解を1枚入れると判断が速くなります");
  }

  // 2. AIっぽい定型句
  for (const phrase of AI_PHRASES) {
    if (phrase.includes("〜")) continue; // パターン指定は目視用
    if (html.includes(phrase)) {
      push("phrase", `AIっぽい定型句が含まれています: 「${phrase}」`);
    }
  }

  // 3. 表の見出し・色
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  tables.forEach((t, i) => {
    const n = `表${i + 1}`;
    if (!/<th[\s>]/i.test(t)) {
      push("table", `${n} に見出しセル (<th>) がありません`);
    }
    if (!/<thead[\s>]/i.test(t)) {
      push("table", `${n} に <thead> がありません。見出し行を <thead> に入れてください`);
    }
    const thBlock = (t.match(/<th[^>]*>/gi) || []).join(" ");
    const styleBlocks = (html.match(/<style[\s\S]*?<\/style>/gi) || []).join(" ");
    const thStyled =
      /background/i.test(thBlock) ||
      /th\s*\{[^}]*background/i.test(styleBlocks) ||
      /thead[^{]*\{[^}]*background/i.test(styleBlocks);
    if (/<th[\s>]/i.test(t) && !thStyled) {
      push("table", `${n} の見出しに背景色の指定が見当たりません (th の色崩れチェック)`);
    }
    // タグの対応崩れの簡易チェック
    const openTr = (t.match(/<tr[\s>]/gi) || []).length;
    const closeTr = (t.match(/<\/tr>/gi) || []).length;
    if (openTr !== closeTr) {
      push("table", `${n} の <tr> と </tr> の数が一致しません (${openTr}/${closeTr})`);
    }
  });

  return warnings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile } = await import("node:fs/promises");
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/lint.mjs <file.html>");
    process.exit(1);
  }
  const html = await readFile(file, "utf8");
  const warnings = lintHtml(html, file);
  for (const w of warnings) console.error(`⚠ [lint:${w.kind}] ${w.msg}`);
  if (!warnings.length) console.error("✓ lint: 警告なし");
}
