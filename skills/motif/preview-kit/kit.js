// Motif preview kit: live reload while previewing, and motion from the design guide's springs.
(function () {
  "use strict";
  var css = getComputedStyle(document.documentElement);
  function num(name, fallback) {
    var v = parseFloat(css.getPropertyValue(name));
    return isFinite(v) ? v : fallback;
  }
  function spring(name) {
    return { type: "spring", visualDuration: num("--motif-spring-" + name + "-duration", 0.4), bounce: num("--motif-spring-" + name + "-bounce", 0.1) };
  }

  // Reload when a mockup changes (only when served by `motif preview`).
  if (location.protocol.indexOf("http") === 0 && "EventSource" in window) {
    try {
      new EventSource("/__motif/events").addEventListener("reload", function () { location.reload(); });
    } catch (e) { /* no live reload */ }
  }

  var M = window.Motion;
  if (!M || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function start() {
    var entering = document.querySelectorAll("[data-enter]");
    for (var i = 0; i < entering.length; i++) {
      var el = entering[i];
      var kind = el.getAttribute("data-enter") || "rise";
      var from = kind === "fade" ? { opacity: [0, 1] }
        : kind === "scale" ? { opacity: [0, 1], scale: [0.96, 1] }
        : { opacity: [0, 1], y: [12, 0] };
      var options = spring("smooth");
      options.delay = i * 0.04;
      M.animate(el, from, options);
    }
    var pressable = document.querySelectorAll(".mk-btn, .mk-row, .mk-tab, .mk-nav-item, [data-press]");
    for (var j = 0; j < pressable.length; j++) {
      M.press(pressable[j], function (target) {
        M.animate(target, { scale: 0.97 }, spring("snappy"));
        return function () { M.animate(target, { scale: 1 }, spring("snappy")); };
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
