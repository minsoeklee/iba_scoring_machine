// 공통 도우미: 셸(사이드바·상단바) 렌더링, 로그인 상태, 아이콘, 숫자 포맷, API 호출, 리더보드 행.
(function () {
  const PAGES = [
    ["/", "홈", "house"],
    ["/submit.html", "모델 제출", "upload"],
    ["/leaderboard.html", "리더보드", "chart-column"],
    ["/minigame.html", "미니게임", "gamepad-2"],
  ];
  const OTHER_TITLES = { "/login.html": "로그인", "/signup.html": "회원가입" };

  function icon(name) {
    const d = (window.ICON_PATHS || {})[name] || "";
    return `<svg class="icon" viewBox="0 0 14 14" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // 페이지 마크업의 <i data-icon="이름"></i>를 SVG로 바꾼다.
  function hydrateIcons(root) {
    root.querySelectorAll("i[data-icon]").forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    let body = null;
    try { body = await res.json(); } catch (_) { /* 본문 없음 */ }
    return { ok: res.ok, status: res.status, body };
  }

  // 로그인한 사용자 {username, nickname, team}. 로그인하지 않았으면 null.
  const me = api("/api/me").then((r) => (r.ok ? r.body : null), () => null);

  // 로그인·가입 뒤 돌아갈 주소. 같은 사이트 경로만 허용한다.
  function nextPath() {
    const next = new URLSearchParams(location.search).get("next") || "/";
    return next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }
  function authLink(page) {
    return `/${page}.html?next=${encodeURIComponent(location.pathname)}`;
  }

  function renderShell() {
    const here = location.pathname.replace(/index\.html$/, "");
    const current = PAGES.find(([href]) => href === here);
    const title = current ? current[1] : OTHER_TITLES[here] || "";
    const nav = PAGES.map(([href, label, ic]) => {
      const cur = current && href === current[0] ? ' aria-current="page"' : "";
      return `<a href="${href}"${cur}>${icon(ic)}<span>${label}</span></a>`;
    }).join("");

    const shell = document.createElement("div");
    shell.className = "shell";
    shell.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-top">
          <a class="wordmark" href="/">IBA</a>
          <nav class="nav" aria-label="페이지">${nav}</nav>
        </div>
        <div class="sidebar-bottom" id="meCard"></div>
      </aside>
      <div class="main-col">
        <header class="topbar">
          <div class="where"><span class="page">${title}</span>${icon("chevron-right")}<span class="sub">중고차 가격 예측 챌린지</span></div>
          <div class="topbar-auth" id="topbarAuth"></div>
        </header>
      </div>`;
    const main = document.querySelector("main");
    if (main) shell.querySelector(".main-col").append(main);
    document.body.prepend(shell);
    hydrateIcons(document.body);
    me.then(renderAuth);
  }

  function renderAuth(user) {
    const card = document.getElementById("meCard");
    const bar = document.getElementById("topbarAuth");
    if (user) {
      card.innerHTML = `<div class="me"><span class="avatar">${icon("user")}</span><span><div class="name">${esc(user.nickname)}</div><div class="sub">${esc(user.team)} 팀 · ${esc(user.username)}</div></span></div>`;
      bar.innerHTML = `<span class="who">${esc(user.nickname)} · ${esc(user.team)}</span><button type="button" class="sm" id="logoutBtn">로그아웃</button>`;
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        await api("/api/logout", { method: "POST" });
        location.reload();
      });
    } else {
      card.innerHTML = `<a class="me" href="${authLink("login")}"><span class="avatar">${icon("user")}</span><span><div class="name">로그인하지 않음</div><div class="sub">로그인하면 제출할 수 있습니다</div></span></a>`;
      bar.innerHTML = `<a class="btn sm" href="${authLink("login")}">로그인</a><a class="btn sm primary" href="${authLink("signup")}">회원가입</a>`;
    }
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
    // "방금 전", "12분 전", "3시간 전", "2일 전". 일주일이 넘으면 날짜로 쓴다.
    ago: (iso) => {
      const min = Math.floor((Date.now() - new Date(iso)) / 60000);
      if (min < 1) return "방금 전";
      if (min < 60) return `${min}분 전`;
      if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
      if (min < 60 * 24 * 7) return `${Math.floor(min / (60 * 24))}일 전`;
      return fmt.time(iso);
    },
  };

  // 리더보드 표의 <tr>들. myTeam과 같은 팀 행은 강조한다.
  function boardRows(rows, myTeam) {
    const teamIcon = icon("users");
    return rows.map((row) => {
      const mine = myTeam && row.team === myTeam;
      return `
      <tr${mine ? ' class="mine"' : ""}>
        <td><span class="rank-badge${row.rank === 1 ? " first" : ""}">${row.rank}</span></td>
        <td><div class="team"><span class="avatar">${teamIcon}</span><div><div class="name">${esc(row.team)}${mine ? ' <span class="tag">우리 팀</span>' : ""}</div><div class="sub">${esc(row.nickname)}</div></div></div></td>
        <td class="num score-main">${fmt.rmse(row.rmse)}</td>
        <td class="num soft">${fmt.r2(row.r2)}</td>
        <td class="num faint" title="${fmt.time(row.submitted_at)}">${fmt.ago(row.submitted_at)}</td>
      </tr>`;
    }).join("");
  }

  window.IBA = { icon, esc, fmt, api, me, nextPath, authLink, boardRows };
  document.addEventListener("DOMContentLoaded", renderShell);
})();
