/* mobile-nav.js — single-tap open/close (no double-toggle) */
(function () {
  function qs(s, r) { return (r || document).querySelector(s); }

  var lastToggleAt = 0;

  function openSidebar() {
    var sidebar = qs(".sidebar");
    var overlay = qs("#overlay") || qs(".overlay");
    var btn = qs("#mobileMenuBtn");
    if (!sidebar) return;
    sidebar.classList.add("open");
    if (overlay) {
      overlay.classList.add("active");
      overlay.style.display = "block";
    }
    if (btn) btn.setAttribute("aria-expanded", "true");
    document.body.classList.add("sidebar-open");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    var sidebar = qs(".sidebar");
    var overlay = qs("#overlay") || qs(".overlay");
    var btn = qs("#mobileMenuBtn");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.style.display = "none";
    }
    if (btn) btn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("sidebar-open");
    document.body.style.overflow = "";
  }

  function toggleSidebar() {
    var now = Date.now();
    if (now - lastToggleAt < 400) return;
    lastToggleAt = now;
    var sidebar = qs(".sidebar");
    if (sidebar && sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  }

  function bind() {
    var btn = qs("#mobileMenuBtn");
    var overlay = qs("#overlay") || qs(".overlay");
    if (!btn || btn.dataset.mobileNavBound === "1") return;

    var clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    btn = clone;
    btn.dataset.mobileNavBound = "1";
    btn.type = "button";

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    }, true);

    if (overlay && overlay.dataset.mobileNavBound !== "1") {
      overlay.dataset.mobileNavBound = "1";
      overlay.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeSidebar();
      }, true);
    }

    document.querySelectorAll(".sidebar .nav-item[data-view]").forEach(function (el) {
      if (el.dataset.mobileNavBound === "1") return;
      el.dataset.mobileNavBound = "1";
      el.addEventListener("click", function () {
        setTimeout(closeSidebar, 30);
      }, true);
    });
  }

  function boot() {
    bind();
    setTimeout(bind, 50);
    setTimeout(bind, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("load", function () { setTimeout(bind, 50); });
})();
