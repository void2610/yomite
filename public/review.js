// Yomite 判断キット — スライド29〜33 の判断UIの振る舞い
// ・各 .rv-item 内の .rv-opt は単一選択。選択中は青グラデーション (CSS 側)。
// ・data-recommend の付いた選択肢は薄い黄色で示すだけ。選択 (青) とは色を分ける。
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
      opt.addEventListener("click", function () {
        opts.forEach(function (o) { o.classList.remove("sel"); });
        opt.classList.add("sel");
        save(item);
      });
    });
  });
  // サーバー保存: 選択とコメントを Yomite サーバー (D1) へ送り、開いたときに復元する。
  // コピーバーは従来どおり手元の控えとして残す。
  var slugMatch = location.pathname.match(/^\/p\/(.+)$/);
  var pageSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : "";
  function questionOf(item) {
    var q = item.getAttribute("data-q") || "";
    if (!q) {
      var h = item.querySelector(".rv-q,h3");
      q = h ? h.textContent.replace(/\s+/g, " ").trim() : "項目";
    }
    return q;
  }
  function note(item, msg) {
    var n = item.querySelector(".rv-note");
    if (!n) {
      n = document.createElement("div");
      n.className = "rv-note";
      item.appendChild(n);
    }
    n.textContent = msg;
  }
  var saveTimers = {};
  function save(item) {
    if (!pageSlug) return;
    var sel = item.querySelector(".rv-opt.sel");
    var ta = item.querySelector(".rv-comment");
    var st = {
      question: questionOf(item),
      choice: sel ? textOf(sel) : "",
      comment: ta ? ta.value.trim() : "",
    };
    clearTimeout(saveTimers[st.question]);
    saveTimers[st.question] = setTimeout(function () {
      fetch("/api/answers/" + encodeURIComponent(pageSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(st),
      })
        .then(function (r) { if (r.ok) note(item, "サーバーに保存しました ✓"); })
        .catch(function () {});
    }, 350);
  }
  items.forEach(function (item) {
    var ta = item.querySelector(".rv-comment");
    if (ta) {
      ta.addEventListener("change", function () { save(item); });
      ta.addEventListener("blur", function () { save(item); });
    }
  });
  if (pageSlug) {
    fetch("/api/answers/" + encodeURIComponent(pageSlug))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.answers) return;
        var byQ = {};
        data.answers.forEach(function (a) { byQ[a.question] = a; });
        items.forEach(function (item) {
          var a = byQ[questionOf(item)];
          if (!a) return;
          if (a.choice) {
            Array.prototype.slice.call(item.querySelectorAll(".rv-opt")).forEach(function (o) {
              o.classList.toggle("sel", textOf(o) === a.choice);
            });
          }
          var ta = item.querySelector(".rv-comment");
          if (ta && a.comment) ta.value = a.comment;
          if (a.choice || a.comment) note(item, "サーバーに保存しました ✓");
        });
      })
      .catch(function () {});
  }

    document.querySelectorAll(".rv-opt").forEach(function (b) { if (!b.getAttribute("type")) b.setAttribute("type", "button"); });

})();
