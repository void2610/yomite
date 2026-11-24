// Yomite 判断キット — スライド29〜33 の判断UIの振る舞い
// ・各 .rv-item 内の .rv-opt は単一選択。選択中は青グラデーション (CSS 側)。
// ・data-recommend の付いた選択肢は初期選択される (推奨を反映した状態で見せる)。
// ・返事をしなければ OK: 未操作の項目は推奨がそのままコピー結果に入る。
//   推奨のない項目は、選択もコメントも無ければコピーに含まれない。
// ・「選んだ結果をまとめてコピー」: 選んだ項目とコメントだけを1行ずつ
//   「質問 選択肢（コメント）」の形でコピーする (スライド33 の形式)。
(function () {
  function textOf(el) {
    var t = "";
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 3) t += n.textContent;
      else if (n.nodeType === 1 && !n.classList.contains("rv-rec")) t += n.textContent;
    });
    return t.trim();
  }
  var items = Array.prototype.slice.call(document.querySelectorAll(".rv-item"));
  items.forEach(function (item) {
    var opts = Array.prototype.slice.call(item.querySelectorAll(".rv-opt"));
    opts.forEach(function (opt) {
      if (opt.hasAttribute("data-recommend")) opt.classList.add("sel");
      opt.addEventListener("click", function () {
        opts.forEach(function (o) { o.classList.remove("sel"); });
        opt.classList.add("sel");
      });
    });
  });
  function collect() {
    var lines = [];
    items.forEach(function (item) {
      var q = item.getAttribute("data-q") || "";
      if (!q) {
        var h = item.querySelector(".rv-q,h3");
        q = h ? h.textContent.replace(/\s+/g, " ").trim() : "項目";
      }
      var sel = item.querySelector(".rv-opt.sel");
      var selText = sel ? textOf(sel) : "";
      var ta = item.querySelector(".rv-comment");
      var comment = ta ? ta.value.trim() : "";
      if (!selText && !comment) return;
      var line = q;
      if (selText) line += " " + selText;
      if (comment) line += "（" + comment + "）";
      lines.push(line);
    });
    return lines;
  }
    document.querySelectorAll(".rv-opt,.rv-copy").forEach(function (b) { if (!b.getAttribute("type")) b.setAttribute("type", "button"); });
  var btn = document.querySelector(".rv-copy");
  if (btn) {
    btn.addEventListener("click", function () {
      var lines = collect();
      var out = document.querySelector(".rv-out");
      function flash(msg) {
        var old = btn.textContent;
        btn.textContent = msg;
        setTimeout(function () { btn.textContent = old; }, 2800);
      }
      if (!lines.length) {
        if (out) { out.style.display = "block"; out.textContent = "（選んだ項目がありません。選択肢を押すか、コメントを書いてください）"; }
        flash("選んだ項目がありません");
        return;
      }
      var text = lines.join("\n");
      if (out) { out.style.display = "block"; out.textContent = text; }
      function ok() { flash("コピーしました ✓ このまま貼ってください"); }
      function ng() { flash("自動コピーできませんでした。下のテキストを選んでコピーしてください"); if (out) out.scrollIntoView({ block: "nearest" }); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, ng);
      } else {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { if (document.execCommand("copy")) ok(); else ng(); } catch (e) { ng(); }
        document.body.removeChild(ta);
      }
    });
  }

})();
