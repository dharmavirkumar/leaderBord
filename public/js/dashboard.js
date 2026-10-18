
(() => {
  "use strict";

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const numberFormat = new Intl.NumberFormat("en-IN");

  /**
   * Safely animate numeric counters.
   * Expected HTML: <span class="count-up" data-count="1200">0</span>
   */
  function animateCount(element) {
    if (!(element instanceof HTMLElement)) return;

    const rawTarget = element.dataset.count;

    if (rawTarget === undefined || rawTarget.trim() === "") {
      return;
    }

    const target = Number(rawTarget);

    if (!Number.isFinite(target)) {
      return;
    }

    const decimals = Number.isInteger(target) ? 0 : 2;

    const render = (value) => {
      element.textContent = numberFormat.format(value);
    };

    if (reducedMotion || target === 0) {
      render(target);
      return;
    }

    const duration = 850;
    const startedAt = performance.now();

    function tick(now) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 4);
      const currentValue = target * easedProgress;

      render(
        decimals === 0
          ? Math.round(currentValue)
          : Number(currentValue.toFixed(decimals))
      );

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        render(target);
      }
    }

    requestAnimationFrame(tick);
  }

  document.querySelectorAll(".count-up").forEach(animateCount);

  /**
   * Assign a stable stagger index for CSS animations.
   */
  document.querySelectorAll(".ranking-row").forEach((row, index) => {
    row.style.setProperty(
      "--row-index",
      String(Math.min(index, 12))
    );
  });

  /**
   * Prevent repeated submissions.
   *
   * Note: this intentionally keeps the button disabled after submit.
   * If client-side validation or AJAX can cancel submission, restore
   * the button in that flow's error handler.
   */
  document.querySelectorAll(
    "form[data-disable-on-submit]"
  ).forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (form.dataset.submitting === "true") {
        event.preventDefault();
        return;
      }

      if (!form.checkValidity()) {
        return;
      }

      const submitButtons = form.querySelectorAll(
        'button[type="submit"], input[type="submit"]'
      );

      if (!submitButtons.length) return;

      form.dataset.submitting = "true";

      submitButtons.forEach((button) => {
        if (button.disabled) return;

        if (button instanceof HTMLInputElement) {
          button.dataset.originalValue = button.value;
          button.value = "Working…";
        } else {
          button.dataset.originalText = button.textContent;
          button.textContent = "Working…";
        }

        button.disabled = true;
        button.setAttribute("aria-busy", "true");
      });
    });
  });
})();
