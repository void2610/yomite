// Yomite — Cloudflare Worker
// Reader UI (inline) + JSON API. Storage: R2 (HTML files) + D1 (metadata / inbox).
// Production is meant to sit behind Cloudflare Access; publish & inbox-fetch
// additionally require the PUBLISH_TOKEN secret (Authorization: Bearer <token>).
// If PUBLISH_TOKEN is not set (local dev), auth checks are bypassed — see README.

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
  return json({ pages: results });
}

async function publishPage(request, env) {
  if (!checkToken(request, env)) return json({ error: "unauthorized" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { title, project, summary, decision_points, html } = body || {};
  if (!title || !html) return json({ error: "title and html are required" }, 400);
  const slug = body.slug ? String(body.slug).replace(/[^a-z0-9-]/gi, "-").toLowerCase() : makeSlug(title);
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
  return json({ slug, url: `/p/${slug}` }, 201);
}

async function servePage(slug, env) {
  const obj = await env.PAGES_BUCKET.get(`pages/${slug}.html`);
  if (!obj) return new Response("ページが見つかりません", { status: 404 });
  return new Response(obj.body, {
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
    "SELECT id, body, created_at, taken_at FROM inbox WHERE taken_at IS NULL ORDER BY created_at ASC"
  ).all();
  return json({ inbox: results });
}

async function addInbox(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const text = (body && body.body ? String(body.body) : "").trim();
  if (!text) return json({ error: "body is required" }, 400);
  const res = await env.DB.prepare("INSERT INTO inbox (body) VALUES (?)").bind(text).run();
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function takeInbox(id, request, env) {
  if (!checkToken(request, env)) return json({ error: "unauthorized" }, 401);
  const res = await env.DB.prepare(
    "UPDATE inbox SET taken_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND taken_at IS NULL"
  ).bind(Number(id)).run();
  if (!res.meta.changes) return json({ error: "not found or already taken" }, 404);
  return json({ ok: true, id: Number(id) });
}

const READER_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yomite</title>
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:#f6f6f4;color:#1c1c1a}
@media(prefers-color-scheme:dark){body{background:#17181a;color:#eee}}
header{position:sticky;top:0;background:inherit;padding:14px 16px 8px;border-bottom:1px solid #8883}
h1{font-size:20px;margin:0 0 8px} .badge{background:#d33;color:#fff;border-radius:999px;padding:1px 8px;font-size:12px;vertical-align:middle}
input[type=search]{width:100%;padding:10px;border-radius:10px;border:1px solid #8886;font-size:16px;background:transparent;color:inherit}
main{padding:12px 16px 40px;max-width:760px;margin:0 auto}
h2{font-size:15px;margin:22px 0 8px;color:#666} @media(prefers-color-scheme:dark){h2{color:#aaa}}
.card{display:block;background:#fff;border:1px solid #8883;border-radius:12px;padding:12px 14px;margin:8px 0;text-decoration:none;color:inherit}
@media(prefers-color-scheme:dark){.card{background:#22242a}}
.card .t{font-weight:700;font-size:16px} .card .s{font-size:13px;color:#666;margin-top:4px}
.card .meta{font-size:12px;color:#999;margin-top:6px}
.unread{border-left:5px solid #2b7fff}
.decision{background:#fff3cd;border:1px solid #e6c34a;color:#5c4a00;border-radius:8px;padding:8px 10px;font-size:13px;margin-top:8px;white-space:pre-wrap}
@media(prefers-color-scheme:dark){.decision{background:#4a3f10;color:#ffe98a;border-color:#8a7420}}
.row{display:flex;gap:8px;align-items:flex-start}.grow{flex:1}
button.pin{border:1px solid #8886;background:transparent;color:inherit;border-radius:8px;padding:4px 8px;font-size:13px;cursor:pointer}
button.pin.on{background:#ffb340;color:#222}
section.inbox{margin-top:32px;border-top:1px solid #8883;padding-top:16px}
textarea{width:100%;min-height:90px;padding:10px;border-radius:10px;border:1px solid #8886;font-size:16px;background:transparent;color:inherit}
button.send{margin-top:8px;padding:10px 18px;border-radius:10px;border:0;background:#2b7fff;color:#fff;font-size:15px;cursor:pointer}
.msg{font-size:13px;color:#2b7fff;margin-top:6px}
</style></head><body>
<header><h1>Yomite <span class="badge" id="unreadBadge" hidden></span></h1>
<input type="search" id="q" placeholder="検索（タイトル・概要・案件）"></header>
<main><div id="list">読み込み中…</div>
<section class="inbox"><h2>📥 インボックス（スマホから依頼を置く）</h2>
<textarea id="inboxBody" placeholder="依頼を1つ書いてください。次にMacを開いたときに取り込まれます。"></textarea>
<button class="send" id="inboxSend">置いておく</button><div class="msg" id="inboxMsg"></div></section>
</main>
<script>
const listEl=document.getElementById('list'),qEl=document.getElementById('q'),badge=document.getElementById('unreadBadge');
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function load(){
  const q=qEl.value.trim(); const url='/api/pages'+(q?('?q='+encodeURIComponent(q)):'');
  const r=await fetch(url); const d=await r.json(); const pages=d.pages||[];
  const unread=pages.filter(p=>!p.read_at).length;
  badge.hidden=unread===0; badge.textContent='未読 '+unread;
  const groups=new Map();
  for(const p of pages){ if(!groups.has(p.project))groups.set(p.project,[]); groups.get(p.project).push(p); }
  // pinned projects first: a project containing a pinned page floats up
  const order=[...groups.entries()].sort((a,b)=>((b[1].some(p=>p.pinned)?1:0)-(a[1].some(p=>p.pinned)?1:0)));
  if(!pages.length){listEl.innerHTML='<p>まだページがありません。</p>';return;}
  listEl.innerHTML=order.map(([proj,ps])=>'<h2>'+(ps.some(p=>p.pinned)?'📌 ':'')+esc(proj)+'</h2>'+ps.map(p=>
    '<div class="card'+(p.read_at?'':' unread')+'"><div class="row"><a class="grow" style="text-decoration:none;color:inherit" href="/p/'+esc(p.slug)+'" data-slug="'+esc(p.slug)+'">'+
    '<span class="t">'+esc(p.title)+'</span>'+(p.read_at?'':' <span class="badge">未読</span>')+
    (p.summary?'<div class="s">'+esc(p.summary)+'</div>':'')+
    '<div class="meta">'+esc((p.created_at||'').slice(0,16).replace('T',' '))+'</div></a>'+
    '<button class="pin'+(p.pinned?' on':'')+'" data-pin="'+esc(p.slug)+'">'+(p.pinned?'📌 固定中':'ピン留め')+'</button></div>'+
    (p.decision_points?'<div class="decision">⚠ 判断ポイント\\n'+esc(p.decision_points)+'</div>':'')+'</div>').join('')).join('');
  listEl.querySelectorAll('a[data-slug]').forEach(a=>a.addEventListener('click',()=>{fetch('/api/pages/'+a.dataset.slug+'/read',{method:'POST'});}));
  listEl.querySelectorAll('button[data-pin]').forEach(b=>b.addEventListener('click',async e=>{e.preventDefault();await fetch('/api/pages/'+b.dataset.pin+'/pin',{method:'POST'});load();}));
}
let timer; qEl.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,250);});
document.getElementById('inboxSend').addEventListener('click',async()=>{
  const body=document.getElementById('inboxBody').value.trim(); const msg=document.getElementById('inboxMsg');
  if(!body){msg.textContent='本文を書いてください';return;}
  const r=await fetch('/api/inbox',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body})});
  msg.textContent=r.ok?'置きました。Macを開いたときに取り込まれます。':'送信に失敗しました';
  if(r.ok)document.getElementById('inboxBody').value='';
});
load();
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === "GET" && path === "/") {
        return new Response(READER_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (request.method === "GET" && path === "/api/pages") return listPages(request, env);
      if (request.method === "POST" && path === "/api/pages") return publishPage(request, env);
      const pageAction = path.match(/^\/api\/pages\/([^/]+)\/(read|pin)$/);
      if (request.method === "POST" && pageAction) {
        const slug = decodeURIComponent(pageAction[1]);
        return pageAction[2] === "read" ? markRead(slug, env) : togglePin(slug, env);
      }
      if (request.method === "GET" && path.startsWith("/p/")) {
        return servePage(decodeURIComponent(path.slice(3)), env);
      }
      if (request.method === "GET" && path === "/api/inbox") return listInbox(request, env);
      if (request.method === "POST" && path === "/api/inbox") return addInbox(request, env);
      const take = path.match(/^\/api\/inbox\/(\d+)\/taken$/);
      if (request.method === "POST" && take) return takeInbox(take[1], request, env);
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500);
    }
  },
};
