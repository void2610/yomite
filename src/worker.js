// Yomite — Cloudflare Worker
// Reader UI (inline) + JSON API. Storage: R2 (HTML files / inbox images) + D1 (metadata / inbox).
// UI は講演「認知負荷の減らし方」の HTML共有くん (スライド12・21) の配置に合わせたもの。
// Publish & inbox-fetch require the PUBLISH_TOKEN secret (Authorization: Bearer <token>).
// If PUBLISH_TOKEN is not set (local dev), auth checks are bypassed — see README.
import { renderPageFromMd } from "./markdown.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function checkToken(request, env) {
  if (!env.PUBLISH_TOKEN) return true; // local dev bypass (documented)
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${env.PUBLISH_TOKEN}`;
}

function makeSlug(title) {
  const base = (title || "page")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  const stamp = new Date().toISOString().slice(0, 10);
  return base ? `${stamp}-${base}-${rand}` : `${stamp}-${rand}`;
}

async function listPages(request, env) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project");
  const q = url.searchParams.get("q");
  let sql = "SELECT id, slug, title, project, summary, decision_points, created_at, updated_at, pinned, read_at FROM pages";
  const conds = [];
  const binds = [];
  if (project) { conds.push("project = ?"); binds.push(project); }
  if (q) {
    conds.push("(title LIKE ? OR summary LIKE ? OR project LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY pinned DESC, created_at DESC";
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  let marks = [];
  try {
    const m = await env.DB.prepare("SELECT project, pinned, starred FROM project_marks").all();
    marks = m.results || [];
  } catch { /* migration 0002 not applied yet */ }
  return json({ pages: results, marks });
}

async function setProjectMark(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const project = body && body.project ? String(body.project) : "";
  if (!project) return json({ error: "project is required" }, 400);
  const cur = await env.DB.prepare("SELECT pinned, starred FROM project_marks WHERE project = ?").bind(project).first();
  const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : (cur ? cur.pinned : 0);
  const starred = body.starred !== undefined ? (body.starred ? 1 : 0) : (cur ? cur.starred : 0);
  await env.DB.prepare(
    `INSERT INTO project_marks (project, pinned, starred) VALUES (?, ?, ?)
     ON CONFLICT(project) DO UPDATE SET pinned=excluded.pinned, starred=excluded.starred`
  ).bind(project, pinned, starred).run();
  return json({ ok: true, project, pinned: !!pinned, starred: !!starred });
}

async function publishPage(request, env) {
  if (!checkToken(request, env)) return json({ error: "unauthorized" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { title, project, summary, decision_points } = body || {};
  const md = body && typeof body.md === "string" ? body.md : null;
  let html = body && typeof body.html === "string" ? body.html : null;
  if (!title || (!html && md === null)) return json({ error: "title and html (or md) are required" }, 400);
  const slug = body.slug ? String(body.slug).replace(/[^a-z0-9-]/gi, "-").toLowerCase() : makeSlug(title);
  if (md !== null) {
    // md 原稿が正。見た目は Yomite 側の統一テンプレートで描き、描画結果を .html に、
    // 原稿そのものを .md に保存する (再編集は .md から行う)。
    html = renderPageFromMd({ title, project, summary, decisionPoints: decision_points, md, slug });
    await env.PAGES_BUCKET.put(`pages/${slug}.md`, md, {
      httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    });
  }
  await env.PAGES_BUCKET.put(`pages/${slug}.html`, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await env.DB.prepare(
    `INSERT INTO pages (slug, title, project, summary, decision_points)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET title=excluded.title, project=excluded.project,
       summary=excluded.summary, decision_points=excluded.decision_points,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`
  ).bind(slug, title, project || "未分類", summary || "", decision_points || "").run();
  return json({ slug, url: `/p/${slug}`, format: md !== null ? "md" : "html" }, 201);
}

// md 原稿の原文 (再編集用)。md で公開されたページだけに存在する。
async function serveSource(slug, env) {
  const obj = await env.PAGES_BUCKET.get(`pages/${slug}.md`);
  if (!obj) return new Response("no markdown source for this page", { status: 404 });
  return new Response(obj.body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}

// 公開ページから一覧へ戻る導線。テンプレート側に href="/" のリンク (パンくず/末尾の戻るリンク)
// が無い既存ページには、配信時に右上のピルを差し込んで行き止まりを無くす。
const BACK_PILL = `<style>.yomite-backpill{position:fixed;top:10px;right:10px;z-index:9999;background:rgba(18,41,77,.93);color:#fff;text-decoration:none;font:600 13px/1.5 system-ui,-apple-system,"Hiragino Sans",sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(18,41,77,.35)}@media (prefers-color-scheme:dark){.yomite-backpill{background:rgba(36,78,128,.96);border:1px solid rgba(140,190,230,.55);box-shadow:0 4px 14px rgba(0,0,0,.55)}}</style><a class="yomite-backpill" href="/">← Yomite トップへ</a>`;

const NOT_FOUND_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ページが見つかりません | Yomite</title>
<style>:root{color-scheme:light dark}
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:#eef3f7;color:#1c2733;padding:48px 18px;text-align:center}
a.back{display:inline-block;margin-top:18px;color:#0e7ea4;font-weight:700;text-decoration:none;border:1px solid #9fc6dd;border-radius:999px;padding:10px 22px;background:#fff}
@media (prefers-color-scheme:dark){body{background:#0c141f;color:#d9e6f2}h1{color:#eaf3fb!important}a.back{background:#16222f;border-color:#3d6a8c;color:#45bcd8}}</style>
</head><body>
<h1 style="font-size:20px;color:#12294d">ページが見つかりません</h1>
<p>URLが変わったか、ページが削除された可能性があります。</p>
<a class="back" href="/">← Yomite トップへ戻る</a>
</body></html>`;

async function servePage(slug, env) {
  const obj = await env.PAGES_BUCKET.get(`pages/${slug}.html`);
  if (!obj) {
    return new Response(NOT_FOUND_HTML, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  let html = await obj.text();
  if (!html.includes("yomite-backpill") && !html.includes('href="/"')) {
    html = html.includes("</body>") ? html.replace("</body>", BACK_PILL + "</body>") : html + BACK_PILL;
  }
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function markRead(slug, env) {
  const res = await env.DB.prepare(
    "UPDATE pages SET read_at = COALESCE(read_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE slug = ?"
  ).bind(slug).run();
  if (!res.meta.changes) return json({ error: "not found" }, 404);
  return json({ ok: true, slug });
}

async function togglePin(slug, env) {
  const row = await env.DB.prepare("SELECT pinned FROM pages WHERE slug = ?").bind(slug).first();
  if (!row) return json({ error: "not found" }, 404);
  const pinned = row.pinned ? 0 : 1;
  await env.DB.prepare("UPDATE pages SET pinned = ? WHERE slug = ?").bind(pinned, slug).run();
  return json({ ok: true, slug, pinned: !!pinned });
}

async function listInbox(request, env) {
  if (!checkToken(request, env)) return json({ error: "unauthorized" }, 401);
  const { results } = await env.DB.prepare(
    "SELECT id, body, project, image_key, created_at, taken_at FROM inbox WHERE taken_at IS NULL ORDER BY created_at ASC"
  ).all();
  return json({ inbox: results });
}

// Public read: the site is public-read by Izumi's decision (2026-11-24), so anyone can see what was sent.
async function inboxHistory(request, env) {
  const { results } = await env.DB.prepare(
    "SELECT id, body, project, image_key, created_at, taken_at FROM inbox ORDER BY created_at DESC, id DESC LIMIT 50"
  ).all();
  return json({ inbox: results });
}

// Image attachment for inbox items (スライド21 の「画像」ボタン).
// Accepts JSON { filename, contentType, data } where data is base64. Stored in R2 under inbox/.
const IMAGE_EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp" };
async function uploadInboxImage(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const contentType = body && body.contentType ? String(body.contentType) : "";
  const ext = IMAGE_EXT[contentType];
  if (!ext) return json({ error: "unsupported image type" }, 400);
  const data = body && body.data ? String(body.data) : "";
  if (!data || data.length > 9_000_000) return json({ error: "image missing or too large" }, 400);
  let bytes;
  try {
    const bin = atob(data);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { return json({ error: "invalid base64" }, 400); }
  const key = `inbox/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  await env.PAGES_BUCKET.put(key, bytes, { httpMetadata: { contentType } });
  return json({ ok: true, key }, 201);
}

async function serveMedia(key, env) {
  if (!key.startsWith("inbox/")) return new Response("not found", { status: 404 });
  const obj = await env.PAGES_BUCKET.get(key);
  if (!obj) return new Response("not found", { status: 404 });
  const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream";
  return new Response(obj.body, { headers: { "content-type": ct } });
}

// Instant notification via Cloudflare Email (send_email binding NOTIFY).
// Destination is Muse's own mailbox so new requests surface without polling.
// Any failure here must never fail the inbox POST itself — catch and log only.
const NOTIFY_TO = "yomite@muse.ai";
const NOTIFY_FROM = "yomite@void2610.dev";

async function notifyInbox(env, item) {
  try {
    if (!env.NOTIFY || typeof env.NOTIFY.send !== "function") {
      console.log("notify skipped: NOTIFY binding not configured");
      return;
    }
    const lines = [
      `Yomite のインボックスに新しい依頼が届きました。`,
      ``,
      `ID: ${item.id}`,
      `作成日時: ${item.created_at}`,
    ];
    if (item.project) lines.push(`プロジェクト: ${item.project}`);
    if (item.image_key) lines.push(`画像: https://yomite.void2610.workers.dev/media/${item.image_key}`);
    lines.push(``, `--- 依頼本文 ---`, item.body);
    await env.NOTIFY.send({
      to: NOTIFY_TO,
      from: NOTIFY_FROM,
      subject: `[Yomite] インボックス #${item.id}`,
      text: lines.join("\n"),
    });
  } catch (e) {
    console.log("notify failed:", e && e.message ? e.message : String(e));
  }
}

async function addInbox(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const text = (body && body.body ? String(body.body) : "").trim();
  if (!text) return json({ error: "body is required" }, 400);
  const project = body && body.project ? String(body.project).slice(0, 80) : "";
  const imageKey = body && body.image_key && String(body.image_key).startsWith("inbox/") ? String(body.image_key) : null;
  const ins = await env.DB.prepare(
    "INSERT INTO inbox (body, project, image_key) VALUES (?, ?, ?)"
  ).bind(text, project, imageKey).run();
  const id = ins.meta.last_row_id;
  const item = await env.DB.prepare("SELECT id, body, project, image_key, created_at FROM inbox WHERE id = ?").bind(id).first();
  if (item) {
    const notify = notifyInbox(env, item);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notify);
    else await notify;
  }
  return json({ ok: true, id }, 201);
}

async function takeInbox(id, request, env) {
  if (!checkToken(request, env)) return json({ error: "unauthorized" }, 401);
  const res = await env.DB.prepare(
    "UPDATE inbox SET taken_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND taken_at IS NULL"
  ).bind(Number(id)).run();
  if (!res.meta.changes) return json({ error: "not found or already taken" }, 404);
  return json({ ok: true, id: Number(id) });
}

// --- 判断キット/レポート書式 (public/ 配下の同名ファイルと同一内容を /kit/ で配信) ---
const REVIEW_CSS = "/* Yomite \u5224\u65ad\u30ad\u30c3\u30c8 \u2014 \u30b9\u30e9\u30a4\u30c925\u30fb28\u30fb29\u30fb31\u30fb32\u30fb35 \u306e\u5224\u65adUI\u3092\u518d\u73fe\u3059\u308b\u90e8\u54c1\n   \u4f7f\u3044\u65b9: \u516c\u958b\u30da\u30fc\u30b8\u306b <link rel=\"stylesheet\" href=\"/kit/review.css\"> \u3092\u5165\u308c\u3001\n   \u5224\u65ad\u9805\u76ee\u3092 .rv-item \u3067\u66f8\u304d\u3001\u672b\u5c3e\u306b .rv-copybar \u3068 <script src=\"/kit/review.js\"> \u3092\u7f6e\u304f\u3002\n   \u8272\u306f CSS \u5909\u6570\u7d4c\u7531\u3002\u30e9\u30a4\u30c8\u304c\u65e2\u5b9a\u3067\u3001OS \u304c\u30c0\u30fc\u30af\u30e2\u30fc\u30c9\u306e\u3068\u304d\u306f\n   prefers-color-scheme \u3067\u5909\u6570\u3054\u3068\u5207\u308a\u66ff\u308f\u308b (\u516c\u958b\u6e08\u307f\u30da\u30fc\u30b8\u3082\u518d\u516c\u958b\u306a\u3057\u3067\u8ffd\u5f93)\u3002\n   \u8d64\u67a0 (#e5484d) \u306f\u4e21\u30e2\u30fc\u30c9\u5171\u901a\u3067\u3001\u30c0\u30fc\u30af\u5074\u306f\u80cc\u666f\u3068\u898b\u51fa\u3057\u3092\u8d64\u7cfb\u306b\u5bc4\u305b\u3066\u8996\u8a8d\u6027\u3092\u4fdd\u3064\u3002 */\n:root{\n  color-scheme:light dark;\n  --rv-card:#fff; --rv-border:#dfe5ec; --rv-border2:#c3ccd6;\n  --rv-text:#222; --rv-heading:#12294d; --rv-accent:#0e7ea4; --rv-muted:#888;\n  --rv-shadow:rgba(30,60,90,.06);\n  --rv-count-bg:#fdf0f2; --rv-count-color:#c62f35;\n  --rv-decision-bg:#fdf3f4; --rv-decision-h:#a02c30; --rv-plan-border:#e3d7d8;\n  --rv-quote-bg:#eceaf3;\n  --rv-badge-bg:#e8eaee; --rv-badge-color:#444;\n  --rv-mark-bg:#fff0a6;\n  --rv-cmp-now-bg:#eef0f4; --rv-cmp-plan-bg:#eef6fd;\n  --rv-copybar-bg:rgba(246,248,250,.92);\n}\n@media (prefers-color-scheme: dark){\n  :root{\n    --rv-card:#16222f; --rv-border:#2b3e52; --rv-border2:#38506b;\n    --rv-text:#d9e6f2; --rv-heading:#eaf3fb; --rv-accent:#45bcd8; --rv-muted:#7e93a8;\n    --rv-shadow:rgba(0,0,0,.45);\n    --rv-count-bg:#3d1d22; --rv-count-color:#ff9aa0;\n    --rv-decision-bg:#38161a; --rv-decision-h:#ff9aa0; --rv-plan-border:#5a343a;\n    --rv-quote-bg:#272a3d;\n    --rv-badge-bg:#2a3646; --rv-badge-color:#c3d2e0;\n    --rv-mark-bg:#7a5f10;\n    --rv-cmp-now-bg:#202b3a; --rv-cmp-plan-bg:#14293f;\n    --rv-copybar-bg:rgba(13,20,29,.92);\n  }\n  .rv-ba mark,.rv-item mark{color:#ffe9a0}\n}\n\n/* \u5224\u65ad\u30ab\u30fc\u30c9 (\u30b9\u30e9\u30a4\u30c931) */\n.rv-item{background:var(--rv-card);border:1px solid var(--rv-border);border-radius:14px;padding:16px 18px;margin:18px 0;box-shadow:0 2px 10px var(--rv-shadow)}\n.rv-num{color:var(--rv-accent);font-size:13px;font-weight:700;letter-spacing:.08em}\n.rv-item h3{margin:2px 0 8px;font-size:19px;color:var(--rv-heading)}\n.rv-badge{display:inline-block;background:#e5484d;color:#fff;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;vertical-align:middle;margin-left:6px}\n.rv-badge-count{display:inline-block;background:var(--rv-count-bg);border:1px solid #e5484d;color:var(--rv-count-color);font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;vertical-align:middle;margin-left:6px}\n.rv-q{font-weight:700;color:var(--rv-heading);margin:12px 0 8px}\n.rv-choices{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}\n.rv-opt{border:1px solid var(--rv-border2);background:var(--rv-card);color:var(--rv-text);border-radius:999px;padding:8px 16px;font-size:14px;cursor:pointer}\n.rv-opt[data-recommend]{background:#fdf6d8;border-color:#e6c34a;color:#5c4a00}\n.rv-opt.sel{background:linear-gradient(90deg,#2478d8,#12a5b4);color:#fff;border-color:transparent;font-weight:700}\n.rv-rec{display:inline-block;background:#fdf3c9;color:#7a5b00;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:middle}\n.rv-opt.sel .rv-rec{background:#fff;color:#7a5b00}\n.rv-comment{width:100%;min-height:56px;border:1px solid var(--rv-border2);border-radius:10px;padding:9px 11px;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box;background:var(--rv-card);color:var(--rv-text)}\n.rv-note{font-size:12px;color:var(--rv-muted);margin-top:6px}\n\n/* \u8d64\u67a0\u306e\u5224\u65ad\u30dc\u30c3\u30af\u30b9 (\u30b9\u30e9\u30a4\u30c928\u30fb29) */\n.rv-decision{background:var(--rv-decision-bg);border:1.5px solid #e5484d;border-radius:14px;padding:16px 18px;margin:18px 0}\n.rv-decision h3{color:var(--rv-decision-h);margin:0 0 10px;font-size:17px}\n.rv-plan{background:var(--rv-card);border:1px solid var(--rv-plan-border);border-radius:10px;padding:10px 12px;margin:8px 0;font-size:14px}\n.rv-plan b{color:var(--rv-heading)}\n\n/* \u5f15\u7528\u30d6\u30ed\u30c3\u30af (\u30b9\u30e9\u30a4\u30c929) */\n.rv-quote{background:var(--rv-quote-bg);border-radius:12px;padding:14px 16px 10px;position:relative;margin:10px 0}\n.rv-quote:before{content:\"\u201c\";position:absolute;top:-6px;left:8px;font-size:44px;color:#7fb6d9}\n.rv-quote .rv-chars{font-size:12px;color:var(--rv-muted);margin-top:6px}\n\n/* \u4fee\u6b63\u524d\u5f8c\u306e\u5de6\u53f3\u4e26\u7f6e (\u30b9\u30e9\u30a4\u30c935) */\n.rv-ba{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}\n@media(max-width:640px){.rv-ba{grid-template-columns:1fr}}\n.rv-ba>div{background:var(--rv-card);border:1px solid var(--rv-border);border-radius:12px;padding:12px 14px}\n.rv-ba-badge{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;margin-bottom:8px}\n.rv-before .rv-ba-badge{background:var(--rv-badge-bg);color:var(--rv-badge-color)}\n.rv-after .rv-ba-badge{background:linear-gradient(90deg,#2478d8,#12a5b4);color:#fff}\n.rv-ba mark,.rv-item mark{background:var(--rv-mark-bg);padding:0 2px;border-radius:2px}\n.rv-context{font-size:12px;color:var(--rv-muted);margin:2px 0 8px}\n\n/* \u6bd4\u8f03\u30a8\u30ea\u30a2: \u3044\u307e / \u6848 (\u30b9\u30e9\u30a4\u30c925\u30fb31) */\n.rv-cmp-now{background:var(--rv-cmp-now-bg);border-radius:12px;padding:10px 12px;margin:8px 0}\n.rv-cmp-plan{background:var(--rv-cmp-plan-bg);border:1.5px solid #2478d8;border-radius:12px;padding:10px 12px;margin:8px 0}\n.rv-cmp-label{font-weight:700;color:var(--rv-heading);font-size:13px}\n.rv-cmp-label small{color:var(--rv-muted);font-weight:400;margin-left:6px}\n\n/* \u672b\u5c3e\u306e\u4e00\u62ec\u30b3\u30d4\u30fc (\u30b9\u30e9\u30a4\u30c932) */\n.rv-copybar{position:sticky;bottom:0;background:var(--rv-copybar-bg);padding:12px 0;text-align:center;backdrop-filter:blur(4px)}\n.rv-copy{background:linear-gradient(90deg,#2478d8,#12a5b4);color:#fff;border:0;border-radius:999px;padding:13px 28px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(30,90,160,.35)}\n.rv-out{display:none;text-align:left;background:var(--rv-card);border:1px solid var(--rv-border);border-radius:10px;padding:12px 14px;margin:10px auto;max-width:640px;white-space:pre-wrap;font-size:14px}\n";
const REVIEW_JS = "// Yomite \u5224\u65ad\u30ad\u30c3\u30c8 \u2014 \u30b9\u30e9\u30a4\u30c929\u301c33 \u306e\u5224\u65adUI\u306e\u632f\u308b\u821e\u3044\n// \u30fb\u5404 .rv-item \u5185\u306e .rv-opt \u306f\u5358\u4e00\u9078\u629e\u3002\u9078\u629e\u4e2d\u306f\u9752\u30b0\u30e9\u30c7\u30fc\u30b7\u30e7\u30f3 (CSS \u5074)\u3002\n// \u30fbdata-recommend \u306e\u4ed8\u3044\u305f\u9078\u629e\u80a2\u306f\u8584\u3044\u9ec4\u8272\u3067\u793a\u3059\u3060\u3051\u3002\u9078\u629e (\u9752) \u3068\u306f\u8272\u3092\u5206\u3051\u308b\u3002\n// \u30fb\u8fd4\u4e8b\u3092\u3057\u306a\u3051\u308c\u3070 OK: \u672a\u64cd\u4f5c\u306e\u9805\u76ee\u306f\u63a8\u5968\u304c\u305d\u306e\u307e\u307e\u30b3\u30d4\u30fc\u7d50\u679c\u306b\u5165\u308b\u3002\n//   \u63a8\u5968\u306e\u306a\u3044\u9805\u76ee\u306f\u3001\u9078\u629e\u3082\u30b3\u30e1\u30f3\u30c8\u3082\u7121\u3051\u308c\u3070\u30b3\u30d4\u30fc\u306b\u542b\u307e\u308c\u306a\u3044\u3002\n// \u30fb\u300c\u9078\u3093\u3060\u7d50\u679c\u3092\u307e\u3068\u3081\u3066\u30b3\u30d4\u30fc\u300d: \u9078\u3093\u3060\u9805\u76ee\u3068\u30b3\u30e1\u30f3\u30c8\u3060\u3051\u30921\u884c\u305a\u3064\n//   \u300c\u8cea\u554f \u9078\u629e\u80a2\uff08\u30b3\u30e1\u30f3\u30c8\uff09\u300d\u306e\u5f62\u3067\u30b3\u30d4\u30fc\u3059\u308b (\u30b9\u30e9\u30a4\u30c933 \u306e\u5f62\u5f0f)\u3002\n(function () {\n  function textOf(el) {\n    var t = \"\";\n    el.childNodes.forEach(function (n) {\n      if (n.nodeType === 3) t += n.textContent;\n      else if (n.nodeType === 1 && !n.classList.contains(\"rv-rec\")) t += n.textContent;\n    });\n    return t.trim();\n  }\n  var items = Array.prototype.slice.call(document.querySelectorAll(\".rv-item\"));\n  items.forEach(function (item) {\n    var opts = Array.prototype.slice.call(item.querySelectorAll(\".rv-opt\"));\n    opts.forEach(function (opt) {\n      opt.addEventListener(\"click\", function () {\n        opts.forEach(function (o) { o.classList.remove(\"sel\"); });\n        opt.classList.add(\"sel\");\n        save(item);\n      });\n    });\n  });\n  // \u30b5\u30fc\u30d0\u30fc\u4fdd\u5b58: \u9078\u629e\u3068\u30b3\u30e1\u30f3\u30c8\u3092 Yomite \u30b5\u30fc\u30d0\u30fc (D1) \u3078\u9001\u308a\u3001\u958b\u3044\u305f\u3068\u304d\u306b\u5fa9\u5143\u3059\u308b\u3002\n  // \u30b3\u30d4\u30fc\u30d0\u30fc\u306f\u5f93\u6765\u3069\u304a\u308a\u624b\u5143\u306e\u63a7\u3048\u3068\u3057\u3066\u6b8b\u3059\u3002\n  var slugMatch = location.pathname.match(/^\\/p\\/(.+)$/);\n  var pageSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : \"\";\n  function questionOf(item) {\n    var q = item.getAttribute(\"data-q\") || \"\";\n    if (!q) {\n      var h = item.querySelector(\".rv-q,h3\");\n      q = h ? h.textContent.replace(/\\s+/g, \" \").trim() : \"\u9805\u76ee\";\n    }\n    return q;\n  }\n  function note(item, msg) {\n    var n = item.querySelector(\".rv-note\");\n    if (!n) {\n      n = document.createElement(\"div\");\n      n.className = \"rv-note\";\n      item.appendChild(n);\n    }\n    n.textContent = msg;\n  }\n  var saveTimers = {};\n  function save(item) {\n    if (!pageSlug) return;\n    var sel = item.querySelector(\".rv-opt.sel\");\n    var ta = item.querySelector(\".rv-comment\");\n    var st = {\n      question: questionOf(item),\n      choice: sel ? textOf(sel) : \"\",\n      comment: ta ? ta.value.trim() : \"\",\n    };\n    clearTimeout(saveTimers[st.question]);\n    saveTimers[st.question] = setTimeout(function () {\n      fetch(\"/api/answers/\" + encodeURIComponent(pageSlug), {\n        method: \"POST\",\n        headers: { \"content-type\": \"application/json\" },\n        body: JSON.stringify(st),\n      })\n        .then(function (r) { if (r.ok) note(item, \"\u30b5\u30fc\u30d0\u30fc\u306b\u4fdd\u5b58\u3057\u307e\u3057\u305f \u2713\"); })\n        .catch(function () {});\n    }, 350);\n  }\n  items.forEach(function (item) {\n    var ta = item.querySelector(\".rv-comment\");\n    if (ta) {\n      ta.addEventListener(\"change\", function () { save(item); });\n      ta.addEventListener(\"blur\", function () { save(item); });\n    }\n  });\n  if (pageSlug) {\n    fetch(\"/api/answers/\" + encodeURIComponent(pageSlug))\n      .then(function (r) { return r.ok ? r.json() : null; })\n      .then(function (data) {\n        if (!data || !data.answers) return;\n        var byQ = {};\n        data.answers.forEach(function (a) { byQ[a.question] = a; });\n        items.forEach(function (item) {\n          var a = byQ[questionOf(item)];\n          if (!a) return;\n          if (a.choice) {\n            Array.prototype.slice.call(item.querySelectorAll(\".rv-opt\")).forEach(function (o) {\n              o.classList.toggle(\"sel\", textOf(o) === a.choice);\n            });\n          }\n          var ta = item.querySelector(\".rv-comment\");\n          if (ta && a.comment) ta.value = a.comment;\n          if (a.choice || a.comment) note(item, \"\u30b5\u30fc\u30d0\u30fc\u306b\u4fdd\u5b58\u3057\u307e\u3057\u305f \u2713\");\n        });\n      })\n      .catch(function () {});\n  }\n\n    document.querySelectorAll(\".rv-opt\").forEach(function (b) { if (!b.getAttribute(\"type\")) b.setAttribute(\"type\", \"button\"); });\n\n})();\n";
const REPORT_CSS = "/* Yomite レポート定型フォーマット — スライド13・17・24 のページ形式\n   使い方: <link rel=\"stylesheet\" href=\"/kit/report.css\"> を入れ、\n   .rpt-num + 見出しで節を作り、.rpt-flow / .rpt-cols / .rpt-decision を使う。\n   色は CSS 変数経由。ライトが既定で、OS がダークモードのときは\n   prefers-color-scheme で変数ごと切り替わる (公開済みページも再公開なしで追従)。 */\n:root{\n  color-scheme:light dark;\n  --rpt-bg1:#f4f9fd; --rpt-bg2:#e8f1f8;\n  --rpt-text:#1c2733; --rpt-heading:#12294d;\n  --rpt-accent:#0e7ea4; --rpt-sub:#445; --rpt-faint:#666; --rpt-muted:#888;\n  --rpt-card:#fff; --rpt-shadow:rgba(30,60,90,.06);\n  --rpt-box:#e8f2fa;\n  --rpt-decision-bg:#fff8d6;\n  --rpt-th-bg:#dceefb; --rpt-border:#c9d9e8; --rpt-border2:#d8e2ec;\n  --rpt-k-bg:linear-gradient(90deg,#e3e9fb,#dceefb);\n  --rpt-mark-bg:#fff0a6;\n  --rpt-code-bg:#eef2f6;\n  --rpt-back-border:#9fc6dd;\n}\n@media (prefers-color-scheme: dark){\n  :root{\n    --rpt-bg1:#101c2a; --rpt-bg2:#0a1119;\n    --rpt-text:#d9e6f2; --rpt-heading:#eaf3fb;\n    --rpt-accent:#45bcd8; --rpt-sub:#a9bccf; --rpt-faint:#93a9bf; --rpt-muted:#7e93a8;\n    --rpt-card:#16222f; --rpt-shadow:rgba(0,0,0,.45);\n    --rpt-box:#1b2f47;\n    --rpt-decision-bg:#3a3110;\n    --rpt-th-bg:#1d3a5f; --rpt-border:#2b435f; --rpt-border2:#263a50;\n    --rpt-k-bg:linear-gradient(90deg,#24365e,#1d3a5f);\n    --rpt-mark-bg:#7a5f10;\n    --rpt-code-bg:#1c2a3a;\n    --rpt-back-border:#3d6a8c;\n  }\n  mark{color:#ffe9a0}\n}\nbody{margin:0;font-family:system-ui,-apple-system,\"Hiragino Sans\",sans-serif;background:linear-gradient(160deg,var(--rpt-bg1),var(--rpt-bg2));color:var(--rpt-text);line-height:1.75}\n.rpt{max-width:860px;margin:0 auto;padding:28px 18px 64px}\n.rpt-crumb{color:var(--rpt-accent);font-size:13px;margin-bottom:6px}\n.rpt-crumb a{color:inherit;text-decoration:underline;text-underline-offset:2px}\n.rpt h1{font-size:27px;color:var(--rpt-heading);margin:0 0 6px}\n.rpt-sub{color:var(--rpt-sub);margin-bottom:14px}\n.rpt-meta{font-size:12px;color:var(--rpt-muted);margin-bottom:18px}\n.rpt-toc{background:var(--rpt-card);border-radius:14px;padding:14px 18px;box-shadow:0 2px 10px var(--rpt-shadow);margin-bottom:26px}\n.rpt-toc h2{font-size:13px;color:var(--rpt-faint);margin:0 0 8px}\n.rpt-toc ol{margin:0;padding:0;list-style:none}\n.rpt-toc li{margin:4px 0}\n.rpt-toc a{color:var(--rpt-accent);text-decoration:none;font-weight:600}\n.rpt-toc .n{color:var(--rpt-accent);font-weight:700;margin-right:8px}\nsection.rpt-sec{margin:34px 0}\n.rpt-num{color:var(--rpt-accent);font-size:13px;font-weight:700;letter-spacing:.08em}\nsection.rpt-sec>h2{font-size:21px;color:var(--rpt-heading);margin:2px 0 10px}\n.rpt-flow{display:flex;align-items:stretch;gap:6px;flex-wrap:wrap;margin:14px 0}\n.rpt-flow .box{background:var(--rpt-box);border-radius:10px;padding:10px 12px;flex:1;min-width:120px}\n.rpt-flow .box .when{font-size:12px;color:var(--rpt-accent)}\n.rpt-flow .box .what{font-weight:700;color:var(--rpt-heading)}\n.rpt-flow .box .sub{font-size:12px;color:var(--rpt-faint)}\n.rpt-flow .box.hot{background:linear-gradient(150deg,#0d4d66,#0e7ea4);color:#fff}\n.rpt-flow .box.hot .when,.rpt-flow .box.hot .what,.rpt-flow .box.hot .sub{color:#fff}\n.rpt-flow .arr{align-self:center;color:var(--rpt-accent);font-weight:700}\n.rpt-cap{text-align:center;font-size:12px;color:var(--rpt-muted);margin-top:2px}\n.rpt-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}\n@media(max-width:640px){.rpt-cols{grid-template-columns:1fr}}\n.rpt-panel{background:var(--rpt-card);border-radius:12px;overflow:hidden;box-shadow:0 2px 10px var(--rpt-shadow)}\n.rpt-panel h3{background:linear-gradient(90deg,#1295b4,#2478d8);color:#fff;font-size:15px;margin:0;padding:9px 14px}\n.rpt-panel .body{padding:10px 14px;font-size:14px}\n.rpt-decision{background:var(--rpt-decision-bg);border:1.5px solid #e6c34a;border-radius:12px;padding:12px 16px;margin:14px 0}\n.rpt-decision:before{content:\"判断ポイント\";display:inline-block;background:#e6c34a;color:#5c4a00;font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px;margin-bottom:6px}\ntable{border-collapse:collapse;width:100%;margin:12px 0;background:var(--rpt-card)}\nth{background:var(--rpt-th-bg);color:var(--rpt-heading);text-align:left;padding:8px 10px;border:1px solid var(--rpt-border)}\ntd{padding:8px 10px;border:1px solid var(--rpt-border2);vertical-align:top}\ntd.k{background:var(--rpt-k-bg);font-weight:700;color:var(--rpt-heading);white-space:nowrap}\nmark{background:var(--rpt-mark-bg);padding:0 2px;border-radius:2px}\ncode{background:var(--rpt-code-bg);border-radius:6px;padding:1px 6px;font-size:.92em}\n\n.rpt-foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--rpt-border);text-align:center}\n.rpt-back{display:inline-block;color:var(--rpt-accent);font-weight:700;text-decoration:none;border:1px solid var(--rpt-back-border);border-radius:999px;padding:9px 20px;background:var(--rpt-card)}\n.rpt-back:hover{background:var(--rpt-box)}\n";
const READER_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yomite</title>
<meta name="description" content="調査・報告・判断の置き場">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Yomite">
<meta property="og:title" content="Yomite">
<meta property="og:description" content="調査・報告・判断の置き場">
<meta property="og:url" content="https://yomite.void2610.workers.dev/">
<meta property="og:image" content="https://yomite.void2610.workers.dev/og.png">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:#eef3f7;color:#1c2733}
header{position:sticky;top:0;z-index:5;background:#f7fafc;border-bottom:1px solid #d8e2ec;padding:12px 16px 10px}
.hrow{display:flex;align-items:center;gap:10px;max-width:980px;margin:0 auto}
.logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:19px;color:#12294d}
a.logo{text-decoration:none;cursor:pointer}
.logo:before{content:"";width:5px;height:22px;border-radius:3px;background:linear-gradient(180deg,#12a5b4,#2478d8)}
.hicons{margin-left:auto;display:flex;gap:6px;align-items:center}
.hbtn{position:relative;border:0;background:transparent;font-size:18px;cursor:pointer;padding:6px;border-radius:9px;color:#334}
.hbtn:hover{background:#e2ecf4}
.dot{position:absolute;top:2px;right:2px;width:9px;height:9px;border-radius:50%;background:#f5a623;border:1.5px solid #fff}
#searchRow{max-width:980px;margin:8px auto 0;display:none}
#searchRow.open{display:block}
input[type=search]{width:100%;padding:9px 12px;border-radius:10px;border:1px solid #c3d2df;font-size:16px;background:#fff;color:inherit}
#chips{max-width:980px;margin:10px auto 0;display:flex;gap:7px;flex-wrap:wrap}
.chip{border:1px solid #c3d2df;background:#fff;color:#223;border-radius:999px;padding:6px 13px;font-size:13.5px;cursor:pointer}
.chip.sel{background:linear-gradient(90deg,#2478d8,#12a5b4);color:#fff;border-color:transparent;font-weight:700}
.chip .rec{font-size:11px;font-weight:700;margin-left:5px;color:#5b83a6}
.chip .rec.today{color:#c9930a}
.chip.sel .rec{color:#ffe9a8}
main{padding:6px 16px 48px;max-width:980px;margin:0 auto}
.sec-head{display:flex;align-items:baseline;gap:12px;margin:24px 0 10px}
.sec-head .lbl{font-weight:700;color:#12294d}
.sec-head .line{flex:1;border-top:1px solid #c9d8e4}
.sec-head .cnt{font-size:12px;color:#7d8fa1}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:720px){.grid{grid-template-columns:1fr}}
.pcard{background:#fff;border-radius:14px;padding:13px 15px 9px;box-shadow:0 2px 10px rgba(30,60,90,.07)}
.pcard .ph{display:flex;align-items:flex-start;gap:7px}
.pcard .pt{font-weight:800;color:#12294d;font-size:15.5px;flex:1;line-height:1.4}
.pcard .pc{font-size:12px;color:#8a9bab;white-space:nowrap;margin-top:2px}
.icobtn{border:0;background:transparent;cursor:pointer;font-size:15px;padding:2px 3px;line-height:1}
.icobtn.pin{filter:grayscale(1) opacity(.45)}
.icobtn.pin.on{filter:none}
.icobtn.star{color:#b9c6d2}
.icobtn.star.on{color:#f0a500}
.prow{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #eef2f6}
.prow .ud{flex:none;width:8px;height:8px;border-radius:50%;background:#17a2b8}
.prow .ud.read{background:transparent}
.prow a.tt{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;color:inherit;text-decoration:none;padding:3px 0}
.prow.read a.tt{color:#93a3b3}
.prow .tm{flex:none;font-size:12px;color:#93a3b3}
.prow .ppin{flex:none}
.more{display:block;width:100%;text-align:left;border:0;background:transparent;color:#0e7ea4;font-size:13px;padding:7px 0 4px;cursor:pointer}
.dec{font-size:12.5px;color:#7a5b00;background:#fff6cf;border-radius:8px;padding:6px 9px;margin:7px 0 5px;white-space:pre-wrap}
section.inbox{margin-top:38px;background:#f7fafc;border:1px solid #d8e2ec;border-radius:16px;padding:16px}
.ib-head{display:flex;align-items:center;gap:8px}
.ib-head .t{font-weight:800;color:#12294d;font-size:17px}
.ib-head button{margin-left:auto;border:0;background:transparent;font-size:17px;cursor:pointer;color:#334}
.ib-sec{display:flex;align-items:center;gap:10px;margin:14px 0 8px}
.ib-sec .t{font-weight:700;color:#12294d}
.ib-sec .line{flex:1;border-top:1px solid #d8e2ec}
.pill{font-size:12px;background:#fff;border:1px solid #c3d2df;border-radius:999px;padding:2px 9px;color:#445}
.compose{background:#fff;border-radius:14px;padding:12px;box-shadow:0 2px 10px rgba(30,60,90,.06)}
textarea{width:100%;min-height:74px;padding:10px;border-radius:10px;border:1px solid #d3dee8;font-size:16px;font-family:inherit;resize:vertical}
select{width:100%;margin-top:8px;padding:10px;border-radius:10px;border:1px solid #d3dee8;font-size:16px;background:#f4f8fb;color:#445}
.ib-btns{display:flex;gap:9px;margin-top:10px}
.btn-img{flex:1;border:1px solid #c3d2df;background:#fff;color:#0e7ea4;border-radius:11px;padding:11px;font-size:15px;font-weight:700;cursor:pointer}
.btn-send{flex:2;border:0;background:linear-gradient(90deg,#2478d8,#12a5b4);color:#fff;border-radius:11px;padding:11px;font-size:15px;font-weight:700;cursor:pointer}
.ib-note{font-size:12px;color:#8a9bab;margin-top:9px}
.msg{font-size:13px;color:#2478d8;margin-top:6px}
.ib-item{background:#fff;border:1px solid #e3ebf2;border-radius:11px;padding:10px 12px;margin:7px 0}
.ib-item .b{white-space:pre-wrap;font-size:14.5px}
.ib-item .m{font-size:12px;color:#93a3b3;margin-top:5px}
.ib-item img{max-width:180px;border-radius:8px;margin-top:7px;display:block}
.empty{color:#93a3b3;text-align:center;padding:20px 0;font-size:14px}
details.done{margin-top:14px;border-top:1px solid #d8e2ec;padding-top:10px}
details.done summary{cursor:pointer;color:#445;font-weight:600}
.chipfile{display:inline-block;font-size:12px;background:#e8f2fa;border:0;border-radius:999px;padding:3px 10px;margin-top:7px;color:#0e7ea4;cursor:pointer;font-family:inherit}
.ib-back{border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:#334;padding:2px 6px 2px 0}
.btn-send:disabled{opacity:.55;cursor:default}
@media (prefers-color-scheme: dark){
body{background:#0c141f;color:#d9e6f2}
header{background:#101b29;border-bottom-color:#24344a}
.logo{color:#eaf3fb}
.hbtn{color:#c9d8e6}
.hbtn:hover{background:#1d2c3e}
.dot{border-color:#101b29}
input[type=search]{background:#16222f;border-color:#2b405a}
.chip{background:#16222f;border-color:#2b405a;color:#d9e6f2}
.chip .rec{color:#7fa3c4}
.chip .rec.today{color:#e6b84c}
.sec-head .lbl{color:#eaf3fb}
.sec-head .line{border-top-color:#2b405a}
.sec-head .cnt{color:#7e93a8}
.pcard{background:#152231;box-shadow:0 2px 10px rgba(0,0,0,.45)}
.pcard .pt{color:#eaf3fb}
.pcard .pc{color:#7e93a8}
.icobtn.star{color:#54708c}
.prow{border-top-color:#22344a}
.prow.read a.tt{color:#63798e}
.prow .tm{color:#63798e}
.more{color:#45bcd8}
.dec{color:#f0d48a;background:#40360f}
section.inbox{background:#101b29;border-color:#24344a}
.ib-head .t{color:#eaf3fb}
.ib-head button{color:#c9d8e6}
.ib-sec .t{color:#eaf3fb}
.ib-sec .line{border-top-color:#24344a}
.pill{background:#16222f;border-color:#2b405a;color:#b8cbdd}
.compose{background:#152231;box-shadow:0 2px 10px rgba(0,0,0,.45)}
textarea{background:#0e1926;border-color:#2b405a;color:#e2edf6}
select{background:#16222f;border-color:#2b405a;color:#c9d8e6}
.btn-img{background:#16222f;border-color:#2b405a;color:#45bcd8}
.ib-note{color:#7e93a8}
.msg{color:#6db3f2}
.ib-item{background:#152231;border-color:#24344a}
.ib-item .m{color:#7e93a8}
.empty{color:#7e93a8}
details.done{border-top-color:#24344a}
details.done summary{color:#b8cbdd}
.chipfile{background:#1d3247;color:#45bcd8}
.ib-back{color:#c9d8e6}
}
</style></head><body>
<header>
<div class="hrow"><a class="logo" href="/" title="トップ（最新の状態で開き直す）">Yomite</a>
<div class="hicons">
<button class="hbtn" id="btnSearch" title="検索">🔍</button>
<button class="hbtn" id="btnAll" title="絞り込みを解除してすべて表示">↺</button>
<button class="hbtn" id="btnInbox" title="インボックス">✉️<span class="dot" id="inboxDot" hidden></span></button>
</div></div>
<div id="searchRow"><input type="search" id="q" placeholder="検索（タイトル・概要・案件）"></div>
<div id="chips"></div>
</header>
<main><div id="list">読み込み中…</div>
<section class="inbox" id="inbox">
<div class="ib-head"><button class="ib-back" id="ibTop" title="一覧の先頭へ戻る">‹</button><span class="t">インボックス</span><button id="ibReload" title="更新">↻</button></div>
<div class="ib-sec"><span class="t">Museへの依頼</span><span class="line"></span><span class="pill" id="pendCount">0件</span></div>
<div class="compose">
<textarea id="inboxBody" placeholder="依頼を1つ書いてください"></textarea>
<select id="inboxProject"><option value="">プロジェクト名（任意）</option></select>
<div><button type="button" class="chipfile" id="imgName" hidden title="タップで添付を外す"></button></div>
<div class="ib-btns">
<button class="btn-img" id="imgBtn">🖼 画像</button>
<button class="btn-send" id="inboxSend">頼む →</button>
</div>
<input type="file" id="imgFile" accept="image/*" hidden>
<div class="msg" id="inboxMsg"></div>
<div class="ib-note">送るとすぐにMuseへ通知が届きます。取り込み状況は下で分かります。</div>
</div>
<div id="pendingList"></div>
<details class="done" id="doneBox"><summary>完了したもの</summary><div id="doneList"></div></details>
</section>
</main>
<script>
var listEl=document.getElementById('list'),qEl=document.getElementById('q'),chipsEl=document.getElementById('chips');
var PAGES=[],MARKS={},chipSel='すべて',EXP={};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var dtf=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hour12:false});
function parts(iso){var o={};dtf.formatToParts(new Date(iso)).forEach(function(p){o[p.type]=p.value});return o}
function dayKey(iso){var p=parts(iso);return p.year+'-'+p.month+'-'+p.day}
function todayKey(){return dayKey(new Date().toISOString())}
function ydayKey(){var d=new Date(Date.now()-86400000);return dayKey(d.toISOString())}
function relTime(iso){
  var p=parts(iso),k=dayKey(iso),hm=p.hour+':'+p.minute;
  if(k===todayKey())return hm;
  if(k===ydayKey())return '昨日 '+hm;
  var diff=(new Date(todayKey())-new Date(k))/86400000;
  if(diff<7)return p.weekday.replace('曜日','')+' '+hm;
  return p.month+'/'+p.day+' '+hm;
}
function secLabel(k){
  if(k===todayKey())return '今日';
  if(k===ydayKey())return '昨日';
  var p=parts(k+'T12:00:00Z');return p.month+'月'+p.day+'日（'+p.weekday.replace('曜日','')+'）';
}
function markOf(proj){return MARKS[proj]||{pinned:0,starred:0}}
async function setMark(proj,field,val){
  var prev=markOf(proj);var m={pinned:prev.pinned,starred:prev.starred};m[field]=val;MARKS[proj]=m;
  render();
  try{
    var r=await fetch('/api/projects/marks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project:proj,pinned:!!m.pinned,starred:!!m.starred})});
    if(!r.ok)throw new Error(r.status);
  }catch(e){MARKS[proj]=prev;render();}
}
function renderChips(){
  var byProj={};
  PAGES.forEach(function(p){if(!byProj[p.project]||p.created_at>byProj[p.project])byProj[p.project]=p.created_at});
  var names=Object.keys(byProj).sort(function(a,b){return byProj[b]<byProj[a]?-1:1});
  var html='<button class="chip'+(chipSel==='すべて'?' sel':'')+'" data-chip="すべて">すべて</button>';
  names.forEach(function(n){
    var days=Math.round((new Date(todayKey())-new Date(dayKey(byProj[n])))/86400000);
    var rec=days<=0?'<span class="rec today">今日</span>':'<span class="rec">'+days+'日</span>';
    html+='<button class="chip'+(chipSel===n?' sel':'')+'" data-chip="'+esc(n)+'">'+esc(n)+rec+'</button>';
  });
  chipsEl.innerHTML=html;
  chipsEl.querySelectorAll('[data-chip]').forEach(function(b){b.addEventListener('click',function(){chipSel=b.dataset.chip;render()})});
}
function render(){
  renderChips();
  var q=qEl.value.trim().toLowerCase();
  var pages=PAGES.filter(function(p){
    if(chipSel!=='すべて'&&p.project!==chipSel)return false;
    if(q&&(p.title+' '+(p.summary||'')+' '+p.project).toLowerCase().indexOf(q)<0)return false;
    return true;
  });
  if(!pages.length){
    if(!PAGES.length){listEl.innerHTML='<p class="empty">まだページがありません。</p>';}
    else{
      listEl.innerHTML='<p class="empty">条件に合うページがありません。</p><button class="more" id="clearFilter" style="text-align:center">絞り込みを解除する</button>';
      document.getElementById('clearFilter').addEventListener('click',function(){chipSel='すべて';qEl.value='';render()});
    }
    return;
  }
  var secs={};
  pages.forEach(function(p){var k=dayKey(p.created_at);(secs[k]=secs[k]||[]).push(p)});
  var keys=Object.keys(secs).sort().reverse();
  listEl.innerHTML=keys.map(function(k){
    var ps=secs[k];
    var byProj={},order=[];
    ps.forEach(function(p){if(!byProj[p.project]){byProj[p.project]=[];order.push(p.project)}byProj[p.project].push(p)});
    order.sort(function(a,b){
      var pa=markOf(a).pinned?0:1,pb=markOf(b).pinned?0:1;
      if(pa!==pb)return pa-pb;
      return byProj[b][0].created_at<byProj[a][0].created_at?-1:1;
    });
    var cards=order.map(function(proj){
      var items=byProj[proj],m=markOf(proj),ckey=k+'|'+proj;
      var rows=items.map(function(p,i){
        var row='<div class="prow'+(p.read_at?' read':'')+'">'
          +'<span class="ud'+(p.read_at?' read':'')+'"></span>'
          +'<a class="tt" href="/p/'+esc(p.slug)+'" data-slug="'+esc(p.slug)+'">'+esc(p.title)+'</a>'
          +'<span class="tm">'+relTime(p.created_at)+'</span>'
          +'<button class="icobtn pin ppin'+(p.pinned?' on':'')+'" data-pinpage="'+esc(p.slug)+'" title="ページをピン留め">📌</button></div>';
        if(p.decision_points)row+='<div class="dec">⚠ 判断ポイント: '+esc(p.decision_points)+'</div>';
        if(i>=4)return '<div class="extra"'+(EXP[ckey]?'':' style="display:none"')+'>'+row+'</div>';
        return '<div>'+row+'</div>';
      }).join('');
      var more=items.length>4?'<button class="more" data-card="'+esc(ckey)+'">'+(EXP[ckey]?'閉じる':'他 '+(items.length-4)+' 件を表示 ›')+'</button>':'';
      return '<div class="pcard"><div class="ph"><span class="pt">'+esc(proj)+'</span>'
        +'<span class="pc">'+items.length+'件</span>'
        +'<button class="icobtn pin'+(m.pinned?' on':'')+'" data-pinproj="'+esc(proj)+'" title="案件をピン留め">📌</button>'
        +'<button class="icobtn star'+(m.starred?' on':'')+'" data-starproj="'+esc(proj)+'" title="スター">'+(m.starred?'★':'☆')+'</button></div>'
        +rows+more+'</div>';
    }).join('');
    return '<div class="sec-head"><span class="lbl">'+secLabel(k)+'</span><span class="line"></span><span class="cnt">'+order.length+'テーマ・'+ps.length+'件</span></div><div class="grid">'+cards+'</div>';
  }).join('');
  listEl.querySelectorAll('a[data-slug]').forEach(function(a){a.addEventListener('click',function(){
    PAGES.forEach(function(p){if(p.slug===a.dataset.slug&&!p.read_at)p.read_at=new Date().toISOString()});
    var row=a.closest('.prow');if(row){row.classList.add('read');var ud=row.querySelector('.ud');if(ud)ud.classList.add('read')}
    fetch('/api/pages/'+a.dataset.slug+'/read',{method:'POST'}).catch(function(){});
  })});
  listEl.querySelectorAll('[data-pinpage]').forEach(function(b){b.addEventListener('click',async function(){
    b.disabled=true;
    try{var r=await fetch('/api/pages/'+b.dataset.pinpage+'/pin',{method:'POST'});if(!r.ok)throw new Error(r.status);await load();}
    catch(e){b.disabled=false;}
  })});
  listEl.querySelectorAll('[data-pinproj]').forEach(function(b){b.addEventListener('click',function(){setMark(b.dataset.pinproj,'pinned',markOf(b.dataset.pinproj).pinned?0:1)})});
  listEl.querySelectorAll('[data-starproj]').forEach(function(b){b.addEventListener('click',function(){setMark(b.dataset.starproj,'starred',markOf(b.dataset.starproj).starred?0:1)})});
  listEl.querySelectorAll('.more[data-card]').forEach(function(b){b.addEventListener('click',function(){
    var key=b.dataset.card;var card=b.closest('.pcard');var ex=card.querySelectorAll('.extra');
    var open=!EXP[key];EXP[key]=open;
    ex.forEach(function(e){e.style.display=open?'':'none'});
    b.textContent=open?'閉じる':'他 '+ex.length+' 件を表示 ›';
  })});
}
async function load(){
  try{
    var r=await fetch('/api/pages');if(!r.ok)throw new Error(r.status);
    var d=await r.json();
    PAGES=d.pages||[];MARKS={};
    var qp=new URLSearchParams(location.search).get('project');
    if(qp&&PAGES.some(function(p){return p.project===qp}))chipSel=qp;
    (d.marks||[]).forEach(function(m){MARKS[m.project]=m});
    var sel=document.getElementById('inboxProject');
    var seen={};var opts='<option value="">プロジェクト名（任意）</option>';
    PAGES.forEach(function(p){if(!seen[p.project]){seen[p.project]=1;opts+='<option>'+esc(p.project)+'</option>'}});
    var cur=sel.value;sel.innerHTML=opts;sel.value=cur;
    render();
  }catch(e){
    listEl.innerHTML='<p class="empty">読み込みに失敗しました。</p><button class="more" id="retryLoad" style="text-align:center">再読み込み</button>';
    document.getElementById('retryLoad').addEventListener('click',load);
  }
}
var timer;qEl.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(render,200)});
document.getElementById('btnSearch').addEventListener('click',function(){var r=document.getElementById('searchRow');var open=r.classList.toggle('open');if(open)qEl.focus();else if(qEl.value){qEl.value='';render()}});
document.getElementById('btnAll').addEventListener('click',function(){chipSel='すべて';qEl.value='';document.getElementById('searchRow').classList.remove('open');render();window.scrollTo({top:0,behavior:'smooth'})});
document.getElementById('btnInbox').addEventListener('click',function(){document.getElementById('inbox').scrollIntoView({behavior:'smooth'})});
/* --- inbox (スライド21) --- */
var histEl={pend:document.getElementById('pendingList'),done:document.getElementById('doneList')};
var imgKey=null;
function ibItem(i,done){
  var img=i.image_key?'<img src="/media/'+esc(i.image_key)+'" alt="">':'';
  var proj=i.project?' ・ '+esc(i.project):'';
  return '<div class="ib-item"><div class="b">'+esc(i.body)+'</div>'+img
    +'<div class="m">'+relTime(i.created_at)+proj+' ・ '+(done?'✅ 受付済み':'⏳ 取り込み待ち')+'</div></div>';
}
async function loadInboxHistory(){
  try{
    var r=await fetch('/api/inbox/history');var d=await r.json();var items=d.inbox||[];
    var pend=items.filter(function(i){return !i.taken_at}),done=items.filter(function(i){return i.taken_at});
    document.getElementById('pendCount').textContent=pend.length+'件';
    document.getElementById('inboxDot').hidden=pend.length===0;
    histEl.pend.innerHTML=pend.length?pend.map(function(i){return ibItem(i,false)}).join(''):'<div class="empty">Macへ渡す依頼はありません</div>';
    histEl.done.innerHTML=done.length?done.map(function(i){return ibItem(i,true)}).join(''):'<div class="empty">まだ完了したものはありません</div>';
  }catch(e){/* keep last shown list on transient errors */}
}
document.getElementById('ibReload').addEventListener('click',function(){loadInboxHistory();load()});
document.getElementById('ibTop').addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})});
document.getElementById('imgName').addEventListener('click',function(){
  if(!imgKey)return;
  imgKey=null;this.hidden=true;document.getElementById('inboxMsg').textContent='添付を外しました';
});
document.getElementById('imgBtn').addEventListener('click',function(){document.getElementById('imgFile').click()});
document.getElementById('imgFile').addEventListener('change',async function(ev){
  var f=ev.target.files[0];ev.target.value='';if(!f)return;
  var msg=document.getElementById('inboxMsg');msg.textContent='画像を送っています…';
  var dataUrl=await new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result)};fr.readAsDataURL(f)});
  var b64=String(dataUrl).split(',')[1]||'';
  var r=await fetch('/api/inbox/image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:f.name,contentType:f.type,data:b64})});
  var d=await r.json().catch(function(){return {}});
  if(r.ok&&d.key){imgKey=d.key;var n=document.getElementById('imgName');n.hidden=false;n.textContent='🖼 '+f.name;msg.textContent='画像を添付しました';}
  else{msg.textContent='画像の送信に失敗しました';}
});
document.getElementById('inboxSend').addEventListener('click',async function(){
  var btn=this;if(btn.disabled)return;
  var body=document.getElementById('inboxBody').value.trim();var msg=document.getElementById('inboxMsg');
  if(!body){msg.textContent='本文を書いてください';document.getElementById('inboxBody').focus();return}
  var payload={body:body,project:document.getElementById('inboxProject').value};
  if(imgKey)payload.image_key=imgKey;
  btn.disabled=true;var oldLabel=btn.textContent;btn.textContent='送っています…';
  try{
    var r=await fetch('/api/inbox',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    msg.textContent=r.ok?'置きました。下に並びます。':'送信に失敗しました。もう一度お試しください。';
    if(r.ok){document.getElementById('inboxBody').value='';imgKey=null;document.getElementById('imgName').hidden=true;loadInboxHistory();}
  }catch(e){msg.textContent='送信に失敗しました。もう一度お試しください。';}
  btn.disabled=false;btn.textContent=oldLabel;
});
loadInboxHistory();
setInterval(loadInboxHistory,30000);
load();
</script></body></html>`;


async function listAnswers(slug, env) {
  const { results } = await env.DB.prepare(
    "SELECT question, choice, comment, updated_at FROM answers WHERE slug = ? ORDER BY updated_at"
  ).bind(slug).all();
  return json({ slug, answers: results });
}

async function saveAnswer(slug, request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.question) return json({ error: "question is required" }, 400);
  const question = String(body.question).slice(0, 500);
  const choice = String(body.choice || "").slice(0, 500);
  const comment = String(body.comment || "").slice(0, 4000);
  await env.DB.prepare(
    `INSERT INTO answers (slug, question, choice, comment, updated_at)
     VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(slug, question) DO UPDATE SET
       choice = excluded.choice, comment = excluded.comment, updated_at = excluded.updated_at`
  ).bind(slug, question, choice, comment).run();
  return json({ ok: true });
}

async function listAllAnswers(request, env) {
  if (!checkToken(request, env)) return json({ error: "unauthorized" }, 401);
  const { results } = await env.DB.prepare(
    "SELECT slug, question, choice, comment, updated_at FROM answers ORDER BY updated_at DESC LIMIT 200"
  ).all();
  return json({ answers: results });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === "GET" && path === "/") {
        return new Response(READER_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (request.method === "GET" && path === "/kit/review.css") {
        return new Response(REVIEW_CSS, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" } });
      }
      if (request.method === "GET" && path === "/kit/review.js") {
        return new Response(REVIEW_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
      }
      if (request.method === "GET" && path === "/og.png") {
        const obj = await env.PAGES_BUCKET.get("assets/og.png");
        if (!obj) return new Response("not found", { status: 404 });
        return new Response(obj.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
      }
      if (request.method === "GET" && path === "/kit/report.css") {
        return new Response(REPORT_CSS, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" } });
      }
      if (request.method === "GET" && path === "/api/pages") return listPages(request, env);
      if (request.method === "POST" && path === "/api/pages") return publishPage(request, env);
      if (request.method === "POST" && path === "/api/projects/marks") return setProjectMark(request, env);
      const pageAction = path.match(/^\/api\/pages\/([^/]+)\/(read|pin)$/);
      if (request.method === "POST" && pageAction) {
        const slug = decodeURIComponent(pageAction[1]);
        return pageAction[2] === "read" ? markRead(slug, env) : togglePin(slug, env);
      }
      if (request.method === "GET" && path.startsWith("/p/")) {
        return servePage(decodeURIComponent(path.slice(3)), env);
      }
      if (request.method === "GET" && path.startsWith("/src/")) {
        return serveSource(decodeURIComponent(path.slice(5)), env);
      }
      if (request.method === "GET" && path.startsWith("/media/")) {
        return serveMedia(decodeURIComponent(path.slice(7)), env);
      }
      const answersRoute = path.match(/^\/api\/answers\/(.+)$/);
      if (answersRoute && request.method === "GET") return listAnswers(decodeURIComponent(answersRoute[1]), env);
      if (answersRoute && request.method === "POST") return saveAnswer(decodeURIComponent(answersRoute[1]), request, env);
      if (request.method === "GET" && path === "/api/answers") return listAllAnswers(request, env);
      if (request.method === "GET" && path === "/api/inbox/history") return inboxHistory(request, env);
      if (request.method === "GET" && path === "/api/inbox") return listInbox(request, env);
      if (request.method === "POST" && path === "/api/inbox") return addInbox(request, env, ctx);
      if (request.method === "POST" && path === "/api/inbox/image") return uploadInboxImage(request, env);
      const take = path.match(/^\/api\/inbox\/(\d+)\/taken$/);
      if (request.method === "POST" && take) return takeInbox(take[1], request, env);
      if (request.method === "GET" && !path.startsWith("/api/")) {
        return new Response(NOT_FOUND_HTML, {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500);
    }
  },
};
