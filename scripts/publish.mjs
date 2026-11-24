#!/usr/bin/env node
// 使い方:
//   HTML_KYOYU_URL=https://html-kyoyu.<your>.workers.dev \
//   HTML_KYOYU_TOKEN=<PUBLISH_TOKEN> \
//   node scripts/publish.mjs <file.html> --title "..." --project "..." [--summary "..."] [--decision "..."]
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
function opt(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const base = process.env.HTML_KYOYU_URL;
const token = process.env.HTML_KYOYU_TOKEN;
if (!file || !opt("title")) {
  console.error('usage: node scripts/publish.mjs <file.html> --title "..." --project "..." [--summary "..."] [--decision "..."]');
  process.exit(1);
}
if (!base) { console.error("HTML_KYOYU_URL が未設定です"); process.exit(1); }

const html = await readFile(file, "utf8");
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
