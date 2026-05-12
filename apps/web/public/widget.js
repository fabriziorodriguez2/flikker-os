(function () {
  'use strict';

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
  if (!businessId || mode !== 'toast') return;

  var storageKey = 'flikker_widget_closed_' + businessId;
  try {
    if (sessionStorage.getItem(storageKey) === '1') return;
  } catch {}

  var scriptOrigin =
    script && script.src ? new URL(script.src).origin : window.location.origin;
  var apiUrl = scriptOrigin + '/api/widget/' + encodeURIComponent(businessId);
  var eventsUrl = scriptOrigin + '/api/widget/events';
  var host = container || document.createElement('div');
  if (!container) document.body.appendChild(host);
  host.setAttribute('data-flikker-mounted', 'true');

  function postEvent(eventType, googleReviewId) {
    var payload = JSON.stringify({
      businessId: businessId,
      eventType: eventType,
      googleReviewId: googleReviewId || undefined,
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
    } catch {}
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
    if (days === 1) return 'hace 1 dia';
    if (days < 30) return 'hace ' + days + ' dias';
    var months = Math.max(1, Math.round(days / 30));
    if (months === 1) return 'hace 1 mes';
    if (months < 12) return 'hace ' + months + ' meses';
    var years = Math.max(1, Math.round(months / 12));
    if (years === 1) return 'hace 1 ano';
    return 'hace ' + years + ' anos';
  }

  function stars(count) {
    var out = '';
    for (var i = 0; i < 5; i += 1) {
      out += i < count ? String.fromCharCode(9733) : String.fromCharCode(9734);
    }
    return out;
  }

  function render(data) {
    if (!data || !data.reviews || data.reviews.length === 0) return;

    var cfg = data.widget || {};
    var reviews = data.reviews;
    var index = 0;
    var color = cfg.primaryColor || '#9188f5';
    var position =
      cfg.position === 'bottom_left'
        ? 'left:16px;right:auto;'
        : 'right:16px;left:auto;';
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    shadow.innerHTML =
      '<style>' +
      ':host{all:initial}.fw{position:fixed;bottom:16px;' +
      position +
      'z-index:2147483000;width:min(320px,calc(100vw - 32px));font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#11183a;animation:fi .24s cubic-bezier(.2,.8,.2,1)}.card{box-sizing:border-box;position:relative;display:grid;grid-template-columns:40px 1fr;gap:10px;width:100%;min-height:108px;border:1px solid rgba(93,104,135,.18);border-radius:18px;background:#e8eefb;box-shadow:0 18px 42px rgba(5,12,35,.22);padding:20px 42px 16px 18px;cursor:pointer}.badge{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:' +
      color +
      ';color:#fff;font:800 20px/1 Arial,sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.22)}.content{min-width:0}.name{margin:0;color:#10183d;font:800 13.5px/1.18 inherit;letter-spacing:.01em}.stars{margin-top:7px;color:#ff9f1c;font:700 13px/1 Arial,sans-serif;letter-spacing:1.2px;white-space:nowrap}.meta{margin-top:6px;color:#69718f;font:500 11.5px/1.2 inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.x{position:absolute;top:9px;right:9px;display:flex;align-items:center;justify-content:center;width:23px;height:23px;border:0;border-radius:999px;background:rgba(255,255,255,.62);color:#6d7691;font:400 17px/1 Arial,sans-serif;cursor:pointer}.x:hover{background:#fff;color:#11183a}@keyframes fi{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@media(max-width:480px){.fw{bottom:12px;left:12px!important;right:12px!important;width:auto}.card{border-radius:17px}}' +
      '</style><div class="fw"><div class="card" role="button" tabindex="0"><button class="x" aria-label="Cerrar">&times;</button><div class="badge">&#9733;</div><div class="content"><p class="name"></p><div class="stars"></div><div class="meta"></div></div></div></div>';

    var root = shadow.querySelector('.fw');
    var card = shadow.querySelector('.card');
    var close = shadow.querySelector('.x');
    var name = shadow.querySelector('.name');
    var starEl = shadow.querySelector('.stars');
    var meta = shadow.querySelector('.meta');

    function showReview() {
      var review = reviews[index % reviews.length];
      var rating = review.rating || 5;
      name.textContent =
        (review.authorDisplayName || 'Alguien') +
        ' nos dejo ' +
        rating +
        ' estrellas';
      starEl.textContent = stars(rating);
      meta.textContent =
        daysAgo(review.reviewedAt) +
        '  ' +
        String.fromCharCode(8226) +
        '  Powered by Flikker';
      card.setAttribute('data-review-id', review.id || '');
      index += 1;
    }

    close.addEventListener('click', function (event) {
      event.stopPropagation();
      try {
        sessionStorage.setItem(storageKey, '1');
      } catch {}
      postEvent('close', card.getAttribute('data-review-id'));
      root.remove();
    });
    card.addEventListener('click', function () {
      postEvent('click', card.getAttribute('data-review-id'));
    });
    card.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        postEvent('click', card.getAttribute('data-review-id'));
      }
    });

    showReview();
    postEvent('impression', card.getAttribute('data-review-id'));
    setInterval(
      showReview,
      Math.min(10, Math.max(8, cfg.rotationSeconds || 9)) * 1000,
    );
  }

  fetch(apiUrl, { credentials: 'omit', mode: 'cors' })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(render)
    .catch(function () {});
})();
