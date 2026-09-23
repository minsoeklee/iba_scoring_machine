// 사과게임. 드래그로 사각형을 그려 안에 든 숫자 합이 10이면 그 사과들이 사라진다. 100초 동안 없앤 사과 수가 점수.
(function () {
  const COLS = 17, ROWS = 10, CELL = 38, PAD = 14;
  const W = COLS * CELL + PAD * 2, H = ROWS * CELL + PAD * 2;
  const TIME_LIMIT = 100;
  const BEST_KEY = "iba.best.apple";
  const POP_MS = 520, FLOAT_MS = 800, FLASH_MS = 260;

  const $ = (id) => document.getElementById(id);
  const cv = $("board"), ctx = cv.getContext("2d");
  const overlay = $("overlay");

  // state: ready → playing ⇄ paused → over
  let apples, score, timeLeft, state = "ready", last = 0, drag = null;
  let effects = [], dirty = true;

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
      const board = nums.map((n, i) => ({ n, col: i % COLS, row: Math.floor(i / COLS), alive: true }));
      if (hasMove(board)) return board;
    }
  }

  // 합이 정확히 10인 사각형이 하나라도 남았는지 본다. 칸 단위 누적합으로 모든 사각형을 훑는다.
  function hasMove(board) {
    const sum = Array.from({ length: ROWS + 1 }, () => new Array(COLS + 1).fill(0));
    board.forEach((a) => { if (a.alive) sum[a.row + 1][a.col + 1] = a.n; });
    for (let r = 1; r <= ROWS; r++)
      for (let c = 1; c <= COLS; c++) sum[r][c] += sum[r - 1][c] + sum[r][c - 1] - sum[r - 1][c - 1];
    for (let r1 = 0; r1 < ROWS; r1++)
      for (let r2 = r1 + 1; r2 <= ROWS; r2++)
        for (let c1 = 0; c1 < COLS; c1++)
          for (let c2 = c1 + 1; c2 <= COLS; c2++) {
            const s = sum[r2][c2] - sum[r1][c2] - sum[r2][c1] + sum[r1][c1];
            if (s === 10) return true;
            if (s > 10) break;  // 오른쪽으로 넓힐수록 합은 줄지 않는다
          }
    return false;
  }

  const centerOf = (a) => ({ x: PAD + a.col * CELL + CELL / 2, y: PAD + a.row * CELL + CELL / 2 });

  function dragRect() {
    if (!drag) return null;
    return {
      x1: Math.min(drag.x0, drag.x), x2: Math.max(drag.x0, drag.x),
      y1: Math.min(drag.y0, drag.y), y2: Math.max(drag.y0, drag.y),
    };
  }

  function inRect(r) {
    return apples.filter((a) => {
      if (!a.alive) return false;
      const c = centerOf(a);
      return c.x >= r.x1 && c.x <= r.x2 && c.y >= r.y1 && c.y <= r.y2;
    });
  }

  // 사과를 지우고 효과를 붙인다. 지운 개수를 돌려준다(합이 10이 아니면 0).
  function clearRect(r) {
    const picked = inRect(r);
    const sum = picked.reduce((s, a) => s + a.n, 0);
    const now = performance.now();
    if (sum !== 10) {
      if (picked.length) effects.push({ kind: "flash", r, t0: now });
      return 0;
    }
    picked.forEach((a) => {
      a.alive = false;
      const c = centerOf(a);
      effects.push({ kind: "pop", x: c.x, y: c.y, n: a.n, vx: (Math.random() - 0.5) * 120, t0: now });
    });
    effects.push({ kind: "float", x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2, text: `+${picked.length}`, t0: now });
    return picked.length;
  }

  // --- 그리기 -----------------------------------------------------------------

  function drawApple(x, y, n, highlight) {
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
    ctx.fillText(String(n), x, y + 2);
  }

  // 사라지는 사과는 살짝 부풀었다가 떨어지며 흐려지고, +N 글자는 위로 떠오른다.
  function drawEffects(now) {
    effects = effects.filter((e) => now - e.t0 < (e.kind === "pop" ? POP_MS : e.kind === "float" ? FLOAT_MS : FLASH_MS));
    effects.forEach((e) => {
      const s = (now - e.t0) / 1000;
      ctx.save();
      if (e.kind === "pop") {
        const p = (now - e.t0) / POP_MS;
        const scale = p < 0.2 ? 1 + p : 1.2 - (p - 0.2) * 0.5;
        ctx.globalAlpha = 1 - p;
        ctx.translate(e.x + e.vx * s, e.y - 90 * s + 900 * s * s);
        ctx.scale(scale, scale);
        drawApple(0, 0, e.n, true);
      } else if (e.kind === "float") {
        const p = (now - e.t0) / FLOAT_MS;
        ctx.globalAlpha = 1 - p * p;
        ctx.fillStyle = "#4cc38a";
        ctx.font = '700 22px "Noto Sans KR", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(e.text, e.x, e.y - 36 * p);
      } else {
        ctx.globalAlpha = 1 - (now - e.t0) / FLASH_MS;
        ctx.strokeStyle = "#e5484d";
        ctx.lineWidth = 2;
        ctx.strokeRect(e.r.x1, e.r.y1, e.r.x2 - e.r.x1, e.r.y2 - e.r.y1);
      }
      ctx.restore();
    });
  }

  function draw(now) {
    ctx.fillStyle = "#0b1a2e";
    ctx.fillRect(0, 0, W, H);
    const r = dragRect();
    const picked = r ? inRect(r) : [];
    const pickedSet = new Set(picked);
    apples.forEach((a) => {
      if (!a.alive) return;
      const c = centerOf(a);
      drawApple(c.x, c.y, a.n, pickedSet.has(a));
    });

    if (r) {
      const sum = picked.reduce((s, a) => s + a.n, 0);
      ctx.fillStyle = sum === 10 ? "rgba(76, 195, 138, 0.18)" : "rgba(79, 125, 240, 0.14)";
      ctx.strokeStyle = sum === 10 ? "#4cc38a" : "#7d9cf5";
      ctx.lineWidth = 2;
      ctx.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      ctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      if (picked.length) {
        // 현재 합을 사각형 모서리에 작게 보여 준다
        const label = String(sum);
        ctx.font = '700 13px "Noto Sans KR", sans-serif';
        const w = ctx.measureText(label).width + 12;
        const lx = Math.min(r.x2 - w, W - w), ly = Math.max(r.y1 - 22, 0);
        ctx.fillStyle = sum === 10 ? "#4cc38a" : sum > 10 ? "#e5484d" : "#7d9cf5";
        ctx.fillRect(lx, ly, w, 20);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, lx + w / 2, ly + 11);
      }
    }

    drawEffects(now);
  }

  // 고해상도 화면에서 흐리지 않도록 캔버스 픽셀을 devicePixelRatio만큼 늘린다. 좌표계는 W×H 그대로다.
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    dirty = true;
  }

  // --- 진행 -------------------------------------------------------------------

  function updateStats() {
    $("score").textContent = score;
    $("best").textContent = Math.max(readBest(), score);
    updateTime();
  }

  function updateTime() {
    $("time").textContent = `${Math.ceil(timeLeft)}초`;
    const bar = $("timeBar");
    bar.style.width = `${(timeLeft / TIME_LIMIT) * 100}%`;
    bar.style.background = timeLeft <= 15 ? "#e5484d" : "";
  }

  function showOverlay(title, text, button, onClick) {
    overlay.innerHTML = `<div class="big">${title}</div><div class="small">${text}</div><button type="button" class="primary" id="startBtn">${button}</button>`;
    overlay.hidden = false;
    $("startBtn").addEventListener("click", onClick);
  }

  function start() {
    apples = newBoard();
    score = 0;
    timeLeft = TIME_LIMIT;
    drag = null;
    effects = [];
    state = "playing";
    overlay.hidden = true;
    last = performance.now();
    updateStats();
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    drag = null;
    showOverlay("일시정지", "화면을 벗어나 있는 동안 시간이 멈췄습니다.", "계속하기", resume);
  }

  function resume() {
    if (state !== "paused") return;
    state = "playing";
    overlay.hidden = true;
    last = performance.now();
  }

  function finish(reason) {
    if (state === "over") return;  // 점수는 한 판에 한 번만 올린다
    state = "over";
    drag = null;
    dirty = true;
    const best = readBest();
    if (score > best) saveBest(score);
    updateStats();
    const title = { cleared: "모두 없앴습니다!", stuck: "더 만들 수 있는 10이 없습니다", time: "시간 종료" }[reason];
    showOverlay(title, `사과 ${score}개${score > best ? " · 최고 기록!" : ""}`, "다시 하기", start);
    window.IBA.reportScore("apple", score, overlay);
  }

  // 화면 갱신 루프는 처음에 한 번만 띄운다. 다시 시작해도 루프가 겹치지 않는다.
  function frame(t) {
    if (state === "playing") {
      // rAF 시각이 start()의 performance.now()보다 이를 수 있어 음수를 막고, 멈칫한 프레임은 0.5초까지만 센다
      timeLeft -= Math.min(Math.max(t - last, 0) / 1000, 0.5);
      last = t;
      if (timeLeft <= 0) { timeLeft = 0; finish("time"); }
      else updateTime();
    }
    if (state === "playing" || drag || effects.length || dirty) {
      draw(performance.now());
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  function release() {
    const r = dragRect();
    drag = null;
    dirty = true;
    if (state !== "playing" || !r) return;
    const n = clearRect(r);
    if (!n) return;
    score += n;
    updateStats();
    if (apples.every((a) => !a.alive)) finish("cleared");
    else if (!hasMove(apples)) finish("stuck");
  }

  // --- 입력 -------------------------------------------------------------------
  // 포인터 캡처를 걸어 두면 캔버스 밖에서 마우스를 떼도 pointerup이 온다.

  function toCanvas(e) {
    const rect = cv.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W, y = ((e.clientY - rect.top) / rect.height) * H;
    return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
  }

  cv.addEventListener("pointerdown", (e) => {
    if (state !== "playing" || drag || e.button !== 0) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    drag = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y };
  });

  cv.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toCanvas(e);
    drag.x = p.x;
    drag.y = p.y;
  });

  cv.addEventListener("pointerup", (e) => { if (drag && e.pointerId === drag.id) release(); });
  // 포인터를 잃으면 판정 없이 드래그만 취소한다
  const cancelDrag = (e) => { if (drag && e.pointerId === drag.id) { drag = null; dirty = true; } };
  cv.addEventListener("pointercancel", cancelDrag);
  cv.addEventListener("lostpointercapture", cancelDrag);

  window.addEventListener("blur", () => { drag = null; dirty = true; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("resize", fitCanvas);

  $("restart").addEventListener("click", start);

  document.addEventListener("DOMContentLoaded", () => {
    fitCanvas();
    apples = newBoard();
    score = 0;
    timeLeft = TIME_LIMIT;
    updateStats();
    showOverlay("사과게임", "드래그로 사각형을 그려 안에 든 숫자 합을 10으로 만들면 사과가 사라집니다.", "시작하기", start);
    if (document.fonts) document.fonts.ready.then(() => { dirty = true; });
    requestAnimationFrame(frame);
    window.IBA.gameBoard("apple");
  });
})();
