// 블록깨기. 마우스나 방향키로 패들을 움직이고, 블록을 모두 깨면 공이 빨라진 다음 스테이지로 넘어간다.
(function () {
  const W = 640, H = 480;
  const COLS = 10, ROWS = 6, PAD = 24, GAP = 6, TOP = 64, BRICK_H = 18;
  const BRICK_W = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const ROW_COLORS = ["#ef6b6b", "#f29b4c", "#f2c94c", "#4cc38a", "#3ec7e0", "#4f7df0"];
  const PADDLE_W = 96, PADDLE_H = 12, PADDLE_Y = H - 36, PADDLE_SPEED = 520;
  const BALL_R = 7, START_SPEED = 340, MAX_BOUNCE = Math.PI / 3;
  const LIVES = 3;
  const BEST_KEY = "iba.best.blocks";

  const $ = (id) => document.getElementById(id);
  const cv = $("board"), ctx = cv.getContext("2d");
  const overlay = $("overlay");

  let bricks, paddleX, ball, speed, stuck, lives, stage, score, state = "ready", last;
  const held = { left: false, right: false };

  function readBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (_) {} }

  function buildBricks() {
    bricks = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        bricks.push({ x: PAD + c * (BRICK_W + GAP), y: TOP + r * (BRICK_H + GAP), row: r, alive: true });
      }
    }
  }

  function resetBall() {
    stuck = true;
    ball = { x: paddleX, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0 };
  }

  function launch() {
    if (!stuck || state !== "playing") return;
    stuck = false;
    const angle = (Math.random() - 0.5) * (Math.PI / 3);
    ball.vx = speed * Math.sin(angle);
    ball.vy = -speed * Math.cos(angle);
  }

  // 원과 사각형이 겹치는지
  function hits(b, x, y, w, h) {
    const cx = Math.max(x, Math.min(b.x, x + w));
    const cy = Math.max(y, Math.min(b.y, y + h));
    return (b.x - cx) ** 2 + (b.y - cy) ** 2 <= BALL_R ** 2;
  }

  function step(dt) {
    if (held.left) paddleX -= PADDLE_SPEED * dt;
    if (held.right) paddleX += PADDLE_SPEED * dt;
    paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, paddleX));

    if (stuck) { ball.x = paddleX; return; }

    // 한 프레임을 4px 이하 조각으로 나눠 움직여 블록을 뚫고 지나가지 않게 한다.
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    const n = Math.max(1, Math.ceil(dist / 4));
    for (let i = 0; i < n && state === "playing" && !stuck; i++) substep(dt / n);
  }

  function substep(dt) {
    const px = ball.x, py = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

    if (ball.y > H + BALL_R) {
      lives -= 1;
      updateStats();
      if (lives <= 0) gameOver(); else resetBall();
      return;
    }

    // 패들: 맞은 위치에 따라 튕기는 각도가 달라진다.
    const left = paddleX - PADDLE_W / 2;
    if (ball.vy > 0 && hits(ball, left, PADDLE_Y, PADDLE_W, PADDLE_H)) {
      const offset = Math.max(-1, Math.min(1, (ball.x - paddleX) / (PADDLE_W / 2)));
      const angle = offset * MAX_BOUNCE;
      ball.vx = speed * Math.sin(angle);
      ball.vy = -speed * Math.cos(angle);
      ball.y = PADDLE_Y - BALL_R;
      return;
    }

    const brick = bricks.find((b) => b.alive && hits(ball, b.x, b.y, BRICK_W, BRICK_H));
    if (!brick) return;
    brick.alive = false;
    score += (ROWS - brick.row) * 10;
    // 직전 위치가 블록의 좌우 바깥이었으면 옆면에 맞은 것이다.
    const fromSide = px + BALL_R <= brick.x || px - BALL_R >= brick.x + BRICK_W;
    if (fromSide) ball.vx = -ball.vx; else ball.vy = -ball.vy;
    ball.x = px; ball.y = py;
    updateStats();

    if (bricks.every((b) => !b.alive)) {
      stage += 1;
      speed *= 1.12;
      buildBricks();
      resetBall();
      updateStats();
    }
  }

  // --- 그리기 -----------------------------------------------------------------

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function draw() {
    ctx.fillStyle = "#0b1a2e";
    ctx.fillRect(0, 0, W, H);

    bricks.forEach((b) => {
      if (!b.alive) return;
      ctx.fillStyle = ROW_COLORS[b.row];
      roundRect(b.x, b.y, BRICK_W, BRICK_H, 4);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(b.x + 2, b.y + 2, BRICK_W - 4, 4);
    });

    ctx.fillStyle = "#e8eefc";
    roundRect(paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H, 6);

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    if (stuck && state === "playing") {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = '600 14px "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("스페이스나 클릭으로 공을 쏘세요", W / 2, H / 2 + 40);
    }
  }

  // --- 진행 -------------------------------------------------------------------

  function updateStats() {
    $("score").textContent = score.toLocaleString("ko-KR");
    $("lives").textContent = lives;
    $("stage").textContent = stage;
    $("best").textContent = Math.max(readBest(), score).toLocaleString("ko-KR");
  }

  function showOverlay(title, text, button) {
    overlay.innerHTML = `<div class="big">${title}</div><div class="small">${text}</div>${button ? `<button type="button" class="primary" id="startBtn">${button}</button>` : ""}`;
    overlay.hidden = false;
    const btn = $("startBtn");
    if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); start(); });
  }

  function start() {
    score = 0; lives = LIVES; stage = 1; speed = START_SPEED;
    paddleX = W / 2;
    buildBricks();
    resetBall();
    state = "playing";
    overlay.hidden = true;
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
    showOverlay("게임 오버", `${score.toLocaleString("ko-KR")}점 · ${stage}스테이지${score > best ? " · 최고 기록!" : ""}`, "다시 하기");
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
    const dt = Math.min((t - last) / 1000, 1 / 30);
    last = t;
    step(dt);
    draw();
    if (state === "playing") requestAnimationFrame(frame);
  }

  cv.addEventListener("mousemove", (e) => {
    if (state !== "playing") return;
    const rect = cv.getBoundingClientRect();
    paddleX = ((e.clientX - rect.left) / rect.width) * W;
  });
  cv.addEventListener("click", launch);

  const KEYS = { ArrowLeft: "left", ArrowRight: "right" };
  document.addEventListener("keydown", (e) => {
    if (state === "ready" || state === "over") {
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); start(); }
      return;
    }
    if (e.code === "KeyP") { setPaused(state === "playing"); return; }
    if (KEYS[e.code]) { e.preventDefault(); held[KEYS[e.code]] = true; }
    if (e.code === "Space") { e.preventDefault(); launch(); }
  });
  document.addEventListener("keyup", (e) => { if (KEYS[e.code]) held[KEYS[e.code]] = false; });

  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });

  document.addEventListener("DOMContentLoaded", () => {
    score = 0; lives = LIVES; stage = 1;
    paddleX = W / 2;
    buildBricks();
    resetBall();
    updateStats();
    draw();
    showOverlay("블록깨기", "공을 튕겨 블록을 모두 깨세요. 목숨은 3개입니다.", "시작하기");
  });
})();
