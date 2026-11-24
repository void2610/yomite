#!/usr/bin/env node
// 使い方:
//   YOMITE_URL=... YOMITE_TOKEN=... node scripts/inbox-fetch.mjs [--take-all | --take <id>]
// 既定では未取り込みの依頼を一覧表示するだけ。--take / --take-all で取り込み済みにする。
const base = process.env.YOMITE_URL;
const token = process.env.YOMITE_TOKEN;
if (!base) { console.error("YOMITE_URL が未設定です"); process.exit(1); }
const headers = token ? { authorization: `Bearer ${token}` } : {};
const root = base.replace(/\/$/, "");

async function take(id) {
  const res = await fetch(`${root}/api/inbox/${id}/taken`, { method: "POST", headers });
  if (!res.ok) throw new Error(`taken failed for ${id}: ${res.status}`);
}

const args = process.argv.slice(2);
if (args[0] === "--take" && args[1]) {
  await take(args[1]);
  console.log(`taken: ${args[1]}`);
  process.exit(0);
}
const res = await fetch(`${root}/api/inbox`, { headers });
if (!res.ok) { console.error(`fetch failed: ${res.status}`); process.exit(1); }
const { inbox } = await res.json();
if (!inbox.length) { console.log("インボックスは空です"); process.exit(0); }
for (const item of inbox) {
  console.log(`#${item.id} [${item.created_at}] ${item.body}`);
}
if (args[0] === "--take-all") {
  for (const item of inbox) await take(item.id);
  console.log(`${inbox.length} 件を取り込み済みにしました`);
}
