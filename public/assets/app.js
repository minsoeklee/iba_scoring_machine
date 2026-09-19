// 공통 도우미: 헤더 렌더링, 숫자 포맷, API 호출.
(function () {
  const PAGES = [
    ["/", "홈"],
    ["/submit.html", "채점"],
    ["/leaderboard.html", "리더보드"],
    ["/minigame.html", "미니게임"],
  ];

  function renderHeader() {
    const here = location.pathname.replace(/index\.html$/, "");
    const nav = PAGES.map(([href, label]) => {
      const current = (href === "/" ? here === "/" : here === href) ? ' aria-current="page"' : "";
      return `<a href="${href}"${current}>${label}</a>`;
    }).join("");
    const header = document.createElement("header");
    header.className = "site-header";
    header.innerHTML = `<div class="inner"><a class="brand" href="/">IBA Scoring Machine<small>중고차 가격 예측</small></a><nav class="nav">${nav}</nav></div>`;
    document.body.prepend(header);
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

  window.IBA = { renderHeader, fmt, api, rememberTeam, recallTeam };
  document.addEventListener("DOMContentLoaded", renderHeader);
})();
