(function () {
  'use strict';

  // ── Shared constants ───────────────────────────────────────────────────────
  var FLK_MARK =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 516.34 402.58"' +
    ' style="height:.75em;width:auto;display:inline-block;vertical-align:-.12em;fill:currentColor"' +
    ' aria-hidden="true">' +
    '<polygon points="169.64 200.96 214.33 149.16 173.32 101.62 0 302.58 86.22 402.58 173.32 301.6 260.42 402.58 346.69 302.58 300.58 249.13 255.86 300.95 169.64 200.96"/>' +
    '<polygon points="430.11 300.95 516.34 200.96 342.99 0 214.33 149.16 300.58 249.13 342.99 199.96 430.11 300.95"/>' +
    '</svg>';
  var FLK_BRAND = 'Powered by ' + FLK_MARK + ' <strong>Flikker</strong>';
  var ICON_PREV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
  var ICON_NEXT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

  // ── Shared helpers ─────────────────────────────────────────────────────────
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

  // ── Per-widget initialization ──────────────────────────────────────────────
  function initWidget(scriptEl, containerEl) {
    var attrSource = scriptEl || containerEl;
    if (!attrSource) return;

    var businessId = attrSource.getAttribute('data-business');
    if (!businessId) return;

    var mode = attrSource.getAttribute('data-mode') || 'toast';
    var accentColor = attrSource.getAttribute('data-color') || '#5C6BC0';
    var bgColor = attrSource.getAttribute('data-bg') || 'transparent';
    var widgetTitle = attrSource.getAttribute('data-title') || 'Testimonios';
    var titleColor = bgColor !== 'transparent' ? '#ffffff' : '#1a202c';
    var position = attrSource.getAttribute('data-position') || 'bottom_right';

    var scriptOrigin =
      scriptEl && scriptEl.src
        ? new URL(scriptEl.src).origin
        : window.location.origin;
    var apiUrl =
      scriptOrigin +
      '/api/widget/' +
      encodeURIComponent(businessId) +
      '?mode=' +
      encodeURIComponent(mode);
    var eventsUrl = scriptOrigin + '/api/widget/events';

    function postEvent(eventType, reviewId) {
      var payload = JSON.stringify({
        businessId: businessId,
        eventType: eventType,
        googleReviewId: reviewId || undefined,
        referrer: location.href,
      });
      fetch(eventsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        credentials: 'omit',
        keepalive: true,
      }).catch(function () {});
    }

    // ── Toast ────────────────────────────────────────────────────────────────
    function renderToast(data) {
      var cfg = data.widget || {};
      var reviews = data.reviews;
      if (!reviews || reviews.length === 0) return;

      var color = accentColor;
      var isLeft = (cfg.position || position) === 'bottom_left';
      var index = 0;

      var host = containerEl || document.createElement('div');
      if (!containerEl) {
        // Apply position:fixed on the host in the main DOM (not inside shadow)
        // and append to <html> to avoid body transform containing-block issues
        host.style.cssText =
          'position:fixed!important;bottom:16px!important;' +
          (isLeft ? 'left:16px!important;right:auto!important;' : 'right:16px!important;left:auto!important;') +
          'z-index:2147483647!important;width:min(320px,calc(100vw - 32px))!important;' +
          'display:block!important;box-sizing:border-box!important;pointer-events:auto!important;';
        document.documentElement.appendChild(host);
      }
      host.setAttribute('data-flikker-mounted', 'true');

      var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
      shadow.innerHTML =
        '<style>' +
        ':host{display:block}' +
        '.fw{display:block;width:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#11183a}' +
        '.card{box-sizing:border-box;position:relative;display:grid;grid-template-columns:40px 1fr;gap:10px;width:100%;border:1px solid rgba(93,104,135,.18);border-radius:18px;background:#e8eefb;box-shadow:0 18px 42px rgba(5,12,35,.22);padding:14px 42px 14px 16px;cursor:pointer}' +
        '.badge{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:' +
        color +
        ';color:#fff;font:800 20px/1 Arial,sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.22)}' +
        '.content{min-width:0}' +
        '.name{margin:0;color:#10183d;font:800 15px/1.2 inherit;letter-spacing:.01em}' +
        '.stars{margin-top:6px;color:#ff9f1c;font:700 14px/1 Arial,sans-serif;letter-spacing:1.2px;white-space:nowrap}' +
        '.meta{margin-top:5px;color:#69718f;font:500 12px/1.3 inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.x{position:absolute;top:9px;right:9px;display:flex;align-items:center;justify-content:center;width:23px;height:23px;border:0;border-radius:999px;background:rgba(255,255,255,.62);color:#6d7691;font:400 17px/1 Arial,sans-serif;cursor:pointer}' +
        '.x:hover{background:#fff;color:#11183a}' +
        '</style>' +
        '<div class="fw"><div class="card" role="button" tabindex="0">' +
        '<button class="x" aria-label="Cerrar">&times;</button>' +
        '<div class="badge">&#9733;</div>' +
        '<div class="content"><p class="name"></p><div class="stars"></div><div class="meta"></div></div>' +
        '</div></div>';

      // Adjust host position on small screens
      if (!containerEl) {
        var mq = window.matchMedia('(max-width:480px)');
        function applyMobile(e) {
          if (e.matches) {
            host.style.left = isLeft ? '12px' : 'auto';
            host.style.right = isLeft ? 'auto' : '12px';
            host.style.bottom = '12px';
            host.style.width = 'min(280px,calc(100vw - 24px))';
          } else {
            host.style.left = isLeft ? '16px' : 'auto';
            host.style.right = isLeft ? 'auto' : '16px';
            host.style.bottom = '16px';
            host.style.width = 'min(320px,calc(100vw - 32px))';
          }
        }
        applyMobile(mq);
        if (mq.addEventListener) mq.addEventListener('change', applyMobile);
        else if (mq.addListener) mq.addListener(applyMobile);
      }

      var root = shadow.querySelector('.fw');
      var card = shadow.querySelector('.card');
      var closeBtn = shadow.querySelector('.x');
      var nameEl = shadow.querySelector('.name');
      var starsEl = shadow.querySelector('.stars');
      var metaEl = shadow.querySelector('.meta');

      var dismissed = false;
      var displayMs = Math.max(5000, Math.min(12000, (cfg.rotationSeconds || 8) * 1000));
      var pauseMs = 80000;

      function loadReview() {
        var review = reviews[index % reviews.length];
        var rating = review.rating || 5;
        nameEl.textContent =
          (review.authorDisplayName || 'Alguien') + ' nos dejó ' + rating + ' estrellas';
        starsEl.innerHTML = starsHtml(rating);
        metaEl.innerHTML = daysAgo(review.reviewedAt) + ' • ' + FLK_BRAND;
        card.setAttribute('data-review-id', review.id || '');
      }

      function cycle() {
        if (dismissed) return;
        loadReview();
        postEvent('impression', card.getAttribute('data-review-id'));
        root.style.display = 'block';
        root.style.opacity = '0';
        root.style.transform = 'translateY(10px)';
        root.style.transition = 'opacity .25s ease,transform .25s ease';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            root.style.opacity = '1';
            root.style.transform = 'translateY(0)';
            setTimeout(function () {
              if (dismissed) return;
              root.style.opacity = '0';
              root.style.transform = 'translateY(6px)';
              setTimeout(function () {
                if (dismissed) return;
                root.style.display = 'none';
                root.style.transition = '';
                index = (index + 1) % reviews.length;
                setTimeout(cycle, pauseMs);
              }, 260);
            }, displayMs);
          });
        });
      }

      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        dismissed = true;
        postEvent('close', card.getAttribute('data-review-id'));
        host.remove();
      });
      card.addEventListener('click', function () {
        postEvent('click', card.getAttribute('data-review-id'));
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ')
          postEvent('click', card.getAttribute('data-review-id'));
      });

      root.style.display = 'none';
      cycle();
    }

    // ── Carousel ─────────────────────────────────────────────────────────────
    function renderCarousel(data) {
      var cfg = data.widget || {};
      var reviews = data.reviews;
      if (!reviews || reviews.length === 0) return;

      var color = accentColor;
      var isPaused = false;

      var host = containerEl || document.createElement('div');
      host.setAttribute('data-flikker-carousel', '1');
      host.style.cssText = 'display:block;box-sizing:border-box;width:100%';
      if (!containerEl && scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.insertBefore(host, scriptEl);
      } else if (!containerEl) {
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
            (r.content ? '<p class="flk-c-text">' + esc(r.content) + '</p>' : '') +
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
        '.flk-c-wrap{box-sizing:border-box;width:100%;background:' + bgColor + ';padding:40px 0 32px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#1a202c}' +
        '.flk-c-inner{max-width:640px;margin:0 auto;padding:0 20px}' +
        '.flk-c-title{margin:0 0 24px;text-align:center;font:700 28px/1.2 inherit;letter-spacing:-.02em;color:' + titleColor + '}' +
        '.flk-c-viewport{overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
        '.flk-c-viewport::-webkit-scrollbar{display:none}' +
        '.flk-c-track{display:flex;gap:0}' +
        '.flk-c-card{scroll-snap-align:start;box-sizing:border-box;flex:0 0 100%;min-width:100%;background:#fff;border:1px solid #e8eaf0;border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.07);cursor:default}' +
        '.flk-c-top{display:flex;align-items:center;gap:12px}' +
        '.flk-c-av{width:42px;height:42px;border-radius:50%;color:#fff;font:700 15px/42px Arial,sans-serif;text-align:center;flex-shrink:0}' +
        '.flk-c-info{min-width:0;flex:1}' +
        '.flk-c-name{margin:0;font:700 14px/1.2 inherit;color:#1a202c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.flk-c-stars{margin-top:4px;color:#ff9f1c;font:600 14px/1 Arial,sans-serif;letter-spacing:.8px}' +
        '.flk-c-text{margin:0;font:400 14px/1.6 inherit;color:#4a5568;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical}' +
        '.flk-c-date{margin:auto 0 0;font:500 12px/1 inherit;color:#a0aec0}' +
        '.flk-c-nav{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:20px}' +
        '.flk-c-btn{width:40px;height:40px;border:1.5px solid #e2e8f0;border-radius:50%;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#718096;transition:border-color .15s,color .15s,box-shadow .15s;padding:0;line-height:1}' +
        '.flk-c-btn:hover{border-color:' + color + ';color:' + color + ';box-shadow:0 0 0 3px ' + color + '22}' +
        '.flk-c-dots{display:flex;gap:6px;align-items:center}' +
        '.flk-c-dot{width:6px;height:6px;border-radius:50%;background:#e2e8f0;transition:all .2s}' +
        '.flk-c-dot.on{background:' + color + ';width:18px;border-radius:3px}' +
        '.flk-c-brand{text-align:center;margin-top:48px;font:400 8px/1 inherit;color:#718096;letter-spacing:.06em;opacity:.25;transform:scale(.85);transform-origin:center}' +
        '</style>' +
        '<div class="flk-c-wrap">' +
        '<div class="flk-c-inner">' +
        (widgetTitle ? '<p class="flk-c-title">' + esc(widgetTitle) + '</p>' : '') +
        '<div class="flk-c-viewport" id="flkV">' +
        '<div class="flk-c-track" id="flkT">' +
        cardsHtml +
        '</div></div>' +
        '<div class="flk-c-nav">' +
        '<button class="flk-c-btn" id="flkP" aria-label="Anterior">' + ICON_PREV + '</button>' +
        '<div class="flk-c-dots" id="flkD"></div>' +
        '<button class="flk-c-btn" id="flkN" aria-label="Siguiente">' + ICON_NEXT + '</button>' +
        '</div>' +
        '<p class="flk-c-brand">' + FLK_BRAND + '</p>' +
        '</div>' +
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
        return viewport.offsetWidth || 300;
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
      viewport.addEventListener('mouseenter', function () { isPaused = true; });
      viewport.addEventListener('mouseleave', function () { isPaused = false; });

      postEvent('impression');
      setInterval(function () {
        if (isPaused) return;
        var idx = Math.round(viewport.scrollLeft / cardWidth());
        scrollTo(idx >= total - 1 ? 0 : idx + 1);
      }, 6000);
    }

    // ── Grid ─────────────────────────────────────────────────────────────────
    function renderGrid(data) {
      var cfg = data.widget || {};
      var reviews = data.reviews;
      if (!reviews || reviews.length === 0) return;

      var color = accentColor;
      var maxItems = cfg.maxItems || cfg.maxReviewsShown || 6;
      var shown = reviews.slice(0, maxItems);

      var host = containerEl || document.createElement('div');
      host.setAttribute('data-flikker-grid', '1');
      host.style.cssText = 'display:block;box-sizing:border-box;width:100%';
      if (!containerEl && scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.insertBefore(host, scriptEl);
      } else if (!containerEl) {
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
        '.flk-g-wrap{box-sizing:border-box;width:100%;background:' + bgColor + ';padding:40px 0 32px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#1a202c}' +
        '.flk-g-inner{max-width:960px;margin:0 auto;padding:0 20px}' +
        '.flk-g-title{margin:0 0 20px;text-align:center;font:700 20px/1.2 inherit;letter-spacing:-.01em;color:' + titleColor + '}' +
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
        '.flk-g-brand{text-align:right;margin-top:16px;font:400 7px/1 inherit;color:#718096;letter-spacing:.06em;opacity:.4}' +
        '</style>' +
        '<div class="flk-g-wrap">' +
        '<div class="flk-g-inner">' +
        (widgetTitle ? '<p class="flk-g-title">' + esc(widgetTitle) + '</p>' : '') +
        '<div class="flk-g-grid">' +
        cardsHtml +
        '</div>' +
        '<p class="flk-g-brand">' + FLK_BRAND + '</p>' +
        '</div>' +
        '</div>';

      postEvent('impression');
    }

    // ── Fetch & dispatch ──────────────────────────────────────────────────────
    fetch(apiUrl, { credentials: 'omit', mode: 'cors' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data || !data.reviews || data.reviews.length === 0) return;
        data.reviews = data.reviews.filter(function (r) {
          return r.content && r.content.trim().length > 0;
        });
        if (!data.reviews.length) return;
        if (mode === 'toast') renderToast(data);
        else if (mode === 'carousel') renderCarousel(data);
        else if (mode === 'grid') renderGrid(data);
      })
      .catch(function () {});
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  var cs = document.currentScript;
  if (cs && cs.getAttribute('data-business')) {
    if (!cs.getAttribute('data-flikker-init')) {
      cs.setAttribute('data-flikker-init', '1');
      var prevEl = cs.previousElementSibling;
      var cEl = prevEl && prevEl.getAttribute('data-flikker-widget') !== null ? prevEl : null;
      initWidget(cs, cEl);
    }
  } else {
    // async: currentScript is null — find and init every uninitialised widget script on the page
    var allScripts = document.querySelectorAll('script[data-business]:not([data-flikker-init])');
    for (var i = 0; i < allScripts.length; i++) {
      var s = allScripts[i];
      s.setAttribute('data-flikker-init', '1');
      var prev = s.previousElementSibling;
      var c =
        prev && prev.getAttribute('data-flikker-widget') !== null ? prev : null;
      initWidget(s, c);
    }
  }
})();
