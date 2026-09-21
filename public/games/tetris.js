// 테트리스. 10×20 보드, 7-bag 무작위, 벽 차기는 좌우 한두 칸만 시도하는 단순한 방식.
(function () {
  const COLS = 10, ROWS = 20, CELL = 28;
  const COLORS = { I: "#3ec7e0", O: "#f2c94c", T: "#a77bf3", S: "#4cc38a", Z: "#ef6b6b", J: "#4f7df0", L: "#f29b4c" };
  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  };
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const BEST_KEY = "iba.best.tetris";

  const $ = (id) => document.getElementById(id);
  const board = $("board"), ctx = board.getContext("2d");
  const nextCv = $("next"), nctx = nextCv.getContext("2d");
  const overlay = $("overlay");

  let grid, piece, bag, nextType, score, lines, level, state = "ready", dropAcc, last;

  function readBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (_) {} }

  const rotate = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());  // 시계 방향
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function takeFromBag() { if (!bag.length) bag = shuffle(Object.keys(SHAPES)); return bag.pop(); }

  function collides(shape, x, y) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const gx = x + c, gy = y + r;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function spawn() {
    const type = nextType;
    nextType = takeFromBag();
    const shape = SHAPES[type].map((r) => r.slice());
    piece = { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: type === "I" ? -1 : 0 };
    if (collides(piece.shape, piece.x, piece.y)) gameOver();
  }

  function move(dx, dy) {
    if (collides(piece.shape, piece.x + dx, piece.y + dy)) return false;
    piece.x += dx; piece.y += dy;
    return true;
  }

  function turn() {
    const s = rotate(piece.shape);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(s, piece.x + kick, piece.y)) { piece.shape = s; piece.x += kick; return; }
    }
  }

  function lock() {
    let overflow = false;
    piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      const gy = piece.y + r;
      if (gy < 0) overflow = true; else grid[gy][piece.x + c] = piece.type;
    }));
    if (overflow) return gameOver();

    grid = grid.filter((row) => row.some((c) => !c));
    const cleared = ROWS - grid.length;
    while (grid.length < ROWS) grid.unshift(Array(COLS).fill(null));
    if (cleared) {
      lines += cleared;
      score += LINE_SCORE[cleared] * level;
      level = Math.floor(lines / 10) + 1;
    }
    spawn();
    updateStats();
  }

  function hardDrop() {
    let dist = 0;
    while (move(0, 1)) dist++;
    score += dist * 2;
    lock();
  }

  function softDrop() {
    if (move(0, 1)) score += 1; else lock();
    dropAcc = 0;
    updateStats();
  }

  const interval = () => Math.max(80, 800 - (level - 1) * 70);

  // --- 그리기 -----------------------------------------------------------------

  function drawCell(c, x, y, color, size, alpha) {
    c.globalAlpha = alpha ?? 1;
    c.fillStyle = color;
    c.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    c.globalAlpha = 1;
  }

  function draw() {
    ctx.fillStyle = "#0b1a2e";
    ctx.fillRect(0, 0, board.width, board.height);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, ROWS * CELL); ctx.stroke(); }
    for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(COLS * CELL, y * CELL + 0.5); ctx.stroke(); }

    grid.forEach((row, y) => row.forEach((t, x) => { if (t) drawCell(ctx, x, y, COLORS[t], CELL); }));

    if (piece && state !== "over") {
      let gy = piece.y;
      while (!collides(piece.shape, piece.x, gy + 1)) gy++;
      piece.shape.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return;
        if (gy + r >= 0) drawCell(ctx, piece.x + c, gy + r, COLORS[piece.type], CELL, 0.2);
        if (piece.y + r >= 0) drawCell(ctx, piece.x + c, piece.y + r, COLORS[piece.type], CELL);
      }));
    }

    nctx.fillStyle = "#0b1a2e";
    nctx.fillRect(0, 0, nextCv.width, nextCv.height);
    if (nextType) {
      const s = SHAPES[nextType], size = 22;
      const filled = s.map((row, r) => row.map((v, c) => (v ? [c, r] : null))).flat().filter(Boolean);
      const minX = Math.min(...filled.map((p) => p[0])), maxX = Math.max(...filled.map((p) => p[0]));
      const minY = Math.min(...filled.map((p) => p[1])), maxY = Math.max(...filled.map((p) => p[1]));
      const ox = (nextCv.width - (maxX - minX + 1) * size) / 2 / size - minX;
      const oy = (nextCv.height - (maxY - minY + 1) * size) / 2 / size - minY;
      filled.forEach(([c, r]) => drawCell(nctx, c + ox, r + oy, COLORS[nextType], size));
    }
  }

  // --- 진행 -------------------------------------------------------------------

  function updateStats() {
    $("score").textContent = score.toLocaleString("ko-KR");
    $("lines").textContent = lines;
    $("level").textContent = level;
    $("best").textContent = Math.max(readBest(), score).toLocaleString("ko-KR");
  }

  function showOverlay(title, text, button) {
    overlay.innerHTML = `<div class="big">${title}</div><div class="small">${text}</div>${button ? `<button type="button" class="primary" id="startBtn">${button}</button>` : ""}`;
    overlay.hidden = false;
    const btn = $("startBtn");
    if (btn) btn.addEventListener("click", start);
  }

  function start() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = []; nextType = takeFromBag();
    score = 0; lines = 0; level = 1; dropAcc = 0;
    state = "playing";
    overlay.hidden = true;
    spawn();
    updateStats();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function gameOver() {
    state = "over";
    const best = readBest();
    if (score > best) saveBest(score);
    updateStats();
    draw();
    showOverlay("게임 오버", `${score.toLocaleString("ko-KR")}점${score > best ? " · 최고 기록!" : ""}`, "다시 하기");
  }

  function setPaused(paused) {
    if (paused && state === "playing") {
      state = "paused";
      showOverlay("일시정지", "P 키를 누르면 이어서 합니다.", "");
    } else if (!paused && state === "paused") {
      state = "playing";
      overlay.hidden = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function frame(t) {
    if (state !== "playing") return;
    dropAcc += t - last;
    last = t;
    if (dropAcc >= interval()) {
      dropAcc = 0;
      if (!move(0, 1)) lock();
    }
    draw();
    if (state === "playing") requestAnimationFrame(frame);
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (state === "ready" || state === "over") {
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); start(); }
      return;
    }
    if (e.code === "KeyP") { setPaused(state === "playing"); return; }
    if (state !== "playing") return;
    const actions = {
      ArrowLeft: () => move(-1, 0),
      ArrowRight: () => move(1, 0),
      ArrowUp: turn,
      KeyX: turn,
      ArrowDown: softDrop,
      Space: hardDrop,
    };
    const act = actions[e.code];
    if (!act) return;
    e.preventDefault();
    act();
    draw();
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });

  document.addEventListener("DOMContentLoaded", () => {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    score = 0; lines = 0; level = 1;
    updateStats();
    draw();
    showOverlay("테트리스", "줄을 채워 없애세요. 10줄마다 빨라집니다.", "시작하기");
  });
})();
