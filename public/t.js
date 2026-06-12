/**
 * Tracking de origem pras LPs do OBA — first-touch 30d.
 * Instalação: <script src="https://dash-traqueamento.vercel.app/t.js" defer></script>
 * Captura ?sck= / ?utm_* da URL, persiste em localStorage, e decora todos os
 * links pay.hotmart.com da página. Formato compatível com o parser do dash.
 */
(function () {
  var KEY = "oba_trk";
  var TTL = 30 * 24 * 60 * 60 * 1000;

  function readStored() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj.t || Date.now() - obj.t > TTL) return null;
      return obj.sck || null;
    } catch (e) { return null; }
  }

  function buildSckFromUrl() {
    var p = new URLSearchParams(location.search);
    if (p.get("sck")) return p.get("sck"); // já vem montado (anúncio)
    var s = p.get("utm_source"), m = p.get("utm_medium"),
        c = p.get("utm_campaign"), co = p.get("utm_content");
    if (!s) return null;
    var t = /organic/i.test(s) ? "organico" : "pago";
    var parts = ["s=" + s];
    if (m) parts.push("m=" + m);
    if (c) parts.push("c=" + c);
    if (co) parts.push("co=" + co);
    parts.push("t=" + t);
    return parts.join("|");
  }

  var fromUrl = buildSckFromUrl();
  var sck = readStored() || fromUrl; // first-touch: o guardado ganha
  if (fromUrl && !readStored()) {
    try { localStorage.setItem(KEY, JSON.stringify({ sck: fromUrl, t: Date.now() })); } catch (e) {}
  }
  if (!sck) return;

  function decorate() {
    var links = document.querySelectorAll('a[href*="pay.hotmart.com"]');
    for (var i = 0; i < links.length; i++) {
      try {
        var u = new URL(links[i].href);
        if (!u.searchParams.get("sck")) {
          u.searchParams.set("sck", sck);
          links[i].href = u.toString();
        }
      } catch (e) {}
    }
  }
  decorate();
  new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true });
})();
