#!/usr/bin/env node
// 使い方:
//   YOMITE_URL=https://yomite.<your>.workers.dev \
//   YOMITE_TOKEN=<PUBLISH_TOKEN> \
//   node scripts/publish.mjs <file.html> --title "..." --project "..." [--summary "..."] [--decision "..."]
import { readFile } from "node:fs/promises";
import { lintHtml } from "./lint.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
function opt(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const base = process.env.YOMITE_URL;
const token = process.env.YOMITE_TOKEN;
if (!file || !opt("title")) {
  console.error('usage: node scripts/publish.mjs <file.html> --title "..." --project "..." [--summary "..."] [--decision "..."]');
  process.exit(1);
}
if (!base) { console.error("YOMITE_URL が未設定です"); process.exit(1); }

const html = await readFile(file, "utf8");
// 公開前 lint (スライド64): 警告のみで公開は止めない
for (const w of lintHtml(html, file)) console.error(`⚠ [lint:${w.kind}] ${w.msg}`);
const res = await fetch(`${base.replace(/\/$/, "")}/api/pages`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({
    title: opt("title"),
    project: opt("project") || "未分類",
    summary: opt("summary") || "",
    decision_points: opt("decision") || "",
    html,
  }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`publish failed: ${res.status}`, data); process.exit(1); }
console.log(`${base.replace(/\/$/, "")}${data.url}`);
