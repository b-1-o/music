/* mobile-nav.js — reliable open/close on phones & webviews */
(function () {
  function qs(s, r) { return (r || document).querySelector(s); }

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

  function toggleSidebar(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    var sidebar = qs(".sidebar");
    if (sidebar && sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  }

  function bind() {
    var btn = qs("#mobileMenuBtn");
    var overlay = qs("#overlay") || qs(".overlay");
    if (!btn) return;

    // Replace node to drop old listeners from app.js
    var clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    btn = clone;

    function onTap(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar(e);
    }

    btn.addEventListener("click", onTap, true);
    btn.addEventListener("touchend", onTap, { capture: true, passive: false });
    btn.addEventListener("pointerup", onTap, true);

    if (overlay) {
      overlay.addEventListener("click", function (e) {
        e.preventDefault();
        closeSidebar();
      }, true);
      overlay.addEventListener("touchend", function (e) {
        e.preventDefault();
        closeSidebar();
      }, { capture: true, passive: false });
    }

    // Close after navigating
    document.querySelectorAll(".sidebar .nav-item[data-view]").forEach(function (el) {
      el.addEventListener("click", function () {
        setTimeout(closeSidebar, 50);
      }, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(bind, 0);
    });
  } else {
    setTimeout(bind, 0);
  }
  // Re-bind after app.js init
  window.addEventListener("load", function () {
    setTimeout(bind, 100);
  });
})();
