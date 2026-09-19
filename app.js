/* loads last-good player and patches mobile sidebar */
(async function () {
  const PARENT = "34aa0e328a1681b0d3f17c31b76abdd6f4a5d3be";
  const urls = [
    "https://cdn.jsdelivr.net/gh/b-1-o/music@" + PARENT + "/app.js",
    "https://raw.githubusercontent.com/b-1-o/music/" + PARENT + "/app.js"
  ];
  let src = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) { src = await res.text(); break; }
    } catch (e) {}
  }
  if (!src) {
    document.body.insertAdjacentHTML("beforeend", "<pre style='color:#fff;padding:24px;font:14px monospace'>Player unavailable. Hard-refresh shortly.</pre>");
    return;
  }

  src = src.replace(
    /function openMobileSidebar\(\) \{[\s\S]*?function toggleMobileSidebar\(\) \{[\s\S]*?\n\}/,
    [
      "function openMobileSidebar() {",
      "  const sidebar = $(\".sidebar\");",
      "  const overlay = $(\"#overlay\") || $(\".overlay\");",
      "  const button = $(\"#mobileMenuBtn\");",
      "  if (!sidebar) return;",
      "  sidebar.classList.add(\"open\");",
      "  if (overlay) {",
      "    overlay.classList.add(\"active\");",
      "    overlay.style.display = \"block\";",
      "  }",
      "  button?.setAttribute(\"aria-expanded\", \"true\");",
      "  document.body.classList.add(\"sidebar-open\");",
      "  document.body.style.overflow = \"hidden\";",
      "}",
      "",
      "function closeMobileSidebar() {",
      "  const sidebar = $(\".sidebar\");",
      "  const overlay = $(\"#overlay\") || $(\".overlay\");",
      "  const button = $(\"#mobileMenuBtn\");",
      "  sidebar?.classList.remove(\"open\");",
      "  if (overlay) {",
      "    overlay.classList.remove(\"active\");",
      "    overlay.style.display = \"none\";",
      "  }",
      "  button?.setAttribute(\"aria-expanded\", \"false\");",
      "  document.body.classList.remove(\"sidebar-open\");",
      "  document.body.style.overflow = \"\";",
      "}",
      "",
      "function toggleMobileSidebar() {",
      "  if ($(\".sidebar\")?.classList.contains(\"open\")) closeMobileSidebar();",
      "  else openMobileSidebar();",
      "}"
    ].join("\n")
  );

  src = src.replace(
    '$("#mobileMenuBtn").addEventListener("click", () => toggleMobileSidebar());\n  $(".overlay").addEventListener("click", () => closeMobileSidebar());',
    [
      '$("#mobileMenuBtn")?.addEventListener("click", (e) => {',
      "    e.preventDefault();",
      "    e.stopPropagation();",
      "    toggleMobileSidebar();",
      "  });",
      '  const mobileOverlay = $("#overlay") || $(".overlay");',
      '  mobileOverlay?.addEventListener("click", () => closeMobileSidebar());',
      '  mobileOverlay?.addEventListener("touchend", (e) => {',
      "    e.preventDefault();",
      "    closeMobileSidebar();",
      "  }, { passive: false });"
    ].join("\n")
  );

  const s = document.createElement("script");
  s.textContent = src;
  document.documentElement.appendChild(s);
})();
