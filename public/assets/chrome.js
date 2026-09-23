// 좌상단 메뉴 버튼과 호버 사이드바. 랜딩은 마크업이 HTML에 있고, 본문 페이지는 app.js가 같은 마크업을 그린다.
(function () {
  function init() {
    const zone = document.getElementById("menuZone");
    if (!zone) return;
    const btn = document.getElementById("menuBtn");
    const sidebar = document.getElementById("sidebar");

    // 호버로 열리지만, 클릭하면 고정(핀)되어 커서를 빼도 닫히지 않는다.
    let pinned = false;

    const isOpen = () => pinned || zone.matches(":hover, :focus-within");
    const sync = () => {
      const open = isOpen();
      document.body.classList.toggle("menu-open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };

    zone.addEventListener("pointerenter", sync);
    zone.addEventListener("pointerleave", sync);
    zone.addEventListener("focusin", sync);
    zone.addEventListener("focusout", () => requestAnimationFrame(sync));

    btn.addEventListener("click", () => { pinned = !pinned; sync(); });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      pinned = false;
      btn.blur();
      if (sidebar.contains(document.activeElement)) btn.focus();
      sync();
    });

    sync();
  }

  // app.js가 DOMContentLoaded에서 메뉴를 그리므로, 아직 없으면 그 뒤에 붙는다.
  if (document.getElementById("menuZone")) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
