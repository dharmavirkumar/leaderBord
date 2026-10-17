
(() => {
  "use strict";

  const reducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const format = new Intl.NumberFormat("en-IN");

  // Animate dashboard statistics
  function animateCount(element) {
    const target = Number(element.dataset.count);

    if (!Number.isFinite(target)) return;

    if (reducedMotion || target === 0) {
      element.textContent = format.format(target);
      return;
    }

    const duration = 850;
    const started = performance.now();

    function tick(now) {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);

      element.textContent = format.format(
        Math.round(target * eased)
      );

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  document.querySelectorAll(".count-up").forEach(animateCount);

  // Set leaderboard row animation order
  document.querySelectorAll(".ranking-row").forEach((row, index) => {
    row.style.setProperty("--row-index", String(Math.min(index, 12)));
  });

  // Prevent accidental double submission
  document.querySelectorAll("form[data-disable-on-submit]").forEach((form) => {
    form.addEventListener(
      "submit",
      () => {
        const button = form.querySelector('button[type="submit"]');

        if (!button || button.disabled) return;

        button.disabled = true;
        button.dataset.originalText = button.textContent.trim();
        button.textContent = "Working…";
      },
      { once: true }
    );
  });
})();
