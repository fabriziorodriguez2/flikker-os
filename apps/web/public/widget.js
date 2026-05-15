(function () {
  'use strict';

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  var script = document.currentScript;
  var container =
    (script &&
    script.previousElementSibling &&
    script.previousElementSibling.getAttribute('data-flikker-widget') !== null
      ? script.previousElementSibling
      : null) || document.querySelector('[data-flikker-widget]');
  var source = container || script;
  if (!source) return;

  var businessId = source.getAttribute('data-business');
  var mode = source.getAttribute('data-mode') || 'toast';
  var accentColor = source.getAttribute('data-color') || '#5C6BC0';
  var position = source.getAttribute('data-position') || 'bottom_right';

  if (!businessId) return;

  var storageKey = 'flikker_widget_closed_' + businessId;
  if (mode === 'toast') {
    try {
      if (sessionStorage.getItem(storageKey) === '1') return;
    } catch (e) {}
  }

  var scriptOrigin =
    script && script.src ? new URL(script.src).origin : window.location.origin;
  var apiUrl =
    scriptOrigin +
    '/api/widget/' +
    encodeURIComponent(businessId) +
    '?mode=' +
    encodeURIComponent(mode);
  var eventsUrl = scriptOrigin + '/api/widget/events';

  // ── Helpers ────────────────────────────────────────────────────────────────
  function postEvent(eventType, reviewId) {
    var payload = JSON.stringify({
      businessId: businessId,
      eventType: eventType,
      googleReviewId: reviewId || undefined,
      referrer: location.href,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          eventsUrl,
          new Blob([payload], { type: 'application/json' }),
        );
        return;
      }
    } catch (e) {}
    fetch(eventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(function () {});
  }

  function daysAgo(value) {
    var posted = new Date(value).getTime();
    if (!posted) return '';
    var days = Math.max(0, Math.round((Date.now() - posted) / 86400000));
    if (days === 0) return 'hoy';
    if (days === 1) return 'hace 1 día';
    if (days < 30) return 'hace ' + days + ' días';
    var months = Math.max(1, Math.round(days / 30));
    if (months === 1) return 'hace 1 mes';
    if (months < 12) return 'hace ' + months + ' meses';
    var years = Math.max(1, Math.round(months / 12));
    if (years === 1) return 'hace 1 año';
    return 'hace ' + years + ' años';
  }

  function starsHtml(count) {
    var out = '';
    for (var i = 0; i < 5; i += 1) {
      out += i < count ? '&#9733;' : '&#9734;';
    }
    return out;
  }

  function initial(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    var a = parts[0] ? parts[0][0] : '';
    var b = parts[1] ? parts[1][0] : '';
    return (a + b).toUpperCase() || '?';
  }

  function esc(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function renderToast(data) {
    var cfg = data.widget || {};
    var reviews = data.reviews;
    if (!reviews || reviews.length === 0) return;

    var color = cfg.primaryColor || accentColor;
    var pos =
      (cfg.position || position) === 'bottom_left'
        ? 'left:16px;right:auto;'
        : 'right:16px;left:auto;';
    var index = 0;

    var host = container || document.createElement('div');
    if (!container) document.body.appendChild(host);
    host.setAttribute('data-flikker-mounted', 'true');

    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    shadow.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.fw{position:fixed;bottom:16px;' +
      pos +
      'z-index:2147483000;width:min(320px,calc(100vw - 32px));font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#11183a;animation:fi .24s cubic-bezier(.2,.8,.2,1)}' +
      '.card{box-sizing:border-box;position:relative;display:grid;grid-template-columns:40px 1fr;gap:10px;width:100%;min-height:108px;border:1px solid rgba(93,104,135,.18);border-radius:18px;background:#e8eefb;box-shadow:0 18px 42px rgba(5,12,35,.22);padding:20px 42px 16px 18px;cursor:pointer}' +
      '.badge{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:' +
      color +
      ';color:#fff;font:800 20px/1 Arial,sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.22)}' +
      '.content{min-width:0}' +
      '.name{margin:0;color:#10183d;font:800 13.5px/1.18 inherit;letter-spacing:.01em}' +
      '.stars{margin-top:7px;color:#ff9f1c;font:700 13px/1 Arial,sans-serif;letter-spacing:1.2px;white-space:nowrap}' +
      '.meta{margin-top:6px;color:#69718f;font:500 11.5px/1.2 inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.x{position:absolute;top:9px;right:9px;display:flex;align-items:center;justify-content:center;width:23px;height:23px;border:0;border-radius:999px;background:rgba(255,255,255,.62);color:#6d7691;font:400 17px/1 Arial,sans-serif;cursor:pointer}' +
      '.x:hover{background:#fff;color:#11183a}' +
      '@keyframes fi{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}' +
      '@media(max-width:480px){.fw{bottom:12px;left:12px!important;right:12px!important;width:auto}.card{border-radius:17px}}' +
      '</style>' +
      '<div class="fw"><div class="card" role="button" tabindex="0">' +
      '<button class="x" aria-label="Cerrar">&times;</button>' +
      '<div class="badge">&#9733;</div>' +
      '<div class="content"><p class="name"></p><div class="stars"></div><div class="meta"></div></div>' +
      '</div></div>';

    var root = shadow.querySelector('.fw');
    var card = shadow.querySelector('.card');
    var closeBtn = shadow.querySelector('.x');
    var nameEl = shadow.querySelector('.name');
    var starsEl = shadow.querySelector('.stars');
    var metaEl = shadow.querySelector('.meta');

    function showReview() {
      var review = reviews[index % reviews.length];
      var rating = review.rating || 5;
      nameEl.textContent =
        (review.authorDisplayName || 'Alguien') +
        ' nos dejó ' +
        rating +
        ' estrellas';
      starsEl.innerHTML = starsHtml(rating);
      metaEl.textContent =
        daysAgo(review.reviewedAt) + '  •  Powered by Flikker';
      card.setAttribute('data-review-id', review.id || '');
      index += 1;
    }

    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      try {
        sessionStorage.setItem(storageKey, '1');
      } catch (e) {}
      postEvent('close', card.getAttribute('data-review-id'));
      root.remove();
    });
    card.addEventListener('click', function () {
      postEvent('click', card.getAttribute('data-review-id'));
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ')
        postEvent('click', card.getAttribute('data-review-id'));
    });

    showReview();
    postEvent('impression', card.getAttribute('data-review-id'));
    setInterval(
      showReview,
      Math.min(120, Math.max(8, cfg.rotationSeconds || 9)) * 1000,
    );
  }

  // ── Carousel ───────────────────────────────────────────────────────────────
  function renderCarousel(data) {
    var cfg = data.widget || {};
    var reviews = data.reviews;
    if (!reviews || reviews.length === 0) return;

    var color = cfg.primaryColor || accentColor;
    var isPaused = false;

    var host = document.createElement('div');
    host.setAttribute('data-flikker-carousel', '1');
    host.style.cssText = 'display:block;box-sizing:border-box;width:100%';
    if (script && script.parentNode) {
      script.parentNode.insertBefore(host, script);
    } else {
      document.body.appendChild(host);
    }

    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var cardsHtml = reviews
      .map(function (r) {
        return (
          '<div class="flk-c-card" data-id="' +
          esc(r.id || '') +
          '">' +
          '<div class="flk-c-top">' +
          '<div class="flk-c-av" style="background:' +
          color +
          '">' +
          esc(initial(r.authorDisplayName)) +
          '</div>' +
          '<div class="flk-c-info">' +
          '<p class="flk-c-name">' +
          esc(r.authorDisplayName || 'Anónimo') +
          '</p>' +
          '<div class="flk-c-stars">' +
          starsHtml(r.rating || 5) +
          '</div>' +
          '</div>' +
          '</div>' +
          (r.content
            ? '<p class="flk-c-text">' + esc(r.content) + '</p>'
            : '') +
          '<p class="flk-c-date">' +
          daysAgo(r.reviewedAt) +
          '</p>' +
          '</div>'
        );
      })
      .join('');

    shadow.innerHTML =
      '<style>' +
      ':host{all:initial;display:block}' +
      '.flk-c-wrap{box-sizing:border-box;width:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#1a202c}' +
      '.flk-c-viewport{overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
      '.flk-c-viewport::-webkit-scrollbar{display:none}' +
      '.flk-c-track{display:flex;gap:14px;width:max-content}' +
      '.flk-c-card{scroll-snap-align:start;box-sizing:border-box;width:280px;background:#fff;border:1px solid #e8eaf0;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.06);cursor:default}' +
      '.flk-c-top{display:flex;align-items:center;gap:10px}' +
      '.flk-c-av{width:38px;height:38px;border-radius:50%;color:#fff;font:700 14px/38px Arial,sans-serif;text-align:center;flex-shrink:0}' +
      '.flk-c-info{min-width:0;flex:1}' +
      '.flk-c-name{margin:0;font:700 13px/1.2 inherit;color:#1a202c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.flk-c-stars{margin-top:3px;color:#ff9f1c;font:600 13px/1 Arial,sans-serif;letter-spacing:.8px}' +
      '.flk-c-text{margin:0;font:400 13px/1.55 inherit;color:#4a5568;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}' +
      '.flk-c-date{margin:auto 0 0;font:500 11px/1 inherit;color:#a0aec0}' +
      '.flk-c-nav{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px}' +
      '.flk-c-btn{width:34px;height:34px;border:1px solid #e8eaf0;border-radius:50%;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font:500 16px/1 Arial,sans-serif;color:#718096;transition:border-color .15s,color .15s;padding:0}' +
      '.flk-c-btn:hover{border-color:' +
      color +
      ';color:' +
      color +
      '}' +
      '.flk-c-dots{display:flex;gap:5px;align-items:center}' +
      '.flk-c-dot{width:6px;height:6px;border-radius:50%;background:#e2e8f0;transition:all .2s}' +
      '.flk-c-dot.on{background:' +
      color +
      ';width:16px;border-radius:3px}' +
      '.flk-c-brand{text-align:center;margin-top:10px;font:400 10px/1 inherit;color:#cbd5e0;letter-spacing:.05em}' +
      '@media(max-width:540px){.flk-c-card{width:calc(100vw - 48px)}}' +
      '</style>' +
      '<div class="flk-c-wrap">' +
      '<div class="flk-c-viewport" id="flkV">' +
      '<div class="flk-c-track" id="flkT">' +
      cardsHtml +
      '</div></div>' +
      '<div class="flk-c-nav">' +
      '<button class="flk-c-btn" id="flkP" aria-label="Anterior">&#8592;</button>' +
      '<div class="flk-c-dots" id="flkD"></div>' +
      '<button class="flk-c-btn" id="flkN" aria-label="Siguiente">&#8594;</button>' +
      '</div>' +
      '<p class="flk-c-brand">Con tecnología de Flikker</p>' +
      '</div>';

    var viewport = shadow.getElementById('flkV');
    var prevBtn = shadow.getElementById('flkP');
    var nextBtn = shadow.getElementById('flkN');
    var dotsEl = shadow.getElementById('flkD');
    var total = reviews.length;

    for (var d = 0; d < total; d += 1) {
      var dot = document.createElement('div');
      dot.className = 'flk-c-dot' + (d === 0 ? ' on' : '');
      dotsEl.appendChild(dot);
    }

    function cardWidth() {
      var c = shadow.querySelector('.flk-c-card');
      return c ? c.offsetWidth + 14 : 294;
    }

    function scrollTo(idx) {
      viewport.scrollLeft = idx * cardWidth();
    }

    function updateDots() {
      var idx = Math.round(viewport.scrollLeft / cardWidth());
      var dots = shadow.querySelectorAll('.flk-c-dot');
      for (var i = 0; i < dots.length; i += 1) {
        dots[i].className = 'flk-c-dot' + (i === idx ? ' on' : '');
      }
    }

    prevBtn.addEventListener('click', function () {
      isPaused = true;
      var idx = Math.round(viewport.scrollLeft / cardWidth());
      scrollTo(Math.max(0, idx - 1));
    });
    nextBtn.addEventListener('click', function () {
      isPaused = true;
      var idx = Math.round(viewport.scrollLeft / cardWidth());
      scrollTo(Math.min(total - 1, idx + 1));
    });
    viewport.addEventListener('scroll', updateDots);
    viewport.addEventListener('mouseenter', function () {
      isPaused = true;
    });
    viewport.addEventListener('mouseleave', function () {
      isPaused = false;
    });

    postEvent('impression');
    setInterval(function () {
      if (isPaused) return;
      var idx = Math.round(viewport.scrollLeft / cardWidth());
      scrollTo(idx >= total - 1 ? 0 : idx + 1);
    }, 6000);
  }

  // ── Grid ───────────────────────────────────────────────────────────────────
  function renderGrid(data) {
    var cfg = data.widget || {};
    var reviews = data.reviews;
    if (!reviews || reviews.length === 0) return;

    var color = cfg.primaryColor || accentColor;
    var maxItems = cfg.maxItems || cfg.maxReviewsShown || 6;
    var shown = reviews.slice(0, maxItems);

    var host = document.createElement('div');
    host.setAttribute('data-flikker-grid', '1');
    host.style.cssText = 'display:block;box-sizing:border-box;width:100%';
    if (script && script.parentNode) {
      script.parentNode.insertBefore(host, script);
    } else {
      document.body.appendChild(host);
    }

    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var cardsHtml = shown
      .map(function (r) {
        return (
          '<article class="flk-g-card">' +
          '<div class="flk-g-top">' +
          '<div class="flk-g-av" style="background:' +
          color +
          '">' +
          esc(initial(r.authorDisplayName)) +
          '</div>' +
          '<div class="flk-g-meta">' +
          '<p class="flk-g-name">' +
          esc(r.authorDisplayName || 'Anónimo') +
          '</p>' +
          '<div class="flk-g-stars">' +
          starsHtml(r.rating || 5) +
          '</div>' +
          '</div>' +
          '</div>' +
          (r.content
            ? '<p class="flk-g-text">' + esc(r.content) + '</p>'
            : '<p class="flk-g-empty">Sin comentario</p>') +
          '<p class="flk-g-date">' +
          daysAgo(r.reviewedAt) +
          '</p>' +
          '</article>'
        );
      })
      .join('');

    shadow.innerHTML =
      '<style>' +
      ':host{all:initial;display:block}' +
      '.flk-g{box-sizing:border-box;width:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#1a202c}' +
      '.flk-g-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}' +
      '.flk-g-card{box-sizing:border-box;background:#fff;border:1px solid #e8eaf0;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)}' +
      '.flk-g-top{display:flex;align-items:center;gap:10px}' +
      '.flk-g-av{width:36px;height:36px;border-radius:50%;color:#fff;font:700 13px/36px Arial,sans-serif;text-align:center;flex-shrink:0}' +
      '.flk-g-meta{min-width:0;flex:1}' +
      '.flk-g-name{margin:0;font:700 13px/1.2 inherit;color:#1a202c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.flk-g-stars{margin-top:3px;color:#ff9f1c;font:600 13px/1 Arial,sans-serif;letter-spacing:.8px}' +
      '.flk-g-text{margin:0;font:400 13px/1.55 inherit;color:#4a5568;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical}' +
      '.flk-g-empty{margin:0;font:400 12px/1 inherit;color:#a0aec0;font-style:italic}' +
      '.flk-g-date{margin:auto 0 0;padding-top:4px;font:500 11px/1 inherit;color:#a0aec0}' +
      '.flk-g-brand{text-align:right;margin-top:10px;font:400 10px/1 inherit;color:#cbd5e0;letter-spacing:.05em}' +
      '</style>' +
      '<div class="flk-g">' +
      '<div class="flk-g-grid">' +
      cardsHtml +
      '</div>' +
      '<p class="flk-g-brand">Con tecnología de Flikker</p>' +
      '</div>';

    postEvent('impression');
  }

  // ── Fetch & dispatch ───────────────────────────────────────────────────────
  fetch(apiUrl, { credentials: 'omit', mode: 'cors' })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (!data || !data.reviews || data.reviews.length === 0) return;
      if (mode === 'toast') renderToast(data);
      else if (mode === 'carousel') renderCarousel(data);
      else if (mode === 'grid') renderGrid(data);
    })
    .catch(function () {});
})();
