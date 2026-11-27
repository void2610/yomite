// Yomite Markdown レンダラ — 記事は md で書き、見た目は Yomite 側で統一する。
//
// 独自形式 (Yomite 拡張):
//   :::html            … 次の ::: までを raw HTML としてそのまま埋め込む
//   :::html src="x.html" … 外部 HTML ファイルの読み込み (publish CLI が送信前に中身へ展開する。
//                          Worker 単体で受けた場合は未展開である旨の注記になる)
//   :::decision        … 次の ::: までを判断ポイントの枠で表示する (中身は md として描く)
//   :::ask 質問文      … 判断キット。次の ::: まで `- 選択肢` を並べ、末尾の (おすすめ) が推奨になる
//
// md の先頭の見出し (# タイトル) は、ページの h1 が別に付くため取り除く。
// ## が節見出しになり、目次は ## が3つ以上あるとき自動で付く。

export const MD_CSS = `
.ymd-bar{background:var(--rpt-card);border-bottom:1px solid var(--rpt-border)}
.ymd-bar-in{max-width:860px;margin:0 auto;padding:0 18px;height:54px;display:flex;align-items:center;justify-content:space-between}
.ymd-logo{color:#3ea8ff;font-size:21px;font-weight:800;text-decoration:none;letter-spacing:.2px}
.ymd-bar-link{color:var(--rpt-faint);font-size:13.5px;text-decoration:none}
.ymd-bar-link:hover{color:var(--rpt-accent);text-decoration:underline;text-underline-offset:3px}
.ymd-ahead{margin:4px 0 30px}
.ymd-bigemo{font-size:54px;line-height:1.1;margin-bottom:12px}
.ymd-ahead h1{font-size:30px;line-height:1.4;color:var(--rpt-heading);margin:0 0 14px;font-weight:800}
.ymd-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ymd-chip{background:var(--rpt-box);border:1px solid var(--rpt-border);border-radius:999px;padding:2px 13px;font-size:13px;color:var(--rpt-heading)}
.ymd-date{color:var(--rpt-muted);font-size:13.5px}
.ymd-lead{color:var(--rpt-sub);font-size:15.5px;line-height:1.85;margin:16px 0 0}
@media(max-width:640px){.ymd-ahead h1{font-size:24px}.ymd-bigemo{font-size:44px}}
.ymd h3{font-size:17px;color:var(--rpt-heading);margin:22px 0 6px}
.ymd h4{font-size:15px;color:var(--rpt-heading);margin:18px 0 4px}
.ymd p{margin:8px 0}
.ymd a{color:var(--rpt-accent);text-decoration:underline;text-underline-offset:2px;word-break:break-all}
.ymd ul,.ymd ol{margin:8px 0 8px 1.2em;padding:0}
.ymd li{margin:3px 0}
.ymd li>ul,.ymd li>ol{margin:2px 0 2px 1.1em}
.ymd blockquote{border-left:4px solid var(--rpt-accent);background:var(--rpt-box);margin:12px 0;padding:8px 14px;border-radius:0 10px 10px 0}
.ymd blockquote p{margin:4px 0}
.ymd hr{border:0;border-top:1px solid var(--rpt-border);margin:26px 0}
.ymd img{max-width:100%;border-radius:10px}
.ymd pre{background:var(--rpt-code-bg);border:1px solid var(--rpt-border2);border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:13px;line-height:1.6}
.ymd pre code{background:transparent;padding:0}
.ymd th{background:var(--rpt-th-bg)}
.ymd td.k2{font-weight:700;color:var(--rpt-heading)}
.ymd .ymd-unresolved{border:1.5px dashed #e5484d;border-radius:10px;padding:10px 14px;color:#c62f35;font-size:13px;margin:12px 0}
`;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// インライン記法。placeholders は @@YMDn@@ の形でエスケープ後も壊れない。
function inline(text, stash) {
  let t = esc(text);
  t = t.replace(/`([^`\n]+)`/g, (m, c) => stash(`<code>${c}</code>`));
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
    stash(`<img src="${src}" alt="${alt}">`));
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) =>
    stash(`<a href="${href}">${label}</a>`));
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return t;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isTableSep(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

// md 本文 → { html, toc: [{id, text}] }
export function renderMarkdown(md) {
  const rawBlocks = []; // :::html の中身など、描画済み HTML の置き場
  const stash = (html) => {
    rawBlocks.push(html);
    return `@@YMD${rawBlocks.length - 1}@@`;
  };
  const unstash = (s) => s.replace(/@@YMD(\d+)@@/g, (m, i) => rawBlocks[Number(i)] ?? "");

  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");

  // 第1パス: 独自ブロックとフェンスコードを stash へ退避し、プレースホルダ行に置換する
  const pass1 = [];
  let i = 0;
  let droppedTitle = false;
  while (i < lines.length) {
    const line = lines[i];
    const htmlOpen = line.match(/^:::html(?:\s+src="([^"]+)")?\s*$/);
    if (htmlOpen) {
      if (htmlOpen[1]) {
        pass1.push(stash(`<div class="ymd-unresolved">外部 HTML「${esc(htmlOpen[1])}」が未展開です。publish CLI 経由で公開してください。</div>`));
        i++;
        continue;
      }
      const buf = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // 閉じ :::
      pass1.push(stash(buf.join("\n")));
      continue;
    }
    const askOpen = line.match(/^:::ask(?:\s+(.*))?$/);
    if (askOpen) {
      const buf = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      const qParts = [];
      if (askOpen[1]) qParts.push(askOpen[1].trim());
      const opts = [];
      const notes = [];
      let seenOpt = false;
      for (const b of buf) {
        const t = b.trim();
        if (!t) continue;
        const om = t.match(/^[-*]\s+(.*)$/);
        if (om) {
          seenOpt = true;
          let label = om[1].trim();
          let rec = false;
          if (/[（(]おすすめ[）)]\s*$/.test(label) || /\*\s*$/.test(label)) {
            rec = true;
            label = label.replace(/[（(]おすすめ[）)]\s*$/, "").replace(/\*\s*$/, "").trim();
          }
          opts.push({ label, rec });
        } else if (!seenOpt) {
          qParts.push(t);
        } else {
          notes.push(t);
        }
      }
      const q = qParts.join(" ");
      const optHtml = opts.map((o) => o.rec
        ? `<button class="rv-opt" data-recommend>${inline(o.label, stash)}<span class="rv-rec">おすすめ</span></button>`
        : `<button class="rv-opt">${inline(o.label, stash)}</button>`).join("");
      const noteHtml = notes.length ? `<p>${notes.map((n) => inline(n, stash)).join("<br>")}</p>` : "";
      pass1.push(stash(`<div class="rv-item" data-q="${esc(q)}"><div class="rv-q">${inline(q, stash)}</div><div class="rv-choices">${optHtml}</div>${noteHtml}<textarea class="rv-comment" placeholder="コメント（任意）"></textarea></div>`));
      continue;
    }
    if (/^:::decision\s*$/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      const inner = renderMarkdown(buf.join("\n")).html;
      pass1.push(stash(`<div class="rpt-decision">${inner}</div>`));
      continue;
    }
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      pass1.push(stash(`<pre><code>${esc(buf.join("\n"))}</code></pre>`));
      continue;
    }
    if (!droppedTitle && /^#\s+/.test(line)) { droppedTitle = true; i++; continue; }
    pass1.push(line);
    i++;
  }

  // 第2パス: ブロック描画
  const out = [];
  const toc = [];
  let j = 0;
  const para = [];
  const flushPara = () => {
    if (!para.length) return;
    const text = para.join("\n").trim();
    para.length = 0;
    if (!text) return;
    if (/^@@YMD\d+@@$/.test(text)) { out.push(text); return; }
    out.push(`<p>${inline(text, stash).replace(/\n/g, "<br>")}</p>`);
  };
  while (j < pass1.length) {
    const line = pass1[j];
    const trimmed = line.trim();
    if (/^@@YMD\d+@@$/.test(trimmed)) { flushPara(); out.push(trimmed); j++; continue; }
    if (!trimmed) { flushPara(); j++; continue; }
    const h = line.match(/^(#{2,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 2) {
        const id = `s${toc.length + 1}`;
        toc.push({ id, text: text.replace(/[*`]/g, "") });
        out.push(`<section class="rpt-sec" id="${id}"><div class="rpt-num">${String(toc.length).padStart(2, "0")}</div><h2>${inline(text, stash)}</h2>`);
        // 節は次の ## で閉じる。簡易化のため section は閉じタグを次節直前に付ける
        if (toc.length > 1) out.splice(out.length - 1, 0, "</section>");
      } else {
        out.push(`<h${level}>${inline(text, stash)}</h${level}>`);
      }
      j++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); out.push("<hr>"); j++; continue; }
    if (/^\s*\|/.test(line) && j + 1 < pass1.length && isTableSep(pass1[j + 1])) {
      flushPara();
      const head = splitRow(line);
      j += 2;
      const rows = [];
      while (j < pass1.length && /^\s*\|/.test(pass1[j]) && pass1[j].trim()) { rows.push(splitRow(pass1[j])); j++; }
      const thead = head.map((c) => `<th>${inline(c, stash)}</th>`).join("");
      const tbody = rows.map((r) =>
        "<tr>" + r.map((c, idx) => idx === 0
          ? `<td class="k2">${inline(c, stash)}</td>`
          : `<td>${inline(c, stash)}</td>`).join("") + "</tr>").join("");
      out.push(`<div class="tblwrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const buf = [];
      while (j < pass1.length && /^\s*>\s?/.test(pass1[j])) { buf.push(pass1[j].replace(/^\s*>\s?/, "")); j++; }
      out.push(`<blockquote><p>${inline(buf.join("\n"), stash).replace(/\n/g, "<br>")}</p></blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flushPara();
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (j < pass1.length && ((ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(pass1[j]) || /^\s{2,}\S/.test(pass1[j]))) {
        const m = pass1[j].match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
        if (m) items.push(m[1]);
        else if (items.length) items[items.length - 1] += "\n" + pass1[j].trim();
        j++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>` + items.map((it) => {
        const task = it.match(/^\[( |x|X)\]\s+(.*)$/);
        if (task) return `<li>${task[1].trim() ? "☑" : "☐"} ${inline(task[2], stash)}</li>`;
        return `<li>${inline(it, stash).replace(/\n/g, "<br>")}</li>`;
      }).join("") + `</${tag}>`);
      continue;
    }
    para.push(line);
    j++;
  }
  flushPara();
  if (toc.length) out.push("</section>");
  return { html: unstash(out.join("\n")), toc };
}

// md 原稿1本 → Yomite の統一ページテンプレートに載せた完成 HTML
export function renderPageFromMd({ title, project, summary, decisionPoints, md, dateStr, slug, emoji }) {
  const { html, toc } = renderMarkdown(md);
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const tocHtml = toc.length >= 3
    ? `<div class="rpt-toc"><h2>目次</h2><ol>${toc.map((t, idx) =>
        `<li><a href="#${t.id}"><span class="n">${String(idx + 1).padStart(2, "0")}</span>${esc(t.text)}</a></li>`).join("")}</ol></div>`
    : "";
  const decisionHtml = decisionPoints
    ? `<div class="rpt-decision">${esc(decisionPoints).replace(/\n/g, "<br>")}</div>`
    : "";
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Yomite</title>
<meta name="description" content="${esc(summary || title)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Yomite">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(summary || title)}">
${slug ? `<meta property="og:url" content="https://yomite.void2610.workers.dev/p/${slug}">` : ""}
${slug ? `<meta property="og:image" content="https://yomite.void2610.workers.dev/og/${slug}.png">` : `<meta property="og:image" content="https://yomite.void2610.workers.dev/og.png">`}
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/kit/report.css">
<link rel="stylesheet" href="/kit/review.css">
<style>${MD_CSS}</style>
</head><body><header class="ymd-bar"><div class="ymd-bar-in"><a class="ymd-logo" href="/">Yomite</a><a class="ymd-bar-link" href="/">記事一覧</a></div></header><div class="rpt ymd">
<div class="ymd-ahead">
${emoji ? `<div class="ymd-bigemo">${esc(emoji)}</div>` : ""}
<h1>${esc(title)}</h1>
<div class="ymd-meta"><span class="ymd-chip">${esc(project || "未分類")}</span><span class="ymd-date">${esc(date)}</span></div>
${summary ? `<p class="ymd-lead">${esc(summary)}</p>` : ""}
</div>
${decisionHtml}
${tocHtml}
${html}
<div class="rpt-foot"><a class="rpt-back" href="/">← Yomite トップへ戻る</a></div>
</div>
<script src="/kit/review.js"></script>
</body></html>`;
}
