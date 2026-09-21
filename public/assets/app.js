// 공통 도우미: 셸(사이드바·상단바) 렌더링, 아이콘, 숫자 포맷, API 호출.
(function () {
  const PAGES = [
    ["/", "홈", "house"],
    ["/submit.html", "모델 제출", "upload"],
    ["/leaderboard.html", "리더보드", "chart-column"],
    ["/minigame.html", "미니게임", "gamepad-2"],
  ];

  function icon(name) {
    const d = (window.ICON_PATHS || {})[name] || "";
    return `<svg class="icon" viewBox="0 0 14 14" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // 페이지 마크업의 <i data-icon="이름"></i>를 SVG로 바꾼다.
  function hydrateIcons(root) {
    root.querySelectorAll("i[data-icon]").forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  }

  function renderShell() {
    const here = location.pathname.replace(/index\.html$/, "");
    const current = PAGES.find(([href]) => href === here) || PAGES[0];
    const nav = PAGES.map(([href, label, ic]) => {
      const cur = href === current[0] ? ' aria-current="page"' : "";
      return `<a href="${href}"${cur}>${icon(ic)}<span>${label}</span></a>`;
    }).join("");

    const saved = recallTeam();
    const me = saved.team
      ? `<div class="name">${esc(saved.team)}</div><div class="sub">${esc(saved.nickname || "닉네임 없음")}</div>`
      : `<div class="name">팀 미등록</div><div class="sub">첫 제출 때 저장됩니다</div>`;

    const shell = document.createElement("div");
    shell.className = "shell";
    shell.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-top">
          <a class="wordmark" href="/">PNUiBA</a>
          <nav class="nav" aria-label="페이지">${nav}</nav>
        </div>
        <div class="sidebar-bottom">
          <a class="me" href="/submit.html"><span class="avatar">${icon("user")}</span><span>${me}</span></a>
        </div>
      </aside>
      <div class="main-col">
        <header class="topbar"><span class="page">${current[1]}</span>${icon("chevron-right")}<span class="sub">중고차 가격 예측 챌린지</span></header>
      </div>`;
    const main = document.querySelector("main");
    if (main) shell.querySelector(".main-col").append(main);
    document.body.prepend(shell);
    hydrateIcons(document.body);
  }

  const fmt = {
    rmse: (v) => v.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    r2: (v) => v.toFixed(4),
    int: (v) => v.toLocaleString("ko-KR"),
    time: (iso) => {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },
  };

  async function api(path, options) {
    const res = await fetch(path, options);
    let body = null;
    try { body = await res.json(); } catch (_) { /* 본문 없음 */ }
    return { ok: res.ok, status: res.status, body };
  }

  function rememberTeam(team, nickname) {
    try { localStorage.setItem("iba.team", team); localStorage.setItem("iba.nickname", nickname); } catch (_) {}
  }
  function recallTeam() {
    try { return { team: localStorage.getItem("iba.team") || "", nickname: localStorage.getItem("iba.nickname") || "" }; } catch (_) { return { team: "", nickname: "" }; }
  }

  window.IBA = { renderShell, icon, fmt, api, rememberTeam, recallTeam };
  document.addEventListener("DOMContentLoaded", renderShell);
})();
