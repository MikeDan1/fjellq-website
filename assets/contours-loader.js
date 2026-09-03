(function () {
  var SET_COUNT = 20;
  var container = document.querySelector('.contours-bg');
  if (!container) return;

  var setId = String(Math.floor(Math.random() * SET_COUNT) + 1).padStart(2, '0');
  var currentFormat = null;

  function formatFor(width) {
    if (width < 640) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  function load(format) {
    if (format === currentFormat) return;
    currentFormat = format;
    fetch('assets/contours/set-' + setId + '-' + format + '.svg')
      .then(function (res) { return res.ok ? res.text() : Promise.reject(res.status); })
      .then(function (svgText) {
        if (currentFormat !== format) return; // inzwischen überholt
        container.innerHTML = svgText;
        var svgEl = container.querySelector('svg');
        if (svgEl) {
          svgEl.style.opacity = '0';
          requestAnimationFrame(function () {
            svgEl.style.transition = 'opacity 0.8s ease';
            svgEl.style.opacity = '1';
          });
        }
      })
      .catch(function () { /* dekorativer Hintergrund, kein harter Fehlerfall */ });
  }

  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      load(formatFor(window.innerWidth));
    }, 200);
  }

  load(formatFor(window.innerWidth));
  window.addEventListener('resize', onResize);
})();
