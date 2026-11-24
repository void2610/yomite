#!/usr/bin/env node
// スレッド名係 (スライド23) の最小実装:
// セッションの状態から、名前の頭に付ける絵文字を決める。
//   ⏳ 作業中 (working) / ✅ 終わった (done) / ⚠ 私の番 (waiting)
// 使い方:
//   node scripts/session-status.mjs sessions.json
//   sessions.json = [{ "name": "経費精算 明細の照合", "state": "done" }, ...]
// 出力: 絵文字付きの名前を1行ずつ。--watch を付けると10分おきに再出力する。
import { readFile } from "node:fs/promises";

export const STATUS_EMOJI = { working: "⏳", done: "✅", waiting: "⚠" };

export function withStatusEmoji(name, state) {
  const e = STATUS_EMOJI[state];
  if (!e) throw new Error(`unknown state: ${state} (working|done|waiting)`);
  const stripped = String(name).replace(/^(⏳|✅|⚠|⚠️)\s*/, "");
  return `${e} ${stripped}`;
}

async function print(file) {
  const sessions = JSON.parse(await readFile(file, "utf8"));
  for (const s of sessions) console.log(withStatusEmoji(s.name, s.state));
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!file) {
    console.error("usage: node scripts/session-status.mjs <sessions.json> [--watch]");
    process.exit(1);
  }
  await print(file);
  if (args.includes("--watch")) {
    setInterval(() => print(file).catch((e) => console.error(e.message)), 10 * 60 * 1000);
  }
}
