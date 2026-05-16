/*!
 * Traqueamento — script público de captura de UTMs e leads.
 *
 * Uso (uma única vez no <head> da LP):
 *   <script async src="https://dash-traqueamento.vercel.app/track.js"
 *           data-endpoint="https://dash-traqueamento.vercel.app/api/track/lead"></script>
 *
 * O script:
 *  1) lê utm_source/medium/campaign/content/term + fbclid da URL no primeiro hit
 *  2) salva tudo em cookie de 30 dias (`tq_attr`) — visitas seguintes preservam
 *     a origem do primeiro toque, mesmo que o usuário clique em outro link sem UTM
 *  3) expõe `window.traqueamento.capture({ email, phone, name })` pra ser chamado
 *     no submit do form da LP / Hotmart
 *
 * Não usa cookies de terceiros e não bloqueia o load.
 */
(function () {
  "use strict";

  // Endpoint resolvido a partir do <script src="..." data-endpoint="...">
  // Fallback: mesmo origin onde esse script foi servido + /api/track/lead.
  function resolveEndpoint() {
    var current =
      document.currentScript ||
      (function () {
        var scripts = document.getElementsByTagName("script");
        for (var i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i].src && scripts[i].src.indexOf("track.js") !== -1) {
            return scripts[i];
          }
        }
        return null;
      })();
    if (current) {
      var explicit = current.getAttribute("data-endpoint");
      if (explicit) return explicit;
      try {
        var u = new URL(current.src);
        return u.origin + "/api/track/lead";
      } catch (e) {}
    }
    return "/api/track/lead";
  }

  var ENDPOINT = resolveEndpoint();
  var COOKIE_NAME = "tq_attr";
  var COOKIE_DAYS = 30;
  var UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "fbclid",
    "gclid",
  ];

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      ";expires=" +
      d.toUTCString() +
      ";path=/;SameSite=Lax";
  }

  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"),
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  function parseQueryUtms() {
    var out = {};
    try {
      var url = new URL(window.location.href);
      UTM_KEYS.forEach(function (k) {
        var v = url.searchParams.get(k);
        if (v) out[k] = v;
      });
    } catch (e) {}
    return out;
  }

  function captureFirstTouch() {
    var fromUrl = parseQueryUtms();
    var existing = null;
    try {
      var raw = getCookie(COOKIE_NAME);
      if (raw) existing = JSON.parse(raw);
    } catch (e) {}

    // First touch wins. Se já existe cookie e a URL atual não traz UTM, preserva.
    if (existing && Object.keys(fromUrl).length === 0) {
      return existing;
    }

    var merged = existing || {};
    var hasNew = false;
    UTM_KEYS.forEach(function (k) {
      if (fromUrl[k]) {
        // Se vem novo UTM, sobrescreve (clique mais recente = sessão mais relevante)
        merged[k] = fromUrl[k];
        hasNew = true;
      }
    });
    if (hasNew || !existing) {
      merged.landing_url = window.location.href;
      merged.captured_at = new Date().toISOString();
      try {
        setCookie(COOKIE_NAME, JSON.stringify(merged), COOKIE_DAYS);
      } catch (e) {}
    }
    return merged;
  }

  function getFbp() {
    return getCookie("_fbp");
  }

  var attribution = captureFirstTouch();

  function capture(contact, opts) {
    var payload = {
      email: contact && contact.email,
      phone: contact && contact.phone,
      name: contact && contact.name,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      utm_term: attribution.utm_term,
      fbclid: attribution.fbclid,
      fbp_cookie: getFbp(),
      landing_url: attribution.landing_url || window.location.href,
    };

    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: "cors",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("track failed " + r.status);
        return r.json();
      })
      .catch(function (err) {
        // Silencioso por padrão — não derruba o submit do form
        if (opts && opts.onError) opts.onError(err);
      });
  }

  // Reescreve links de checkout Hotmart injetando ?src=<utm_source>__<utm_campaign>__<utm_content>
  // baseado na atribuição do cookie. Só mexe se o link ainda não tiver src=.
  // Assim a atribuição sobrevive ao pulo LP→checkout mesmo sem submit de form.
  function buildHotmartSrc() {
    var parts = [
      attribution.utm_source,
      attribution.utm_campaign,
      attribution.utm_content,
    ];
    var clean = parts
      .map(function (p) {
        return p ? String(p).replace(/[^\w-]+/g, "") : "";
      })
      .filter(Boolean);
    return clean.length ? clean.join("__") : null;
  }

  function rewriteHotmartLinks() {
    var src = buildHotmartSrc();
    if (!src) return;
    var anchors = document.getElementsByTagName("a");
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute("href");
      if (!href) continue;
      if (!/hotmart\.com/i.test(href)) continue;
      if (/[?&]src=/.test(href)) continue;
      var sep = href.indexOf("?") === -1 ? "?" : "&";
      a.setAttribute("href", href + sep + "src=" + encodeURIComponent(src));
    }
  }

  function autoAttachForms() {
    // Hooka automaticamente forms que têm input[name=email] ou [name=phone]
    document.addEventListener(
      "submit",
      function (e) {
        var form = e.target;
        if (!form || form.tagName !== "FORM") return;
        var email = form.querySelector("input[type=email], input[name=email]");
        var phone =
          form.querySelector("input[name=phone]") ||
          form.querySelector("input[name=telefone]") ||
          form.querySelector("input[name=whatsapp]");
        var name =
          form.querySelector("input[name=name]") ||
          form.querySelector("input[name=nome]");
        if (!email && !phone) return;
        capture({
          email: email ? email.value : undefined,
          phone: phone ? phone.value : undefined,
          name: name ? name.value : undefined,
        });
      },
      true,
    );
  }

  window.traqueamento = {
    capture: capture,
    attribution: attribution,
  };

  function boot() {
    autoAttachForms();
    rewriteHotmartLinks();
    // Cobre LPs que inserem links via JS depois do load (popups, SPAs leves)
    if (typeof MutationObserver !== "undefined") {
      try {
        var mo = new MutationObserver(function () {
          rewriteHotmartLinks();
        });
        mo.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
