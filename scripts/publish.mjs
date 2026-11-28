#!/usr/bin/env node
// 使い方:
//   YOMITE_URL=https://yomite.<your>.workers.dev \
//   YOMITE_TOKEN=<PUBLISH_TOKEN> \
//   node scripts/publish.mjs <file.md|file.html> --title "..." --project "..." \
//     [--summary "..."] [--decision "..."] [--slug "..."]
//
// .md が基本形。見た目は Yomite 側が統一テンプレートで描く。
// md 内の独自形式:
//   :::html                 … 次の ::: まで raw HTML を埋め込む
//   :::html src="part.html" … 外部 HTML ファイルを読み込む (この CLI が送信前に中身へ展開する)
//   :::decision             … 次の ::: までを判断ポイント枠にする
// .html は旧形式としてそのまま公開できる (移行期間用)。
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname, resolve } from "node:path";
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
  console.error('usage: node scripts/publish.mjs <file.md|file.html> --title "..." --project "..." --emoji "🔬" [--summary "..."] [--decision "..."] [--slug "..."]');
  process.exit(1);
}
if (!opt("emoji")) {
  console.error("--emoji が必須です。記事の内容に合った絵文字アイコンを1つ付けてください（未指定だとデフォルトの 📄 で表示され未完成に見えます）");
  process.exit(1);
}
if (!base) { console.error("YOMITE_URL が未設定です"); process.exit(1); }

const isMd = file.toLowerCase().endsWith(".md");
const raw = await readFile(file, "utf8");

let payload;
if (isMd) {
  // :::html src="..." の読み込みを、md ファイルからの相対パスで中身へ展開する
  const dir = dirname(resolve(file));
  const lines = raw.split("\n");
  const out = [];
  for (const line of lines) {
    const m = line.match(/^:::html\s+src="([^"]+)"\s*$/);
    if (!m) { out.push(line); continue; }
    const part = await readFile(resolve(dir, m[1]), "utf8");
    out.push(":::html", part.replace(/\n$/, ""), ":::");
    console.error(`▸ html を読み込みました: ${m[1]} (${part.length} bytes)`);
  }
  payload = { format: "md", md: out.join("\n") };
} else {
  for (const w of lintHtml(raw, file)) console.error(`⚠ [lint:${w.kind}] ${w.msg}`);
  payload = { format: "html", html: raw };
}

// OGP 画像 (タイトル入り) を生成して一緒に送る。失敗しても公開は続ける。
let ogImageB64 = "";
try {
  const ogPath = join(tmpdir(), `yomite-og-${process.pid}.png`);
  await promisify(execFile)("python3", [new URL("./og_image.py", import.meta.url).pathname, opt("title"), ogPath]);
  ogImageB64 = Buffer.from(await readFile(ogPath)).toString("base64");
} catch (e) {
  console.error("⚠ OGP 画像の生成に失敗しました:", e.message);
}

const res = await fetch(`${base.replace(/\/$/, "")}/api/pages`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({
    ...payload,
    title: opt("title"),
    project: opt("project") || "未分類",
    summary: opt("summary") || "",
    decision_points: opt("decision") || "",
    ...(opt("slug") ? { slug: opt("slug") } : {}),
    ...(opt("emoji") ? { emoji: opt("emoji") } : {}),
    ...(ogImageB64 ? { og_image_b64: ogImageB64 } : {}),
  }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`publish failed: ${res.status}`, data); process.exit(1); }
console.log(`${base.replace(/\/$/, "")}${data.url}`);
