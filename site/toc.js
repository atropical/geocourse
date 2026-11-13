// SPDX-License-Identifier: Apache-2.0
// Contents menu on spec pages: highlights the section in view; a toggle on narrow screens.
(() => {
  // Heading anchors: clicking copies the link and updates the address.
  for (const a of document.querySelectorAll("a.anchor")) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      history.replaceState(null, "", a.hash);
      a.closest("h1,h2,h3,h4,h5,h6")?.scrollIntoView();
      navigator.clipboard?.writeText(location.href).then(() => {
        a.classList.add("copied");
        setTimeout(() => a.classList.remove("copied"), 1200);
      }, () => {});
    });
  }
})();
(() => {
  const nav = document.querySelector(".toc");
  if (!nav) return;
  const button = nav.querySelector(".toc-toggle");
  const narrow = matchMedia("(max-width: 62rem)");
  const setOpen = (open) => {
    button.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  };
  button.hidden = false;
  button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a") && narrow.matches) setOpen(false); });
  nav.addEventListener("keydown", (e) => { if (e.key === "Escape" && narrow.matches) { setOpen(false); button.focus(); } });

  const links = new Map([...nav.querySelectorAll("a")].map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  const headings = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  let current;
  const update = () => {
    let active = headings[0];
    for (const h of headings) if (h.getBoundingClientRect().top < 120) active = h;
    const a = active && links.get(active.id);
    if (a === current) return;
    current?.removeAttribute("aria-current");
    a?.setAttribute("aria-current", "location");
    current = a;
    if (a && !narrow.matches) a.scrollIntoView({ block: "nearest" });
  };
  addEventListener("scroll", update, { passive: true });
  update();
})();
