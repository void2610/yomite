#!/usr/bin/env node
// Yomite の判断キット回答 (サーバー保存分) を読む CLI
//   YOMITE_URL=... YOMITE_TOKEN=... node scripts/answers.mjs <slug>   その記事の回答
//   YOMITE_URL=... YOMITE_TOKEN=... node scripts/answers.mjs --all    全記事の新しい順
const base = process.env.YOMITE_URL;
const token = process.env.YOMITE_TOKEN;
if (!base) { console.error("YOMITE_URL が未設定です"); process.exit(1); }
const arg = process.argv[2];
let url, headers = {};
if (arg === "--all") {
  if (!token) { console.error("YOMITE_TOKEN が未設定です"); process.exit(1); }
  url = `${base}/api/answers`;
  headers.authorization = `Bearer ${token}`;
} else if (arg) {
  url = `${base}/api/answers/${encodeURIComponent(arg)}`;
} else {
  console.error("使い方: answers.mjs <slug> | --all");
  process.exit(1);
}
const r = await fetch(url, { headers });
if (!r.ok) { console.error(`取得に失敗しました (${r.status})`); process.exit(1); }
const data = await r.json();
if (!data.answers.length) { console.log("(回答はまだありません)"); process.exit(0); }
for (const a of data.answers) {
  const parts = [a.slug ? `[${a.slug}]` : "", a.question, a.choice, a.comment ? `(${a.comment})` : "", a.updated_at].filter(Boolean);
  console.log(parts.join(" "));
}
