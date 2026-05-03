(function () {
  'use strict';

  var script = document.currentScript;
  var container =
    (script && script.previousElementSibling && script.previousElementSibling.getAttribute('data-flikker-widget') !== null
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

  var scriptOrigin = script && script.src ? new URL(script.src).origin : window.location.origin;
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
      referrer: location.href
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(eventsUrl, new Blob([payload], { type: 'application/json' }));
        return;
      }
    } catch {}
    fetch(eventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(function () {});
  }

  function daysAgo(value) {
    var posted = new Date(value).getTime();
    if (!posted) return '';
    var days = Math.max(0, Math.round((Date.now() - posted) / 86400000));
    if (days === 0) return 'hoy';
    if (days === 1) return 'hace 1 dia';
    return 'hace ' + days + ' dias';
  }

  function stars(count) {
    var out = '';
    for (var i = 0; i < 5; i += 1) out += i < count ? '★' : '☆';
    return out;
  }

  function trim(text) {
    text = (text || '').replace(/\s+/g, ' ').trim();
    return text.length > 140 ? text.slice(0, 137) + '...' : text;
  }

  function render(data) {
    if (!data || !data.reviews || data.reviews.length === 0) return;

    var cfg = data.widget || {};
    var reviews = data.reviews;
    var index = 0;
    var color = cfg.primaryColor || '#5B5BD6';
    var position = cfg.position === 'bottom_left' ? 'left:18px;right:auto;' : 'right:18px;left:auto;';
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    shadow.innerHTML =
      '<style>' +
      ':host{all:initial}.fw{position:fixed;bottom:18px;' + position + 'z-index:2147483000;width:min(360px,calc(100vw - 36px));font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#15162f;animation:fi .24s ease-out}.card{box-sizing:border-box;width:100%;border:1px solid rgba(28,31,64,.12);border-radius:18px;background:#fff;box-shadow:0 18px 45px rgba(9,16,43,.18);padding:15px 42px 15px 15px;cursor:pointer}.top{display:flex;gap:8px;align-items:center}.badge{width:10px;height:10px;border-radius:50%;background:' + color + ';box-shadow:0 0 0 5px rgba(91,91,214,.11)}.name{font:700 14px/1.25 inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stars{margin-top:8px;color:#f5a524;font-size:13px;letter-spacing:1px}.txt{margin:9px 0 0;font:500 14px/1.45 inherit;color:#2d304f}.meta{margin-top:9px;font:600 11px/1 inherit;color:#767a91;text-transform:uppercase;letter-spacing:.08em}.x{position:absolute;top:8px;right:8px;width:30px;height:30px;border:0;border-radius:999px;background:#f3f4f8;color:#62667c;font:700 18px/30px Arial,sans-serif;cursor:pointer}@keyframes fi{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@media(max-width:480px){.fw{bottom:12px;left:12px!important;right:12px!important;width:auto}.card{border-radius:16px}}' +
      '</style><div class="fw"><div class="card" role="button" tabindex="0"><button class="x" aria-label="Cerrar">×</button><div class="top"><span class="badge"></span><span class="name"></span></div><div class="stars"></div><p class="txt"></p><div class="meta"></div></div></div>';

    var root = shadow.querySelector('.fw');
    var card = shadow.querySelector('.card');
    var close = shadow.querySelector('.x');
    var name = shadow.querySelector('.name');
    var starEl = shadow.querySelector('.stars');
    var text = shadow.querySelector('.txt');
    var meta = shadow.querySelector('.meta');

    function showReview() {
      var review = reviews[index % reviews.length];
      name.textContent = review.authorDisplayName || 'Cliente verificado';
      starEl.textContent = stars(review.rating || 5);
      text.textContent = trim(review.content || 'Excelente experiencia.');
      meta.textContent = (data.summary && data.summary.businessName ? data.summary.businessName + ' · ' : '') + daysAgo(review.reviewedAt);
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
      if (event.key === 'Enter' || event.key === ' ') postEvent('click', card.getAttribute('data-review-id'));
    });

    showReview();
    postEvent('impression', card.getAttribute('data-review-id'));
    setInterval(showReview, Math.max(10, cfg.rotationSeconds || 30) * 1000);
  }

  fetch(apiUrl, { credentials: 'omit', mode: 'cors' })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(render)
    .catch(function () {});
})();
