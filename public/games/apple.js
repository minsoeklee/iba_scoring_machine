// 사과게임. 마우스로 사각형을 그려 안에 든 숫자 합이 10이면 그 사과들이 사라진다. 120초 동안 없앤 사과 수가 점수.
(function () {
  const COLS = 17, ROWS = 10, CELL = 38, PAD = 14;
  const W = COLS * CELL + PAD * 2, H = ROWS * CELL + PAD * 2;
  const TIME_LIMIT = 120;
  const BEST_KEY = "iba.best.apple";

  const $ = (id) => document.getElementById(id);
  const cv = $("board"), ctx = cv.getContext("2d");
  const overlay = $("overlay");

  let apples, score, timeLeft, state = "ready", last, drag = null;

  function readBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (_) {} }

  // 전체 합이 10의 배수가 되도록 만든다(끝까지 다 없앨 가능성이 생긴다).
  function newBoard() {
    for (;;) {
      const nums = Array.from({ length: COLS * ROWS }, () => 1 + Math.floor(Math.random() * 9));
      const rest = nums.slice(0, -1).reduce((a, b) => a + b, 0) % 10;
      const lastNum = (10 - rest) % 10;
      if (lastNum === 0) continue;
      nums[nums.length - 1] = lastNum;
      return nums.map((n, i) => ({ n, col: i % COLS, row: Math.floor(i / COLS), alive: true }));
    }
  }

  const centerOf = (a) => ({ x: PAD + a.col * CELL + CELL / 2, y: PAD + a.row * CELL + CELL / 2 });

  function dragRect() {
    if (!drag) return null;
    return {
      x1: Math.min(drag.x0, drag.x), x2: Math.max(drag.x0, drag.x),
      y1: Math.min(drag.y0, drag.y), y2: Math.max(drag.y0, drag.y),
    };
  }

  function selected() {
    const r = dragRect();
    if (!r) return [];
    return apples.filter((a) => {
      if (!a.alive) return false;
      const c = centerOf(a);
      return c.x >= r.x1 && c.x <= r.x2 && c.y >= r.y1 && c.y <= r.y2;
    });
  }

  // --- 그리기 -----------------------------------------------------------------

  function drawApple(a, highlight) {
    const { x, y } = centerOf(a);
    const r = CELL * 0.4;
    ctx.fillStyle = highlight ? "#ff8a4c" : "#e5484d";
    ctx.beginPath();
    ctx.arc(x, y + 1, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.4, y - r * 0.35, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4cc38a";
    ctx.beginPath();
    ctx.ellipse(x + 4, y - r - 1, 5, 2.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = '700 17px "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(a.n), x, y + 2);
  }

  function draw() {
    ctx.fillStyle = "#0b1a2e";
    ctx.fillRect(0, 0, W, H);
    const picked = new Set(selected());
    apples.forEach((a) => { if (a.alive) drawApple(a, picked.has(a)); });

    const r = dragRect();
    if (r) {
      const sum = [...picked].reduce((s, a) => s + a.n, 0);
      ctx.fillStyle = sum === 10 ? "rgba(76, 195, 138, 0.18)" : "rgba(79, 125, 240, 0.14)";
      ctx.strokeStyle = sum === 10 ? "#4cc38a" : "#7d9cf5";
      ctx.lineWidth = 2;
      ctx.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      ctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
    }

    $("timeBar").style.width = `${(timeLeft / TIME_LIMIT) * 100}%`;
  }

  // --- 진행 -------------------------------------------------------------------

  function updateStats() {
    $("score").textContent = score;
    $("time").textContent = `${Math.ceil(timeLeft)}초`;
    $("best").textContent = Math.max(readBest(), score);
  }

  function showOverlay(title, text, button) {
    overlay.innerHTML = `<div class="big">${title}</div><div class="small">${text}</div><button type="button" class="primary" id="startBtn">${button}</button>`;
    overlay.hidden = false;
    $("startBtn").addEventListener("click", start);
  }

  function start() {
    apples = newBoard();
    score = 0;
    timeLeft = TIME_LIMIT;
    drag = null;
    state = "playing";
    overlay.hidden = true;
    updateStats();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function finish() {
    state = "over";
    drag = null;
    const best = readBest();
    if (score > best) saveBest(score);
    updateStats();
    draw();
    const cleared = apples.every((a) => !a.alive);
    showOverlay(cleared ? "모두 없앴습니다!" : "시간 종료", `사과 ${score}개${score > best ? " · 최고 기록!" : ""}`, "다시 하기");
    window.IBA.reportScore("apple", score, overlay);
  }

  function frame(t) {
    if (state !== "playing") return;
    timeLeft -= Math.min((t - last) / 1000, 0.1);  // 탭이 숨겨진 동안은 시간이 흐르지 않는다
    last = t;
    if (timeLeft <= 0) { timeLeft = 0; finish(); return; }
    $("time").textContent = `${Math.ceil(timeLeft)}초`;
    draw();
    requestAnimationFrame(frame);
  }

  function toCanvas(e) {
    const rect = cv.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }

  cv.addEventListener("mousedown", (e) => {
    if (state !== "playing") return;
    e.preventDefault();
    const p = toCanvas(e);
    drag = { x0: p.x, y0: p.y, x: p.x, y: p.y };
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const p = toCanvas(e);
    drag.x = Math.max(0, Math.min(W, p.x));
    drag.y = Math.max(0, Math.min(H, p.y));
  });

  window.addEventListener("mouseup", () => {
    if (!drag) return;
    const picked = selected();
    drag = null;
    if (picked.length && picked.reduce((s, a) => s + a.n, 0) === 10) {
      picked.forEach((a) => { a.alive = false; });
      score += picked.length;
      updateStats();
      if (apples.every((a) => !a.alive)) finish();
    }
  });

  $("restart").addEventListener("click", start);

  document.addEventListener("DOMContentLoaded", () => {
    apples = newBoard();
    score = 0;
    timeLeft = TIME_LIMIT;
    updateStats();
    draw();
    showOverlay("사과게임", "마우스로 사각형을 그려 숫자 합을 10으로 만들면 사과가 사라집니다. 제한 시간은 2분입니다.", "시작하기");
    window.IBA.gameBoard("apple");
  });
})();
