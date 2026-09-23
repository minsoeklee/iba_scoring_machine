// 미니게임 바탕화면. 아이콘은 한 번 누르면 선택, 두 번 누르면 그 게임 페이지를 창(iframe)에 담아 연다. 끌면 옮겨진다.
// 창은 제목 줄을 끌어 옮기고, 누른 창이 맨 앞으로 오며, 빨간 버튼으로 닫는다(닫으면 게임도 멈춘다).
(function () {
  const DRAG_START = 4;   // 이만큼(px) 움직여야 끌기로 본다. 그보다 적으면 클릭
  const GAP = 16;         // 창이 화면 가장자리와 띄우는 최소 여백

  let desktop, layer;
  let top = 10;           // 창 겹침 순서. 앞으로 올 때마다 하나씩 올린다
  let cascade = 0;        // 새 창을 조금씩 비켜 여는 계단
  const open = new Map(); // game → 창 요소

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

  // 포인터로 요소를 끄는 공통 동작. 움직임이 DRAG_START를 넘으면 onMove를 부르고,
  // 끝나면 onEnd(끌었는지)를 부른다. 끄는 동안에는 iframe이 포인터를 가로채지 않게 막는다.
  // 단추(창 닫기) 위에서 누른 것은 끌기로 잡지 않는다. 잡으면 click이 단추에 닿지 않는다.
  function draggable(handle, { onStart, onMove, onEnd }) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target !== handle && e.target.closest("button"))) return;
      const sx = e.clientX, sy = e.clientY;
      let dragging = false;
      onStart && onStart(e);
      handle.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!dragging && Math.hypot(dx, dy) < DRAG_START) return;
        if (!dragging) { dragging = true; document.body.classList.add("desk-dragging"); }
        onMove(dx, dy);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        document.body.classList.remove("desk-dragging");
        onEnd && onEnd(dragging);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  // --- 아이콘 ------------------------------------------------------------------

  function select(icon) {
    desktop.querySelectorAll(".desk-icon.selected").forEach((el) => el.classList.remove("selected"));
    if (icon) icon.classList.add("selected");
  }

  function setupIcon(icon) {
    let ox = 0, oy = 0, moved = false;
    draggable(icon, {
      onStart: () => {
        // 처음 끌 때 %로 놓인 자리를 px로 바꿔 둔다
        ox = icon.offsetLeft; oy = icon.offsetTop;
        select(icon);
      },
      onMove: (dx, dy) => {
        icon.style.left = clamp(ox + dx, 0, desktop.clientWidth - icon.offsetWidth) + "px";
        icon.style.top = clamp(oy + dy, 0, desktop.clientHeight - icon.offsetHeight) + "px";
      },
      onEnd: (dragged) => { moved = dragged; },
    });
    const launch = () => openGame(icon.dataset.game, icon.dataset.title, Number(icon.dataset.w) || 640);
    // 한 번 누르면 선택만 하고, 두 번 누르면 연다(macOS 바탕화면과 같게). 끌고 난 뒤의 click은 무시한다.
    // 키보드 Enter·Space로 누른 click은 detail이 0이라, 그때는 바로 연다.
    icon.addEventListener("click", (e) => {
      if (moved) { moved = false; return; }
      select(icon);
      if (e.detail === 0) launch();
    });
    icon.addEventListener("dblclick", launch);
  }

  // --- 창 ----------------------------------------------------------------------

  function front(win) {
    if (win.style.zIndex == top) return;
    win.style.zIndex = ++top;
    layer.querySelectorAll(".win").forEach((w) => w.classList.toggle("inactive", w !== win));
  }

  function close(game) {
    const win = open.get(game);
    if (!win) return;
    win.remove();   // iframe이 사라지면서 게임도 멈춘다
    open.delete(game);
    const rest = [...layer.querySelectorAll(".win")].sort((a, b) => b.style.zIndex - a.style.zIndex);
    if (rest[0]) { rest[0].classList.remove("inactive"); rest[0].querySelector("iframe").focus(); }
  }

  function openGame(game, title, width) {
    if (open.has(game)) { const w = open.get(game); front(w); w.querySelector("iframe").focus(); return; }

    const win = document.createElement("div");
    win.className = "win";
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", title);
    win.innerHTML = `
      <div class="win-bar">
        <span class="win-lights">
          <button class="win-close" type="button" aria-label="${title} 창 닫기"></button>
          <i aria-hidden="true"></i><i aria-hidden="true"></i>
        </span>
        <span class="win-title">${title}</span>
      </div>
      <iframe src="/games/${game}.html?embed=1" title="${title}"></iframe>`;

    const w = Math.min(width, innerWidth - GAP * 2);
    win.style.width = w + "px";
    win.style.left = clamp((innerWidth - w) / 2 + cascade * 28, GAP, innerWidth - w - GAP) + "px";
    win.style.top = (72 + cascade * 28) + "px";
    cascade = (cascade + 1) % 5;
    layer.append(win);
    open.set(game, win);
    front(win);

    // 창 높이는 처음 열 때 한 번만 게임 페이지 내용에 맞춘다(화면을 넘으면 창 안에서 스크롤).
    // 그 뒤로는 옮기거나 순위표가 바뀌어도 크기를 고정해 둔다.
    const frame = win.querySelector("iframe");
    const fit = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const bar = win.querySelector(".win-bar").offsetHeight;
      const room = innerHeight - win.offsetTop - GAP - bar;
      frame.style.height = Math.min(doc.documentElement.scrollHeight, room) + "px";
    };
    frame.addEventListener("load", () => {
      fit();
      frame.focus();   // 창을 열자마자 키보드가 게임으로 가도록
    }, { once: true });

    win.querySelector(".win-close").addEventListener("click", () => close(game));
    win.addEventListener("pointerdown", () => front(win));

    let ox = 0, oy = 0;
    draggable(win.querySelector(".win-bar"), {
      onStart: () => { ox = win.offsetLeft; oy = win.offsetTop; },
      onMove: (dx, dy) => {
        win.style.left = clamp(ox + dx, GAP - win.offsetWidth + 80, innerWidth - 80) + "px";
        win.style.top = clamp(oy + dy, 0, innerHeight - 40) + "px";
      },
    });
  }

  function init() {
    desktop = document.getElementById("desktop");
    if (!desktop) return;
    layer = document.createElement("div");
    layer.className = "win-layer";
    document.body.append(layer);

    desktop.querySelectorAll(".desk-icon").forEach(setupIcon);
    // 빈 바탕화면을 누르면 선택을 푼다
    desktop.addEventListener("pointerdown", (e) => { if (e.target === desktop) select(null); });

    // iframe 안을 누르면 부모 문서에는 pointerdown이 오지 않는다. 대신 부모 창이 포커스를 잃으므로
    // 그때 포커스가 간 iframe의 창을 앞으로 올린다.
    window.addEventListener("blur", () => {
      requestAnimationFrame(() => {
        const el = document.activeElement;
        if (el && el.tagName === "IFRAME") front(el.closest(".win"));
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
