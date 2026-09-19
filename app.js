/* reassembled fixed app.js with mobile sidebar fixes */
(async function () {
  const n = 5;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const res = await fetch("./app.part" + i + ".js?v=2", { cache: "no-store" });
    if (!res.ok) throw new Error("part " + i + " " + res.status);
    parts.push(await res.text());
  }
  const src = parts.join("");
  const s = document.createElement("script");
  s.textContent = src;
  document.body.appendChild(s);
})().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML("beforeend", "<pre style=\"color:#f66;padding:16px\">Failed to load player: " + err + "</pre>");
});
