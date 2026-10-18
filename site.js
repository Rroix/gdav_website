(function () {
  "use strict";

  var header = document.querySelector("[data-site-header]");
  var menuButton = header && header.querySelector(".site-menu");
  var navigation = header && header.querySelector(".site-nav");

  function closeMenu() {
    if (!header || !menuButton) return;
    header.classList.remove("menu-open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  if (header && menuButton && navigation) {
    menuButton.addEventListener("click", function () {
      var open = !header.classList.contains("menu-open");
      header.classList.toggle("menu-open", open);
      menuButton.setAttribute("aria-expanded", String(open));
    });

    navigation.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu();
    });

    document.addEventListener("click", function (event) {
      if (header.classList.contains("menu-open") && !header.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && header.classList.contains("menu-open")) {
        closeMenu();
        menuButton.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1120) closeMenu();
    }, { passive: true });
  }

  document.querySelectorAll("[data-current-year]").forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });

  var carousel = document.querySelector("[data-art-carousel]");
  if (!carousel) return;

  var slides = Array.from(carousel.querySelectorAll("[data-carousel-slide]"));
  var dots = Array.from(carousel.querySelectorAll("[data-carousel-dot]"));
  var activeIndex = 0;
  var rotationTimer = null;
  var rotationDelay = 6500;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function clearRotation() {
    if (rotationTimer === null) return;
    window.clearTimeout(rotationTimer);
    rotationTimer = null;
  }

  function scheduleRotation() {
    clearRotation();
    if (reducedMotion.matches || document.hidden || slides.length < 2) return;
    rotationTimer = window.setTimeout(function () {
      showSlide(activeIndex + 1, false);
      scheduleRotation();
    }, rotationDelay);
  }

  function showSlide(nextIndex, moveFocus) {
    if (!slides.length) return;
    activeIndex = (nextIndex + slides.length) % slides.length;
    slides.forEach(function (slide, index) {
      var active = index === activeIndex;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });
    dots.forEach(function (dot, index) {
      var active = index === activeIndex;
      dot.classList.toggle("is-active", active);
      dot.tabIndex = active ? 0 : -1;
      if (active) {
        dot.setAttribute("aria-current", "true");
        if (moveFocus) dot.focus();
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  dots.forEach(function (dot, index) {
    dot.addEventListener("click", function () {
      showSlide(Number(dot.dataset.carouselDot || 0), false);
      scheduleRotation();
    });
    dot.addEventListener("keydown", function (event) {
      var nextIndex = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = index - 1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = index + 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = dots.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      showSlide(nextIndex, true);
      scheduleRotation();
    });
  });

  carousel.addEventListener("mouseenter", clearRotation);
  carousel.addEventListener("mouseleave", scheduleRotation);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) clearRotation();
    else scheduleRotation();
  });
  window.addEventListener("pagehide", clearRotation);
  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", scheduleRotation);
  } else if (typeof reducedMotion.addListener === "function") {
    reducedMotion.addListener(scheduleRotation);
  }

  showSlide(0, false);
  scheduleRotation();
}());
