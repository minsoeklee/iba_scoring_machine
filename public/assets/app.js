// 공통 도우미: 셸(사이드바·상단바) 렌더링, 로그인 상태, 아이콘, 숫자 포맷, API 호출, 리더보드 행, 미니게임 팀 순위.
(function () {
  const PAGES = [
    ["/", "홈", "house"],
    ["/submit.html", "모델 제출", "upload"],
    ["/leaderboard.html", "리더보드", "chart-column"],
    ["/minigame.html", "미니게임", "gamepad-2"],
    ["/mypage.html", "마이페이지", "user"],
  ];
  const OTHER_TITLES = {
    "/login.html": "로그인", "/signup.html": "회원가입",
    "/about.html": "소개", "/hall.html": "명예의 전당",
  };

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
    // 개별 게임 페이지(/games/...)는 미니게임 메뉴 아래에 있는 것으로 본다.
    const navPath = here.startsWith("/games/") ? "/minigame.html" : here;
    const current = PAGES.find(([href]) => href === navPath);
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
          <a class="wordmark" href="/"><img src="/assets/iba-mark.png" alt="">IBA</a>
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
      card.innerHTML = `<a class="me" href="${authLink("login")}"><span class="avatar">${icon("user")}</span><span class="name">로그인</span></a>`;
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

  // 탭이 보이는 동안 ms마다 fn을 부른다. 숨겨졌던 탭으로 돌아오면 바로 한 번 부른다.
  function refreshEvery(fn, ms) {
    setInterval(() => { if (!document.hidden) fn(); }, ms);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) fn(); });
  }

  // --- 미니게임 팀 순위 --------------------------------------------------------
  // 게임 페이지의 #gameBoard 표를 채운다. 팀별 최고 점수, 점수 내림차순.
  async function loadGameBoard(game) {
    const [r, user] = await Promise.all([api(`/api/games/${game}/leaderboard`), me]);
    const table = document.getElementById("gameBoard");
    const emptyEl = document.getElementById("gameBoardEmpty");
    if (!r.ok) { emptyEl.textContent = `순위를 불러오지 못했습니다 (HTTP ${r.status})`; return; }
    const rows = r.body;
    table.hidden = rows.length === 0;
    emptyEl.hidden = rows.length > 0;
    emptyEl.textContent = "아직 기록이 없습니다. 첫 기록을 남겨 보세요.";
    const teamIcon = icon("users");
    table.querySelector("tbody").innerHTML = rows.map((row) => {
      const mine = user && row.team === user.team;
      return `
      <tr${mine ? ' class="mine"' : ""}>
        <td><span class="rank-badge${row.rank === 1 ? " first" : ""}">${row.rank}</span></td>
        <td><div class="team"><span class="avatar">${teamIcon}</span><div><div class="name">${esc(row.team)}${mine ? ' <span class="tag">우리 팀</span>' : ""}</div><div class="sub">${esc(row.nickname)}</div></div></div></td>
        <td class="num score-main">${fmt.int(row.score)}</td>
        <td class="num faint" title="${fmt.time(row.played_at)}">${fmt.ago(row.played_at)}</td>
      </tr>`;
    }).join("");
  }

  function gameBoard(game) {
    loadGameBoard(game);
    refreshEvery(() => loadGameBoard(game), 60000);
  }

  // 게임이 끝났을 때 점수를 팀 기록으로 올리고, 결과 문구를 overlay의 버튼 위에 붙인다.
  async function reportScore(game, score, overlay) {
    const note = document.createElement("div");
    note.className = "small";
    overlay.insertBefore(note, overlay.querySelector("button"));
    const user = await me;
    if (!user) { note.textContent = "로그인하면 팀 순위에 기록됩니다."; return; }
    if (score <= 0) return;
    const r = await api(`/api/games/${game}/score`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score }),
    });
    if (!r.ok) { note.textContent = "점수를 기록하지 못했습니다."; return; }
    note.textContent = `${user.team} 팀 ${r.body.rank}위 · 팀 최고 ${fmt.int(r.body.team_best)}점`;
    loadGameBoard(game);
  }

  window.IBA = { icon, esc, fmt, api, me, nextPath, authLink, boardRows, refreshEvery, gameBoard, reportScore };
  document.addEventListener("DOMContentLoaded", renderShell);
})();
