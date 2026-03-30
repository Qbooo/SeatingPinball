/**
 * pinball.js  ─  Space Cadet 스타일 핀볼 엔진 v2
 *
 * 개선사항
 *  - 끼임 방지: 최소속도 강제 + stuckTimer 킥
 *  - 장애물 대폭 추가 (범퍼 11개, 가이드 레일, 중앙 다이아몬드, 삼각 가이드)
 *  - 킥커 충돌 보강
 *  - 벽 반발력 개선
 */

const Pinball = (() => {
  let canvas, ctx;
  let W = 0, H = 0;
  let animId = null;
  let lastTime = 0;
  let speedMultiplier = 1.0;

  let balls     = [];
  let bumpers   = [];
  let segments  = [];
  let flippers  = [];
  let holes     = [];
  let particles = [];

  let onBallDrained = null;

  const GRAVITY   = 360;
  const MIN_SPEED = 90;   // 이 속도 이하면 stuckTimer 증가

  // ── 초기화 ──────────────────────────────────────────────
  function init(canvasEl, drainCallback) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    onBallDrained = drainCallback;
    resize();
  }

  function resize() {
    const c = canvas.parentElement;
    W = canvas.width  = c.clientWidth  || 800;
    H = canvas.height = c.clientHeight || 700;
    buildTable();
  }

  // ── 테이블 구성 ──────────────────────────────────────────
  function buildTable() {
    bumpers   = makeBumpers();
    segments  = makeSegments();
    flippers  = makeFlippers();
    holes     = makeHoles();
    particles = [];
  }

  /* ── 범퍼 11개 ──
      상단 5개 (아치형)
      중단 4개
      하단 2개 (좌우 대칭)
  */
  function makeBumpers() {
    const b = (x, y, r, force) => ({ x: W*x, y: H*y, r, force, flash: 0 });
    return [
      // 상단 아치 5개 — 벽에서 충분히 안쪽으로
      b(0.32, 0.13, 22, 660),
      b(0.43, 0.08, 22, 660),
      b(0.55, 0.13, 22, 660),
      b(0.66, 0.08, 22, 660),
      b(0.72, 0.13, 22, 660),
      // 중단 4개
      b(0.33, 0.26, 18, 560),
      b(0.44, 0.22, 18, 560),
      b(0.60, 0.22, 18, 560),
      b(0.70, 0.26, 18, 560),
      // 하단 2개
      b(0.38, 0.39, 15, 480),
      b(0.63, 0.39, 15, 480),
      // ── 중앙 추가 범퍼 1개 (중심부 체류 시간 늘리기)
      b(0.50, 0.32, 17, 520),
    ];
  }

  /* ── 세그먼트 설계 원칙 ──
      ① 천장(top wall) 제거 — 공이 위로 날아가도 낙하로 복귀
      ② 수직 벽 전부 제거 — 포켓 생성 원천 차단
      ③ 왼쪽/오른쪽 전체를 하나의 연속 대각선으로:
            상단 외벽(대각) → 킥커(대각) → 하단 경사(대각)
      ④ 어느 지점에서 맞아도 공이 중앙 방향으로 튕김
  */
  function makeSegments() {
    const s = (x1, y1, x2, y2, type='wall') =>
      ({ x1: W*x1, y1: H*y1, x2: W*x2, y2: H*y2, type, flash: 0 });

    return [
      // ── 왼쪽: 위→킥커 대각 (천장 없음, 수직 없음)
      s(0.04, 0.00, 0.09, 0.55, 'wall'),      // 외벽 상단 대각
      s(0.09, 0.55, 0.22, 0.72, 'kicker'),    // 킥커 대각
      s(0.22, 0.72, 0.25, 0.895, 'wall'),     // 하단 경사

      // ── 오른쪽: 위→킥커 대각 (미러)
      s(0.96, 0.00, 0.91, 0.55, 'wall'),      // 외벽 상단 대각
      s(0.91, 0.55, 0.78, 0.72, 'kicker'),    // 킥커 대각
      s(0.78, 0.72, 0.75, 0.895, 'wall'),     // 하단 경사

      // ── 플리퍼 안쪽 가이드
      s(0.22, 0.84, 0.27, 0.895, 'guide'),
      s(0.78, 0.84, 0.73, 0.895, 'guide'),

      // ── 중단 독립 대각 램프 (어디에도 연결 안 됨 — 포켓 불가)
      //    공이 아래로 떨어지다 맞으면 바깥쪽으로 튕김
      s(0.24, 0.36, 0.36, 0.46, 'guide'),     // 왼쪽 램프 (↘)
      s(0.76, 0.36, 0.64, 0.46, 'guide'),     // 오른쪽 램프 (↙)

      // ── 중앙 ^ 장애물 (역V, 꼭짓점이 위 — 포켓 절대 불가)
      //    꼭짓점이 위에 있으므로 중력에 의해 공이 좌우로 미끄러져 탈출
      s(0.38, 0.60, 0.50, 0.46, 'roof'),      // 왼쪽 사면 (↗)
      s(0.62, 0.60, 0.50, 0.46, 'roof'),      // 오른쪽 사면 (↖)
    ];
  }

  function makeFlippers() {
    const y = H * 0.90;
    return [
      { side:'left',  px: W*0.30, py: y, len: 90,
        angle: 0.42, upAngle: -0.44, downAngle: 0.42 },
      { side:'right', px: W*0.70, py: y, len: 90,
        angle: Math.PI-0.42, upAngle: Math.PI+0.44, downAngle: Math.PI-0.42 },
    ];
  }

  function makeHoles() {
    return [{ x: W*0.50, y: H*0.96, r: 24, flash: 0 }];
  }

  // ── 공 발사 ──────────────────────────────────────────────
  const BALL_COLORS = [
    '#e74c3c','#3498db','#2ecc71','#f39c12',
    '#9b59b6','#1abc9c','#e67e22','#ff6b9d','#00d4ff',
  ];
  let colorIdx = 0;

  function launchBall(name) {
    const col   = BALL_COLORS[colorIdx++ % BALL_COLORS.length];
    const angle = (Math.random() * 50 - 25) * Math.PI / 180;
    const speed = 480 + Math.random() * 160;
    balls.push({
      name,
      x: W * (0.3 + Math.random() * 0.4),
      y: H * 0.07,
      vx: Math.sin(angle) * speed,
      vy: speed * 0.3,
      r: 16,
      color: col,
      drained: false,
      flash: 0,
      trail: [],
      stuckTimer: 0,
    });
  }

  // ── 게임 루프 ────────────────────────────────────────────
  function start() {
    lastTime = performance.now();
    if (animId) cancelAnimationFrame(animId);
    loop(lastTime);
  }
  function stop() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }
  function setSpeed(mul) { speedMultiplier = mul; }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.04) * speedMultiplier;
    lastTime = now;
    update(dt);
    draw();
    animId = requestAnimationFrame(loop);
  }

  // ── 물리 업데이트 (서브스텝 5분할 → 빠른 공도 벽 통과 불가) ──
  const SUBSTEPS = 5;

  function update(dt) {
    updateFlippers(dt);
    updateParticles(dt);

    // 플래시 감쇠 (프레임당 1회)
    segments.forEach(s => { if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 5); });
    bumpers.forEach(p  => { if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 5); });
    holes.forEach(h    => { if (h.flash > 0) h.flash = Math.max(0, h.flash - dt * 3); });

    const subDt = dt / SUBSTEPS;

    balls.forEach(b => {
      if (b.drained) return;

      // 궤적 & 플래시 감쇠 (프레임당 1회)
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.shift();
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 4);

      // ── 서브스텝 루프 ──────────────────────────────────
      for (let step = 0; step < SUBSTEPS; step++) {
        if (b.drained) break;

        b.vy += GRAVITY * subDt;
        b.x  += b.vx * subDt;
        b.y  += b.vy * subDt;

        // 소프트 경계 (천장 없음, 좌우/하단 캔버스 경계만)
        if (b.y < b.r)     { b.y = b.r;     b.vy =  Math.abs(b.vy) * 0.65 + 60; }
        if (b.x < b.r)     { b.x = b.r;     b.vx =  Math.abs(b.vx) * 0.70; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.70; }

        segmentCollide(b);
        bumperCollide(b);
        flipperCollide(b);
        holeCheck(b);
      }

      // 끼임 방지 (서브스텝 후 속도 확인)
      if (!b.drained) {
        const spd = Math.hypot(b.vx, b.vy);
        if (spd < MIN_SPEED) {
          b.stuckTimer += dt;
          if (b.stuckTimer > 1.0) {
            const a = Math.random() * Math.PI * 2;
            b.vx = Math.cos(a) * 400;
            b.vy = Math.sin(a) * 400 - 240;
            b.stuckTimer = 0;
            spawnParticles(b.x, b.y, b.color, 5);
          }
        } else {
          b.stuckTimer = 0;
        }
      }
    });

    balls = balls.filter(b => !b.drained);
  }

  // 선분 충돌
  // ^ 장애물 판별: 두 guide 세그먼트 중 꼭짓점이 위(y가 작음)에 있는 것
  // → 공이 아래쪽(y가 큰 쪽)에서 진입 = 법선이 이미 위를 향함
  //   그냥 반사만 해도 위로 튕기므로 추가 boost 불필요
  //   단, 속도가 느리면 안에서 진동 가능 → 아래 stuckTimer 가 처리
  function segmentCollide(b) {
    segments.forEach(s => {
      const isKicker = s.type === 'kicker';
      const rest     = isKicker ? 0.92 : 0.76;
      const hit      = lineCollide(b, s.x1, s.y1, s.x2, s.y2, rest);
      if (hit && isKicker) {
        // 슬링샷 킥커: 중심에서 바깥 방향으로 강하게 발사
        const mx = (s.x1 + s.x2) * 0.5;
        const my = (s.y1 + s.y2) * 0.5;
        const dx = b.x - mx, dy = b.y - my;
        const l  = Math.hypot(dx, dy) || 1;
        const curSpd = Math.hypot(b.vx, b.vy);
        const boost  = Math.max(curSpd, 300) + 380;
        b.vx = (dx / l) * boost * 0.9;
        b.vy = (dy / l) * boost * 0.9 - 280;
        s.flash = 1;
        b.flash = 1;
        spawnParticles(b.x, b.y, '#ff6400', 10);
      }
    });
  }

  function lineCollide(b, x1, y1, x2, y2, restitution = 0.74) {
    const cp  = closestPt(x1, y1, x2, y2, b.x, b.y);
    const dx  = b.x - cp.x;
    const dy  = b.y - cp.y;
    const d   = Math.hypot(dx, dy);
    // 벽 두께 = 공 반지름 + 6px  (서브스텝과 함께 터널링 방지)
    const WALL_THICK = b.r + 6;
    if (d < WALL_THICK && d > 0.001) {
      const nx = dx / d, ny = dy / d;
      b.x = cp.x + nx * (WALL_THICK + 1);
      b.y = cp.y + ny * (WALL_THICK + 1);
      const dot = b.vx * nx + b.vy * ny;
      if (dot < 0) {
        b.vx = (b.vx - 2 * dot * nx) * restitution;
        b.vy = (b.vy - 2 * dot * ny) * restitution;
        const spd = Math.hypot(b.vx, b.vy);
        if (spd < 130) { b.vx *= 130 / spd; b.vy *= 130 / spd; }
      }
      return true;
    }
    return false;
  }

  // 범퍼 충돌
  function bumperCollide(b) {
    bumpers.forEach(p => {
      const dx   = b.x - p.x, dy = b.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < b.r + p.r + 1 && dist > 0.001) {
        const nx = dx / dist, ny = dy / dist;
        // 완전히 밀어내기
        b.x = p.x + nx * (b.r + p.r + 2);
        b.y = p.y + ny * (b.r + p.r + 2);
        // 최소 속도 보장 후 강하게 튕기기
        const curSpd = Math.hypot(b.vx, b.vy);
        const newSpd = Math.max(curSpd, 280) + 200;
        b.vx = nx * newSpd;
        b.vy = ny * newSpd;
        b.flash = 1;
        p.flash = 1;
        spawnParticles(b.x, b.y, '#ffe100', 7);
      }
    });
  }

  // 플리퍼 자동 제어
  function updateFlippers(dt) {
    flippers.forEach(f => {
      const raise = balls.some(b => {
        const dx = b.x - f.px, dy = b.y - f.py;
        if (f.side === 'left')
          return dx > -28 && dx < f.len * 1.4 && dy > -H * 0.16 && dy < 32;
        else
          return dx > -f.len * 1.4 && dx < 28  && dy > -H * 0.16 && dy < 32;
      });
      const target = raise ? f.upAngle : f.downAngle;
      f.angle += (target - f.angle) * Math.min(dt * 22, 1);
    });
  }

  function flipperCollide(b) {
    flippers.forEach(f => {
      const ex  = f.px + Math.cos(f.angle) * f.len;
      const ey  = f.py + Math.sin(f.angle) * f.len;
      const hit = lineCollide(b, f.px, f.py, ex, ey, 0.82);
      if (hit) {
        const rising = (f.side === 'left'  && f.angle < f.downAngle) ||
                       (f.side === 'right' && f.angle > f.downAngle);
        if (rising) {
          b.vy -= 220;
          b.vx += (f.side === 'left' ? 1 : -1) * 90;
        }
      }
    });
  }

  // 구멍 체크
  function holeCheck(b) {
    holes.forEach(h => {
      if (Math.hypot(b.x - h.x, b.y - h.y) < h.r + b.r * 0.4) {
        b.drained = true;
        h.flash   = 1;
        spawnParticles(h.x, h.y, b.color, 18);
        if (onBallDrained) onBallDrained(b.name);
      }
    });
    if (b.y > H + 50) {
      b.drained = true;
      if (onBallDrained) onBallDrained(b.name);
    }
  }

  // ── 파티클 ──────────────────────────────────────────────
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 230;
      particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
                       life: 1, color, r: 1.5 + Math.random() * 3.5 });
    }
  }
  function updateParticles(dt) {
    particles.forEach(p => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 180 * dt; p.life -= dt * 2.8;
    });
    particles = particles.filter(p => p.life > 0);
  }

  function closestPt(ax, ay, bx, by, px, py) {
    const abx = bx-ax, aby = by-ay;
    const l2  = abx*abx + aby*aby;
    if (l2 === 0) return { x: ax, y: ay };
    const t = Math.max(0, Math.min(1, ((px-ax)*abx + (py-ay)*aby) / l2));
    return { x: ax + t*abx, y: ay + t*aby };
  }

  // ── 렌더링 ───────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBg();
    drawSegments();
    drawHoles();
    drawBumpers();
    drawFlippers();
    drawParticles();
    drawBalls();
  }

  function drawBg() {
    // 배경 그라디언트
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#05050f');
    grad.addColorStop(1, '#0a0820');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 격자
    ctx.strokeStyle = 'rgba(0,212,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 48) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }

    // 외곽 네온 — 천장(top)은 그리지 않음, 좌/우/하단만
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth   = 3;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.lineTo(3, H - 3);       // 왼쪽
    ctx.lineTo(W - 3, H - 3);   // 하단
    ctx.lineTo(W - 3, 3);       // 오른쪽
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawSegments() {
    segments.forEach(s => {
      const f = s.flash || 0;
      let color, width, blur;
      if (s.type === 'kicker') {
        color = f > 0 ? `rgb(255,${140+f*115|0},0)` : '#ff6d00';
        width = 12; blur = f > 0 ? 28 : 10;
      } else if (s.type === 'roof') {
        // ^ 장애물 — 연두색으로 구분, 두껍게
        color = '#39ff14';
        width = 7; blur = 10;
      } else if (s.type === 'guide') {
        color = '#1a7aaa';
        width = 5; blur = 6;
      } else {
        color = '#00d4ff';
        width = 8; blur = 8;   // 외벽 두껍게
      }
      ctx.strokeStyle = color;
      ctx.lineWidth   = width;
      ctx.lineCap     = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur  = blur;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  function drawHoles() {
    holes.forEach(h => {
      const f = h.flash || 0;
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r*3.5);
      g.addColorStop(0, `rgba(255,${80+f*175|0},0,${0.4+f*0.5})`);
      g.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r*3.5, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI*2); ctx.fill();

      ctx.strokeStyle = f > 0 ? '#ffaa00' : '#ff6d00';
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#ff6d00';
      ctx.shadowBlur  = 16;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur  = 0;

      ctx.fillStyle = 'rgba(255,109,0,0.65)';
      ctx.font      = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DRAIN', h.x, h.y + h.r + 15);
    });
  }

  function drawBumpers() {
    bumpers.forEach(p => {
      const f = p.flash || 0;
      ctx.shadowColor = f > 0 ? '#fff' : '#ffe100';
      ctx.shadowBlur  = 10 + f * 26;
      ctx.strokeStyle = f > 0 ? '#ffffff' : '#ffe100';
      ctx.lineWidth   = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.stroke();

      const gr = ctx.createRadialGradient(p.x-p.r*0.3, p.y-p.r*0.3, 0, p.x, p.y, p.r);
      gr.addColorStop(0, f > 0 ? '#fff'    : '#ffe86e');
      gr.addColorStop(1, f > 0 ? '#ff8800' : '#b07a05');
      ctx.fillStyle  = gr;
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = f > 0 ? '#fff' : '#ffe100';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r*0.32, 0, Math.PI*2); ctx.fill();
    });
  }

  function drawFlippers() {
    flippers.forEach(f => {
      const ex = f.px + Math.cos(f.angle) * f.len;
      const ey = f.py + Math.sin(f.angle) * f.len;

      ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 20;
      ctx.strokeStyle = '#00d4ff'; ctx.lineWidth  = 14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(ex, ey); ctx.stroke();

      ctx.shadowBlur  = 0;
      ctx.strokeStyle = '#bbefff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(ex, ey); ctx.stroke();
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life * 0.9);
      ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.fillStyle   = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  function drawBalls() {
    balls.forEach(b => {
      if (b.drained) return;

      // 궤적
      b.trail.forEach((pt, i) => {
        ctx.globalAlpha = (i / b.trail.length) * 0.30;
        ctx.fillStyle   = b.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, b.r * (i / b.trail.length) * 0.62, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath(); ctx.ellipse(b.x+3, b.y+5, b.r, b.r*0.5, 0, 0, Math.PI*2); ctx.fill();

      // 공
      const glow = b.flash > 0 ? '#ffffff' : b.color;
      ctx.shadowColor = glow;
      ctx.shadowBlur  = b.flash > 0 ? 40 : 14;

      const gr = ctx.createRadialGradient(b.x-b.r*0.34, b.y-b.r*0.34, 0, b.x, b.y, b.r);
      gr.addColorStop(0, b.flash > 0 ? '#fff' : lighten(b.color, 0.46));
      gr.addColorStop(1, b.flash > 0 ? b.color : darken(b.color, 0.36));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;

      // 하이라이트
      ctx.fillStyle = 'rgba(255,255,255,0.50)';
      ctx.beginPath(); ctx.arc(b.x-b.r*0.3, b.y-b.r*0.32, b.r*0.29, 0, Math.PI*2); ctx.fill();

      // 이름 라벨
      const lx = b.x + b.r + 9, ly = b.y + 6;
      ctx.font      = 'bold 18px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left';
      ctx.lineWidth   = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.88)';
      ctx.strokeText(b.name, lx, ly);
      ctx.fillStyle   = '#ffffff';
      ctx.fillText(b.name, lx, ly);
    });
  }

  function lighten(hex, t) {
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return `rgb(${Math.min(255,r+t*255)|0},${Math.min(255,g+t*255)|0},${Math.min(255,b+t*255)|0})`;
  }
  function darken(hex, t) {
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return `rgb(${Math.max(0,r-t*255)|0},${Math.max(0,g-t*255)|0},${Math.max(0,b-t*255)|0})`;
  }

  return { init, start, stop, launchBall, resize, buildTable, setSpeed };
})();
