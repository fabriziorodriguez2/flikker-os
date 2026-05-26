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

  // Star SVG path (24×24 viewBox, standard 5-pointed star)
  var STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
  // Big star for the toast badge — color driven by CSS var(--star)
  var STAR_BIG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"' +
    ' style="width:100%;height:100%;fill:var(--star,#FACC15);display:block" aria-hidden="true">' +
    '<path d="' + STAR_PATH + '"/></svg>';
  // Checkmark tick for card brand badge
  var TICK_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11"' +
    ' style="display:inline-block;vertical-align:-.15em;fill:none;stroke:var(--accent,#5C6BC0);stroke-width:3;stroke-linecap:round;stroke-linejoin:round" aria-hidden="true">' +
    '<path d="M20 6L9 17l-5-5"/></svg>';

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

  // Legacy text-star helper (used by carousel & grid)
  function starsHtml(count) {
    var out = '';
    for (var i = 0; i < 5; i += 1) {
      out += i < count ? '&#9733;' : '&#9734;';
    }
    return out;
  }

  // SVG star helper — color driven by CSS var(--star) when filled
  function svgStar(filled) {
    var fill = filled ? 'var(--star,#FACC15)' : '#d1d5db';
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13"' +
      ' style="display:inline-block;vertical-align:-.1em;fill:' + fill + '" aria-hidden="true">' +
      '<path d="' + STAR_PATH + '"/></svg>'
    );
  }

  function svgStarsHtml(count) {
    var out = '';
    for (var i = 0; i < 5; i += 1) out += svgStar(i < count);
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

    var mode       = attrSource.getAttribute('data-mode')       || 'toast';
    var accentColor = attrSource.getAttribute('data-color')     || '#5C6BC0';
    var starColor  = attrSource.getAttribute('data-star-color') || '#FACC15';
    var bgColor    = attrSource.getAttribute('data-bg')         || 'transparent';
    var widgetTitle = attrSource.getAttribute('data-title')     || 'Testimonios';
    var titleColor = bgColor !== 'transparent' ? '#ffffff' : '#1a202c';
    var position   = attrSource.getAttribute('data-position')   || 'bottom_right';

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
      fetch(eventsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: businessId,
          eventType: eventType,
          googleReviewId: reviewId || undefined,
          referrer: location.href,
        }),
        credentials: 'omit',
        keepalive: true,
      }).catch(function () {});
    }

    // ── Toast ────────────────────────────────────────────────────────────────
    function renderToast(data) {
      var cfg     = data.widget || {};
      var reviews = data.reviews;
      if (!reviews || reviews.length === 0) return;

      // Singleton: if a toast for this business is already in the DOM, skip re-init
      if (!containerEl && document.querySelector('[data-flk-tid="' + businessId + '"]')) return;

      var isLeft  = (cfg.position || position) === 'bottom_left';
      var index   = 0;
      var panelOpen = false;

      // Restore countdown state from sessionStorage so page navigation doesn't reset the cycle
      var SS_KEY = 'flk_' + businessId;
      var initDelay = 0;
      try {
        var ss = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
        if (ss && typeof ss.i === 'number' && typeof ss.t === 'number') {
          var rem = ss.t - Date.now();
          index = ((ss.i % reviews.length) + reviews.length) % reviews.length;
          if (rem > 0) initDelay = Math.min(rem, 92000);
        }
      } catch (e) {}

      // ── Host element (position:fixed in <html> to avoid containing-block traps)
      var host = containerEl || document.createElement('div');
      if (!containerEl) {
        host.style.cssText =
          'position:fixed!important;bottom:16px!important;' +
          (isLeft ? 'left:16px!important;right:auto!important;' : 'right:16px!important;left:auto!important;') +
          'z-index:2147483647!important;width:min(320px,calc(100vw - 32px))!important;' +
          'display:block!important;box-sizing:border-box!important;pointer-events:auto!important;';
        host.setAttribute('data-flk-tid', businessId);
        document.documentElement.appendChild(host);
      }
      host.setAttribute('data-flikker-mounted', 'true');

      // Responsive host sizing
      if (!containerEl) {
        var mq = window.matchMedia('(max-width:480px)');
        function applyMobile(e) {
          if (e.matches) {
            host.style.left   = isLeft ? '12px' : 'auto';
            host.style.right  = isLeft ? 'auto' : '12px';
            host.style.bottom = '12px';
            host.style.width  = 'min(300px,calc(100vw - 24px))';
          } else {
            host.style.left   = isLeft ? '16px' : 'auto';
            host.style.right  = isLeft ? 'auto' : '16px';
            host.style.bottom = '16px';
            host.style.width  = 'min(320px,calc(100vw - 32px))';
          }
        }
        applyMobile(mq);
        if (mq.addEventListener) mq.addEventListener('change', applyMobile);
        else if (mq.addListener) mq.addListener(applyMobile);
      }

      var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

      // ── Build panel review items HTML
      var panelItemsHtml = reviews.map(function (r) {
        var name = esc(r.authorDisplayName || 'Anónimo');
        var text = esc(r.content || '');
        return (
          '<div class="ri">' +
          '<div class="av" style="background:' + accentColor + '" aria-hidden="true">' + esc(initial(r.authorDisplayName)) + '</div>' +
          '<div class="rib">' +
          '<div class="ritop"><span class="riname">' + name + '</span><span class="ridate">' + daysAgo(r.reviewedAt) + '</span></div>' +
          '<div class="ristars">' + svgStarsHtml(r.rating || 5) + '</div>' +
          (text ? '<p class="ritext">“' + text + '”</p>' : '') +
          '</div>' +
          '</div>'
        );
      }).join('');

      // ── Shadow DOM: panel (above) + card (below) in a flex-column wrapper
      shadow.innerHTML =
        '<style>' +
        ':host{display:block;box-sizing:border-box}' +
        // Wrapper — CSS vars for theming, flex column so panel stacks above card
        '.fw{--star:' + starColor + ';--accent:' + accentColor + ';' +
        'display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;' +
        'font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#11183a}' +

        // ── Panel
        '.panel{box-sizing:border-box;width:100%;background:#fff;' +
        'border:1px solid rgba(0,0,0,.1);border-radius:18px;' +
        'box-shadow:0 12px 40px rgba(0,0,0,.18);' +
        'display:none;flex-direction:column;overflow:hidden;max-height:72vh;' +
        'opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease}' +
        '.panel.open{opacity:1;transform:translateY(0)}' +

        // Panel header
        '.phd{display:flex;align-items:center;justify-content:space-between;' +
        'padding:14px 16px 12px;border-bottom:1px solid #f0f1f5;flex-shrink:0}' +
        '.pttl{font:600 13px/1 inherit;color:#1a202c;letter-spacing:.01em}' +
        '.px{border:0;padding:0;background:none;cursor:pointer;color:#8891A4;' +
        'font:400 22px/1 Arial,sans-serif;display:flex;align-items:center;justify-content:center;' +
        'width:28px;height:28px;border-radius:50%;flex-shrink:0}' +
        '.px:hover{background:#f5f6fa;color:#1a202c}' +
        '.px:focus-visible{outline:2px solid var(--accent);outline-offset:1px}' +

        // Panel body (scrollable)
        '.pbody{overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch}' +

        // Review items inside panel
        '.ri{display:flex;align-items:flex-start;gap:10px;padding:13px 16px;border-bottom:1px solid #f5f6fa}' +
        '.ri:last-child{border-bottom:0}' +
        '.av{flex-shrink:0;width:34px;height:34px;border-radius:50%;color:#fff;' +
        'font:700 13px/34px Arial,sans-serif;text-align:center}' +
        '.rib{min-width:0;flex:1}' +
        '.ritop{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
        '.riname{font:600 13px/1.2 inherit;color:#1a202c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}' +
        '.ridate{font:400 11px/1 inherit;color:#a0aec0;white-space:nowrap;flex-shrink:0}' +
        '.ristars{margin-top:3px;display:flex;gap:1px;align-items:center}' +
        '.ritext{margin:5px 0 0;font:400 12.5px/1.55 inherit;color:#4a5568;word-break:break-word}' +

        // Panel brand footer
        '.pbrand{padding:9px 16px;font:400 9px/1 inherit;color:#a0aec0;letter-spacing:.04em;' +
        'text-align:center;flex-shrink:0;border-top:1px solid #f5f6fa}' +

        // ── Toast card
        '.card{box-sizing:border-box;position:relative;display:flex;align-items:center;gap:12px;' +
        'width:100%;border:1px solid rgba(0,0,0,.09);border-radius:18px;' +
        'background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.16);' +
        'padding:14px 44px 14px 16px;cursor:pointer;' +
        'transition:box-shadow .15s,transform .1s}' +
        '.card:hover{box-shadow:0 10px 36px rgba(0,0,0,.22);transform:translateY(-1px)}' +
        '.card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +

        // Big star badge
        '.si{flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center}' +

        // Card text
        '.ct{min-width:0;flex:1}' +
        '.nline{margin:0;font:600 13.5px/1.3 inherit;color:#1a202c}' +
        '.hi{color:var(--accent)}' +
        '.cstars{margin-top:5px;display:flex;gap:1px;align-items:center}' +
        '.cmeta{margin-top:5px;font:400 11.5px/1.2 inherit;color:#8891A4}' +

        // Card close button (X)
        '.x{position:absolute;top:8px;right:8px;display:flex;align-items:center;justify-content:center;' +
        'width:24px;height:24px;border:0;border-radius:50%;background:rgba(0,0,0,.06);' +
        'color:#6d7691;font:400 18px/1 Arial,sans-serif;cursor:pointer;padding:0;flex-shrink:0}' +
        '.x:hover{background:rgba(0,0,0,.13);color:#11183a}' +
        '.x:focus-visible{outline:2px solid var(--accent);outline-offset:1px}' +

        // Card brand footer
        '.cbrand{margin-top:5px;display:flex;align-items:center;gap:3px;font:400 10.5px/1 inherit;color:#a0aec0;letter-spacing:.01em}' +
        '</style>' +

        '<div class="fw" id="flkW">' +

        // Panel (above card, hidden initially)
        '<div class="panel" id="flkP" role="dialog" aria-modal="false"' +
        ' aria-label="Reseñas recientes" aria-hidden="true">' +
        '<div class="phd">' +
        '<span class="pttl">Reseñas recientes</span>' +
        '<button class="px" id="flkPX" aria-label="Cerrar panel">&times;</button>' +
        '</div>' +
        '<div class="pbody">' + panelItemsHtml + '</div>' +
        '<div class="pbrand">' + FLK_BRAND + '</div>' +
        '</div>' +

        // Toast card
        '<div class="card" id="flkC" role="button" tabindex="0"' +
        ' aria-expanded="false" aria-haspopup="dialog" aria-label="Ver reseñas">' +
        '<button class="x" id="flkX" aria-label="Cerrar">&times;</button>' +
        '<div class="si">' + STAR_BIG + '</div>' +
        '<div class="ct">' +
        '<p class="nline"><span class="hi" id="flkN"></span><span id="flkTxt"></span></p>' +
        '<div class="cstars" id="flkS"></div>' +
        '<div class="cmeta" id="flkM"></div>' +
        '<div class="cbrand">' + TICK_ICON + '<span>by Flikker</span></div>' +
        '</div>' +
        '</div>' +

        '</div>';

      var fw       = shadow.getElementById('flkW');
      var card     = shadow.getElementById('flkC');
      var panel    = shadow.getElementById('flkP');
      var closeX   = shadow.getElementById('flkX');   // close toast
      var panelX   = shadow.getElementById('flkPX');  // close panel
      var nameEl   = shadow.getElementById('flkN');
      var txtEl    = shadow.getElementById('flkTxt');
      var starsEl  = shadow.getElementById('flkS');
      var metaEl   = shadow.getElementById('flkM');

      var cycleGen = 0;
      var displayMs = Math.max(5000, Math.min(12000, (cfg.rotationSeconds || 8) * 1000));
      var pauseMs   = 80000;

      // Persist state so navigation between pages doesn't reset the countdown
      function saveState() {
        try {
          sessionStorage.setItem(SS_KEY, JSON.stringify({
            i: index % reviews.length,
            t: Date.now() + displayMs + 360 + pauseMs,
          }));
        } catch (e) {}
      }

      // ── Load current review into the compact card ────────────────────────
      function loadReview() {
        var r      = reviews[index % reviews.length];
        var rating = r.rating || 5;
        nameEl.textContent = r.authorDisplayName || 'Alguien';
        txtEl.textContent  = ' nos dejó ' + rating + (rating === 1 ? ' estrella' : ' estrellas');
        starsEl.innerHTML  = svgStarsHtml(rating);
        metaEl.textContent = daysAgo(r.reviewedAt);
        card.setAttribute('data-review-id', r.id || '');
      }

      // ── Panel open / close ───────────────────────────────────────────────
      function onDocClick(e) {
        // Close if the click landed outside the shadow host
        var path = e.composedPath ? e.composedPath() : [];
        if (path.indexOf(host) === -1) doClosePanel();
      }
      function onEscape(e) {
        if (e.key === 'Escape') doClosePanel();
      }

      function doOpenPanel() {
        panelOpen = true;
        cycleGen++; // stop rotation while panel is visible
        panel.style.display = 'flex';
        panel.setAttribute('aria-hidden', 'false');
        card.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { panel.classList.add('open'); });
        });
        document.addEventListener('click', onDocClick, true);
        document.addEventListener('keydown', onEscape);
        panelX.focus();
      }

      function doClosePanel() {
        panelOpen = false;
        panel.classList.remove('open');
        card.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onEscape);
        setTimeout(function () {
          panel.style.display = 'none';
          panel.setAttribute('aria-hidden', 'true');
          // Resume toast rotation after panel closes
          var g = cycleGen;
          cycle(g);
        }, 210);
      }

      // ── Toast rotation cycle ─────────────────────────────────────────────
      function cycle(g) {
        if (g !== cycleGen) return;
        loadReview();
        saveState();
        postEvent('impression', card.getAttribute('data-review-id'));
        fw.style.display   = 'flex';
        fw.style.opacity   = '0';
        fw.style.transform = 'translateY(10px)';
        fw.style.transition = 'opacity .25s ease,transform .25s ease';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (g !== cycleGen) return;
            fw.style.opacity   = '1';
            fw.style.transform = 'translateY(0)';
            setTimeout(function () {
              if (g !== cycleGen) return;
              fw.style.opacity   = '0';
              fw.style.transform = 'translateY(6px)';
              setTimeout(function () {
                if (g !== cycleGen) return;
                fw.style.display    = 'none';
                fw.style.transition = '';
                index = (index + 1) % reviews.length;
                setTimeout(function () { cycle(g); }, pauseMs);
              }, 260);
            }, displayMs);
          });
        });
      }

      // ── Event listeners ──────────────────────────────────────────────────

      // Close toast (X button)
      closeX.addEventListener('click', function (e) {
        e.stopPropagation();
        if (panelOpen) {
          doClosePanel();
          return;
        }
        postEvent('close', card.getAttribute('data-review-id'));
        cycleGen++;
        fw.style.transition = '';
        fw.style.display    = 'none';
        index = (index + 1) % reviews.length;
        var g = cycleGen;
        setTimeout(function () { cycle(g); }, pauseMs);
      });

      // Open panel on card click/keyboard
      card.addEventListener('click', function (e) {
        if (e.target === closeX || closeX.contains(e.target)) return;
        if (!panelOpen) {
          postEvent('click', card.getAttribute('data-review-id'));
          doOpenPanel();
        }
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!panelOpen) {
            postEvent('click', card.getAttribute('data-review-id'));
            doOpenPanel();
          }
        }
      });

      // Close panel button
      panelX.addEventListener('click', function (e) {
        e.stopPropagation();
        doClosePanel();
      });

      // Clicks inside the panel body don't bubble to the doc-click handler
      panel.addEventListener('click', function (e) { e.stopPropagation(); });

      fw.style.display = 'none';
      if (initDelay > 0) {
        var g0 = cycleGen;
        setTimeout(function () { cycle(g0); }, initDelay);
      } else {
        cycle(cycleGen);
      }
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
        '.flk-c-brand{text-align:center;margin-top:48px;font:400 8px/1 inherit;color:#718096;letter-spacing:.06em;opacity:.55;transform:scale(.85);transform-origin:center}' +
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
      var prevBtn  = shadow.getElementById('flkP');
      var nextBtn  = shadow.getElementById('flkN');
      var dotsEl   = shadow.getElementById('flkD');
      var total    = reviews.length;

      for (var d = 0; d < total; d += 1) {
        var dot = document.createElement('div');
        dot.className = 'flk-c-dot' + (d === 0 ? ' on' : '');
        dotsEl.appendChild(dot);
      }

      function cardWidth() { return viewport.offsetWidth || 300; }

      function scrollTo(idx) { viewport.scrollLeft = idx * cardWidth(); }

      function updateDots() {
        var idx  = Math.round(viewport.scrollLeft / cardWidth());
        var dots = shadow.querySelectorAll('.flk-c-dot');
        for (var i = 0; i < dots.length; i += 1) {
          dots[i].className = 'flk-c-dot' + (i === idx ? ' on' : '');
        }
      }

      prevBtn.addEventListener('click', function () {
        isPaused = true;
        scrollTo(Math.max(0, Math.round(viewport.scrollLeft / cardWidth()) - 1));
      });
      nextBtn.addEventListener('click', function () {
        isPaused = true;
        scrollTo(Math.min(total - 1, Math.round(viewport.scrollLeft / cardWidth()) + 1));
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
      var cfg     = data.widget || {};
      var reviews = data.reviews;
      if (!reviews || reviews.length === 0) return;

      var color    = accentColor;
      var maxItems = cfg.maxItems || cfg.maxReviewsShown || 6;
      var shown    = reviews.slice(0, maxItems);

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
            '<div class="flk-g-av" style="background:' + color + '">' + esc(initial(r.authorDisplayName)) + '</div>' +
            '<div class="flk-g-meta">' +
            '<p class="flk-g-name">' + esc(r.authorDisplayName || 'Anónimo') + '</p>' +
            '<div class="flk-g-stars">' + starsHtml(r.rating || 5) + '</div>' +
            '</div>' +
            '</div>' +
            (r.content ? '<p class="flk-g-text">' + esc(r.content) + '</p>' : '<p class="flk-g-empty">Sin comentario</p>') +
            '<p class="flk-g-date">' + daysAgo(r.reviewedAt) + '</p>' +
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
        '<div class="flk-g-grid">' + cardsHtml + '</div>' +
        '<p class="flk-g-brand">' + FLK_BRAND + '</p>' +
        '</div>' +
        '</div>';

      postEvent('impression');
    }

    // ── Fetch & dispatch ──────────────────────────────────────────────────────
    fetch(apiUrl, { credentials: 'omit', mode: 'cors' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.reviews || data.reviews.length === 0) return;
        // For the toast keep only reviews that have text (panel & compact need content)
        if (mode === 'toast') {
          data.reviews = data.reviews.filter(function (r) {
            return r.content && r.content.trim().length > 0;
          });
        }
        if (!data.reviews.length) return;
        if (mode === 'toast')    renderToast(data);
        else if (mode === 'carousel') renderCarousel(data);
        else if (mode === 'grid')     renderGrid(data);
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
    var allScripts = document.querySelectorAll('script[data-business]:not([data-flikker-init])');
    for (var i = 0; i < allScripts.length; i++) {
      var s = allScripts[i];
      s.setAttribute('data-flikker-init', '1');
      var prev = s.previousElementSibling;
      var c = prev && prev.getAttribute('data-flikker-widget') !== null ? prev : null;
      initWidget(s, c);
    }
  }
})();
