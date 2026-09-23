// 테트리스. 10×20 보드, 7-bag 무작위, SRS 회전과 벽 차기, 고스트·보관·다음 블록 3개.
// 바닥에 닿은 블록은 0.5초 뒤 고정되고, 그 사이 이동·회전으로 15번까지 시간을 되돌릴 수 있다.
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
  const TYPES = Object.keys(SHAPES);
  // SRS 벽 차기. 시계 방향 0→R, R→2, 2→L, L→0 회전에서 차례로 시도할 이동(x는 오른쪽, y는 위쪽이 +).
  // 반시계 회전은 반대 방향 회전의 값을 부호만 뒤집어 쓴다.
  const KICKS = {
    JLSTZ: [
      [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
      [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
      [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
      [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    ],
    I: [
      [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
      [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
      [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
      [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    ],
  };
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const LINE_NAME = ["", "싱글", "더블", "트리플", "테트리스"];
  const MAX_SCORE = 9999999;           // 서버 상한(app.py GAME_MAX_SCORE)과 같다
  const DAS = 160, ARR = 40;           // 좌우 키를 누르고 있을 때 첫 연속 이동까지, 이후 이동 간격(ms)
  const SOFT_DROP = 20;                // ↓를 누르는 동안 낙하 속도 배율
  const LOCK_DELAY = 500, LOCK_RESETS = 15;
  const CLEAR_MS = 180;                // 줄이 지워질 때 깜빡이는 시간
  const BEST_KEY = "iba.best.tetris";

  const $ = (id) => document.getElementById(id);
  const overlay = $("overlay");

  // 고해상도 화면에서 흐려지지 않게 캔버스 픽셀을 devicePixelRatio만큼 늘리고, 그리기는 CSS 픽셀 단위로 한다.
  function hiDpi(cv) {
    const w = cv.width, h = cv.height, dpr = window.devicePixelRatio || 1;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, w, h };
  }
  const B = hiDpi($("board")), H = hiDpi($("hold")), N = hiDpi($("next"));

  const rotate = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());  // 시계 방향
  const ROTATIONS = {};
  TYPES.forEach((t) => {
    ROTATIONS[t] = [SHAPES[t]];
    for (let i = 1; i < 4; i++) ROTATIONS[t].push(rotate(ROTATIONS[t][i - 1]));
  });

  let grid, piece, queue, holdType, holdUsed, score, lines, level, combo, b2b, best;
  let clearing = null, clearT = 0, label = null;
  let state = "ready", dropAcc = 0, last = 0, raf = 0, overAt = 0;
  const keys = { left: false, right: false, soft: false };
  let shift = { dir: 0, t: 0 };

  function readBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (_) {} }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // 7개 블록을 한 봉지씩 섞어 이어 붙인다. 미리보기 3개가 늘 차 있도록 7개 이상 유지한다.
  function fillQueue() { while (queue.length < 7) queue.push(...shuffle(TYPES.slice())); }

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

  const onGround = () => collides(piece.shape, piece.x, piece.y + 1);

  function spawn(type) {
    if (!type) { type = queue.shift(); fillQueue(); }
    const shape = ROTATIONS[type][0];
    const y = type === "I" ? -1 : 0;
    piece = { type, rot: 0, shape, x: Math.floor((COLS - shape[0].length) / 2), y, lowest: y, lockT: 0, resets: 0 };
    dropAcc = 0;
    if (collides(piece.shape, piece.x, piece.y)) gameOver();
  }

  function move(dx, dy) {
    if (collides(piece.shape, piece.x + dx, piece.y + dy)) return false;
    piece.x += dx; piece.y += dy;
    return true;
  }

  // 바닥에 닿은 채로 움직이거나 돌리면 고정 대기 시간을 처음부터 다시 센다. 횟수 제한이 있어 무한히 버틸 수는 없다.
  function resetLock() {
    if (onGround() && piece.resets < LOCK_RESETS) { piece.lockT = 0; piece.resets++; }
  }

  function shiftPiece(dir) {
    if (!move(dir, 0)) return false;
    resetLock();
    return true;
  }

  function turn(dir) {
    if (piece.type === "O") return;
    const to = (piece.rot + dir + 4) % 4;
    const shape = ROTATIONS[piece.type][to];
    const table = KICKS[piece.type === "I" ? "I" : "JLSTZ"];
    const tests = dir === 1 ? table[piece.rot] : table[to].map(([x, y]) => [-x, -y]);
    for (const [kx, ky] of tests) {
      if (!collides(shape, piece.x + kx, piece.y - ky)) {
        piece.shape = shape; piece.rot = to; piece.x += kx; piece.y -= ky;
        resetLock();
        return;
      }
    }
  }

  function addScore(n) { score = Math.min(MAX_SCORE, score + n); }

  // 한 칸 내린다. 처음 내려가 본 높이에 닿으면 고정 대기와 되돌리기 횟수를 새로 준다.
  function stepDown(soft) {
    if (!move(0, 1)) return false;
    if (soft) addScore(1);
    if (piece.y > piece.lowest) { piece.lowest = piece.y; piece.lockT = 0; piece.resets = 0; }
    return true;
  }

  function hardDrop() {
    let dist = 0;
    while (move(0, 1)) dist++;
    addScore(dist * 2);
    lock();
  }

  function holdPiece() {
    if (holdUsed) return;
    const prev = holdType;
    holdType = piece.type;
    holdUsed = true;
    spawn(prev);
  }

  function lock() {
    let overflow = false;
    piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      const gy = piece.y + r;
      if (gy < 0) overflow = true; else grid[gy][piece.x + c] = piece.type;
    }));
    piece = null;
    holdUsed = false;
    if (overflow) return gameOver();

    const full = [];
    grid.forEach((row, y) => { if (row.every(Boolean)) full.push(y); });
    if (full.length) {
      scoreLines(full.length);
      clearing = full; clearT = CLEAR_MS;
    } else {
      combo = -1;
      spawn();
    }
    updateStats();
  }

  // 싱글·더블·트리플·테트리스 × 레벨. 테트리스를 연달아 하면 1.5배, 연속으로 줄을 지우면 콤보 점수를 더한다.
  function scoreLines(n) {
    combo++;
    const backToBack = n === 4 && b2b;
    let pts = LINE_SCORE[n] * level;
    if (backToBack) pts = pts * 3 / 2;
    if (combo > 0) pts += 50 * combo * level;
    addScore(pts);
    b2b = n === 4;
    let text = LINE_NAME[n];
    if (backToBack) text = "연속 " + text;
    if (combo > 0) text += ` · ${combo} 콤보`;
    label = { text, t: 1200 };
    lines += n;
    level = Math.floor(lines / 10) + 1;
  }

  function finishClear() {
    grid = grid.filter((_, y) => !clearing.includes(y));
    while (grid.length < ROWS) grid.unshift(Array(COLS).fill(null));
    clearing = null;
    spawn();
  }

  // 한 줄 내려오는 시간(ms). 가이드라인 공식이라 레벨 10쯤부터 매우 빨라진다.
  const interval = () => Math.pow(0.8 - (level - 1) * 0.007, level - 1) * 1000;

  // --- 그리기 -----------------------------------------------------------------

  function drawBlock(c, px, py, size, color, alpha) {
    c.globalAlpha = alpha ?? 1;
    c.fillStyle = color;
    c.fillRect(px + 1, py + 1, size - 2, size - 2);
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.fillRect(px + 1, py + 1, size - 2, Math.max(2, size / 7));
    c.globalAlpha = 1;
  }

  // 미리보기 칸에 블록 하나를 (cx, cy)를 중심으로 그린다.
  function drawMini(c, type, cx, cy, size, alpha) {
    const cells = [];
    SHAPES[type].forEach((row, r) => row.forEach((v, col) => { if (v) cells.push([col, r]); }));
    const minX = Math.min(...cells.map((p) => p[0])), maxX = Math.max(...cells.map((p) => p[0]));
    const minY = Math.min(...cells.map((p) => p[1])), maxY = Math.max(...cells.map((p) => p[1]));
    const ox = cx - (maxX - minX + 1) * size / 2, oy = cy - (maxY - minY + 1) * size / 2;
    cells.forEach(([col, r]) => drawBlock(c, ox + (col - minX) * size, oy + (r - minY) * size, size, COLORS[type], alpha));
  }

  function clearCanvas(v) { v.c.fillStyle = "#0b1a2e"; v.c.fillRect(0, 0, v.w, v.h); }

  function draw() {
    const c = B.c;
    clearCanvas(B);
    c.fillStyle = "rgba(255,255,255,0.04)";
    for (let x = 1; x < COLS; x++) c.fillRect(x * CELL, 0, 1, ROWS * CELL);
    for (let y = 1; y < ROWS; y++) c.fillRect(0, y * CELL, COLS * CELL, 1);

    grid.forEach((row, y) => {
      if (clearing && clearing.includes(y)) {
        c.fillStyle = `rgba(255,255,255,${0.3 + 0.6 * Math.max(0, clearT) / CLEAR_MS})`;
        c.fillRect(0, y * CELL + 1, COLS * CELL, CELL - 2);
        return;
      }
      row.forEach((t, x) => { if (t) drawBlock(c, x * CELL, y * CELL, CELL, COLORS[t]); });
    });

    if (piece && state !== "over") {
      let gy = piece.y;
      while (!collides(piece.shape, piece.x, gy + 1)) gy++;
      const cells = [];
      piece.shape.forEach((row, r) => row.forEach((v, col) => { if (v) cells.push([piece.x + col, r]); }));
      cells.forEach(([x, r]) => { if (gy + r >= 0) drawBlock(c, x * CELL, (gy + r) * CELL, CELL, COLORS[piece.type], 0.2); });
      cells.forEach(([x, r]) => { if (piece.y + r >= 0) drawBlock(c, x * CELL, (piece.y + r) * CELL, CELL, COLORS[piece.type]); });
    }

    if (label) {
      c.globalAlpha = Math.min(1, label.t / 300);
      c.font = "700 18px 'Noto Sans KR', sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#fff";
      c.fillText(label.text, B.w / 2, 90);
      c.globalAlpha = 1;
    }

    clearCanvas(H);
    if (holdType) drawMini(H.c, holdType, H.w / 2, H.h / 2, 18, holdUsed ? 0.35 : 1);
    clearCanvas(N);
    if (queue) queue.slice(0, 3).forEach((t, i) => drawMini(N.c, t, N.w / 2, 36 + i * 60, 18));
  }

  // --- 진행 -------------------------------------------------------------------

  function updateStats() {
    $("score").textContent = score.toLocaleString("ko-KR");
    $("lines").textContent = lines;
    $("level").textContent = level;
    $("best").textContent = Math.max(best, score).toLocaleString("ko-KR");
  }

  function showOverlay(title, text, button, onClick) {
    overlay.innerHTML = `<div class="big">${title}</div><div class="small">${text}</div>${button ? `<button type="button" class="primary">${button}</button>` : ""}`;
    overlay.hidden = false;
    const btn = overlay.querySelector("button");
    if (btn) btn.addEventListener("click", onClick);
  }

  function clearKeys() {
    keys.left = keys.right = keys.soft = false;
    shift = { dir: 0, t: 0 };
  }

  // 게임 루프는 항상 하나만 돈다. 일시정지를 빠르게 풀었다 걸어도 루프가 겹쳐 두 배로 빨라지지 않는다.
  function run() {
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    queue = []; fillQueue();
    holdType = null; holdUsed = false;
    score = 0; lines = 0; level = 1; combo = -1; b2b = false;
    clearing = null; label = null;
    best = readBest();
    clearKeys();
    state = "playing";
    overlay.hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    spawn();
    updateStats();
    run();
  }

  function gameOver() {
    if (state === "over") return;
    state = "over";
    cancelAnimationFrame(raf);
    clearKeys();
    overAt = performance.now();
    const isBest = score > best;
    if (isBest) saveBest(score);
    updateStats();
    draw();
    showOverlay("게임 오버", `${score.toLocaleString("ko-KR")}점${isBest ? " · 최고 기록!" : ""}`, "다시 하기", start);
    window.IBA.reportScore("tetris", score, overlay);
  }

  function setPaused(paused) {
    if (paused && state === "playing") {
      state = "paused";
      cancelAnimationFrame(raf);
      clearKeys();
      showOverlay("일시정지", "P나 Esc 키를 누르면 이어서 합니다.", "이어서 하기", () => setPaused(false));
    } else if (!paused && state === "paused") {
      state = "playing";
      overlay.hidden = true;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      run();
    }
  }

  // 좌우 키를 누르고 있으면 DAS만큼 기다린 뒤 ARR 간격으로 계속 움직인다. 줄이 지워지는 동안에도 충전은 이어진다.
  function autoShift(dt) {
    if (!shift.dir) return;
    shift.t += dt;
    if (!piece) { shift.t = Math.min(shift.t, DAS); return; }
    while (shift.t >= DAS) {
      if (!shiftPiece(shift.dir)) { shift.t = DAS; break; }
      shift.t -= ARR;
    }
  }

  function update(dt) {
    if (label && (label.t -= dt) <= 0) label = null;
    autoShift(dt);
    if (clearing) {
      clearT -= dt;
      if (clearT <= 0) finishClear();
      return;
    }
    if (!piece) return;
    if (onGround()) {
      dropAcc = 0;
      piece.lockT += dt;
      if (piece.lockT >= LOCK_DELAY) lock();
      return;
    }
    const iv = keys.soft ? interval() / SOFT_DROP : interval();
    dropAcc += dt;
    while (dropAcc >= iv) {
      dropAcc -= iv;
      if (!stepDown(keys.soft)) { dropAcc = 0; break; }
    }
    if (keys.soft) updateStats();
  }

  function frame(t) {
    raf = 0;
    if (state !== "playing") return;
    const dt = Math.min(100, Math.max(0, t - last));  // 멈칫한 프레임 뒤에 블록이 한꺼번에 떨어지지 않게 자른다
    last = t;
    update(dt);
    if (state !== "playing") return;
    draw();
    raf = requestAnimationFrame(frame);
  }

  const KEYMAP = {
    ArrowLeft: "left", ArrowRight: "right", ArrowDown: "soft", ArrowUp: "cw", KeyX: "cw", KeyZ: "ccw",
    Space: "hard", KeyC: "hold", ShiftLeft: "hold", ShiftRight: "hold", KeyP: "pause", Escape: "pause",
  };

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (state === "ready" || state === "over") {
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.preventDefault();
      // 바로 떨어뜨리기를 누른 채 게임이 끝나도 결과를 보기 전에 새 게임이 시작되지 않게 한다
      if (!e.repeat && performance.now() - overAt > 600) start();
      return;
    }
    const act = KEYMAP[e.code];
    if (!act) return;
    e.preventDefault();
    if (e.repeat) return;  // 누르고 있는 동안의 반복은 autoShift와 소프트 드롭이 맡는다
    if (act === "pause") { setPaused(state === "playing"); return; }
    if (state !== "playing") return;
    if (act === "left" || act === "right") {
      keys[act] = true;
      const dir = act === "left" ? -1 : 1;
      shift = { dir, t: 0 };
      if (piece) shiftPiece(dir);
    } else if (act === "soft") {
      keys.soft = true;
      if (piece) { stepDown(true); dropAcc = 0; }
    }
    if (piece) {
      if (act === "cw") turn(1);
      else if (act === "ccw") turn(-1);
      else if (act === "hard") hardDrop();
      else if (act === "hold") holdPiece();
    }
    if (state !== "playing") return;
    updateStats();
    draw();
  });

  document.addEventListener("keyup", (e) => {
    const act = KEYMAP[e.code];
    if (act === "soft") keys.soft = false;
    if (act !== "left" && act !== "right") return;
    keys[act] = false;
    const dir = act === "left" ? -1 : 1;
    // 먼저 누른 쪽을 아직 누르고 있으면 그쪽으로 다시 연속 이동을 준비한다
    if (shift.dir === dir) shift = keys[act === "left" ? "right" : "left"] ? { dir: -dir, t: 0 } : { dir: 0, t: 0 };
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
  window.addEventListener("blur", () => setPaused(true));  // 창을 떠나면 keyup을 못 받아 키가 눌린 채로 남는다

  document.addEventListener("DOMContentLoaded", () => {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    score = 0; lines = 0; level = 1; best = readBest();
    updateStats();
    draw();
    showOverlay("테트리스", "줄을 채워 없애세요. 10줄마다 빨라집니다.", "시작하기", start);
    window.IBA.gameBoard("tetris");
  });
})();
