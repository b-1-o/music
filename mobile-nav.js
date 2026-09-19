/* mobile-nav.js — drawer + bottom tabs (Home / Search / Library / Menu) */
(function () {
  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }

  var lastToggleAt = 0;
  var tabsBound = false;

  function openSidebar() {
    var sidebar = qs(".sidebar");
    var overlay = qs("#overlay") || qs(".overlay");
    if (!sidebar) return;
    sidebar.classList.add("open");
    if (overlay) {
      overlay.classList.add("active");
      overlay.style.display = "block";
    }
    document.body.classList.add("sidebar-open");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    var sidebar = qs(".sidebar");
    var overlay = qs("#overlay") || qs(".overlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.style.display = "none";
    }
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

  function syncTabs(view) {
    qsa(".mobile-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.view === view);
    });
  }

  function goView(view) {
    closeSidebar();
    var nav = qs('.sidebar .nav-item[data-view="' + view + '"]');
    if (nav) {
      nav.click();
      syncTabs(view);
      return;
    }
    qsa(".view").forEach(function (v) { v.classList.remove("active"); });
    var map = { home: "homeView", search: "searchView", library: "libraryView", playlist: "playlistView" };
    var el = document.getElementById(map[view] || "homeView");
    if (el) el.classList.add("active");
    qsa(".nav-item[data-view]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === view);
    });
    syncTabs(view);
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  function bindTabs() {
    var bar = qs("#mobileTabBar");
    if (!bar) {
      bar = document.createElement("nav");
      bar.id = "mobileTabBar";
      bar.className = "mobile-tab-bar";
      bar.innerHTML =
        '<button type="button" class="mobile-tab active" data-view="home"><span>⌂</span><b>Home</b></button>' +
        '<button type="button" class="mobile-tab" data-view="search"><span>⌕</span><b>Search</b></button>' +
        '<button type="button" class="mobile-tab" data-view="library"><span>▣</span><b>Library</b></button>' +
        '<button type="button" class="mobile-tab" data-view="menu"><span>☰</span><b>Menu</b></button>';
      document.body.appendChild(bar);
    }
    if (tabsBound) return;
    tabsBound = true;
    bar.addEventListener("click", function (e) {
      var tab = e.target.closest(".mobile-tab");
      if (!tab) return;
      e.preventDefault();
      e.stopPropagation();
      if (tab.dataset.view === "menu") {
        toggleSidebar();
        return;
      }
      goView(tab.dataset.view);
    }, true);
  }

  function bindProfileSettings() {
    var profile = qs("#profileChip");
    var dialog = qs("#settingsDialog");
    if (!profile || !dialog || profile.dataset.mobileProfileBound === "1") return;
    profile.dataset.mobileProfileBound = "1";
    profile.addEventListener("click", function (e) {
      if (window.innerWidth > 850) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!dialog.open) {
        try { dialog.showModal(); } catch (err) { dialog.setAttribute("open", ""); }
      }
    }, true);
  }

  function bindDrawer() {
    var overlay = qs("#overlay") || qs(".overlay");
    var sidebar = qs(".sidebar");

    if (overlay && overlay.dataset.mobileNavBound !== "1") {
      overlay.dataset.mobileNavBound = "1";
      overlay.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeSidebar();
      }, true);
    }

    if (sidebar && sidebar.dataset.mobileNavDelegated !== "1") {
      sidebar.dataset.mobileNavDelegated = "1";
      sidebar.addEventListener("click", function (e) {
        var nav = e.target.closest(".nav-item[data-view]");
        var pl = e.target.closest(".sidebar-playlist");
        if (nav) {
          setTimeout(function () {
            closeSidebar();
            syncTabs(nav.dataset.view);
          }, 20);
        } else if (pl) {
          setTimeout(closeSidebar, 20);
        }
      }, false);
    }
  }

  function boot() {
    bindTabs();
    bindDrawer();
    bindProfileSettings();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("load", function () { setTimeout(boot, 50); });
})();
