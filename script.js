/* ===== OVERLAY + MENÚ HAMBURGUESA ===== */
const burger = document.querySelector('.header__burger');
const nav = document.querySelector('.header__nav');

// crear overlay sólo si no existe
let overlay = document.querySelector('.header__overlay');
if (!overlay) {
  overlay = document.createElement('div');
  overlay.className = 'header__overlay';
  document.body.appendChild(overlay);
}

// funciones de abrir / cerrar
function openNav() {
  if (burger) burger.classList.add('header__burger--active');
  if (nav) nav.classList.add('header__nav--active');
  if (overlay) overlay.classList.add('header__overlay--active');
  document.body.classList.add('no-scroll');
}
function closeNav() {
  if (burger) burger.classList.remove('header__burger--active');
  if (nav) nav.classList.remove('header__nav--active');
  if (overlay) overlay.classList.remove('header__overlay--active');
  document.body.classList.remove('no-scroll');
}

// toggle del burger
if (burger) {
  burger.addEventListener('click', () => {
    if (nav && nav.classList.contains('header__nav--active')) closeNav();
    else openNav();
  });
}

// cerrar si tocan overlay
if (overlay) overlay.addEventListener('click', closeNav);
// cerrar al pulsar un link (útil en móvil)
document.querySelectorAll('.header__nav a').forEach(a => a.addEventListener('click', closeNav));


/* ===== PONG GAME ===== */
// elementos canvas y contexto
const canvas = document.getElementById("pong");
const ctx = canvas ? canvas.getContext("2d") : null;
if (!canvas || !ctx) {
  console.warn("Canvas o contexto 2D no encontrado. El juego no puede inicializarse correctamente.");
}

/* --- Resize dinámico --- */
function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  // usamos el tamaño que tenga el canvas por CSS (client rect)
  const newW = Math.max(1, Math.round(rect.width || 600));
  const newH = Math.max(1, Math.round(rect.height || 400));
  canvas.width = newW;
  canvas.height = newH;

  // Recalcular posiciones relativas al nuevo tamaño (mantener centrado)
  player.x = 0;
  player.y = clamp(canvas.height / 2 - player.h / 2, 0, canvas.height - player.h);
  ai.x = canvas.width - player.w;
  ai.y = clamp(canvas.height / 2 - ai.h / 2, 0, canvas.height - ai.h);
  ball.x = canvas.width / 2;
  ball.y = canvas.height / 2;
}
window.addEventListener('load', resizeCanvas);
window.addEventListener('resize', resizeCanvas);

// utilidad clamp
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ===== PROPIEDADES DEL JUEGO ===== */
const paddleHeight = 80;
const paddleWidth = 10;

const player = { x: 0, y: 0, w: paddleWidth, h: paddleHeight, dy: 8, score: 0 };
const ai =     { x: 0, y: 0, w: paddleWidth, h: paddleHeight, dy: 6, score: 0 };
const ball =   { x: 0, y: 0, r: 7, speed: 4, dx: 4, dy: 3 };

resizeCanvas(); // inicializa posiciones

const scoreDisplay = document.getElementById("score");
const playerScoreInput = document.getElementById("playerScore");


/* ===== AJUSTES IA =====
   errorMargin: píxeles de imprecisión
   reactionTime: ms entre actualización del objetivo
   missChance: probabilidad de fallo cuando la bola está muy cerca
*/
const aiSettings = {
  errorMargin: 60,
  reactionTime: 120,
  missChance: 0.10,
  speedFactor: 1.0
};

let lastAiReaction = 0;
let aiTargetY = ai.y + ai.h / 2;
let aiLastMissTime = 0;


/* ===== DIBUJOS ===== */
function drawRect(x, y, w, h, color) {
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function drawCircle(x, y, r, color) {
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}


/* ===== CONTROLES USUARIO ===== */
// teclado H (arriba) y B (abajo)
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "h") player.y -= player.dy;
  if (key === "b") player.y += player.dy;
  if (canvas) player.y = clamp(player.y, 0, canvas.height - player.h);
});

// mouse mueve la paleta del jugador
if (canvas) {
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    player.y = e.clientY - rect.top - player.h / 2;
    player.y = clamp(player.y, 0, canvas.height - player.h);
  });

  // touch (móviles)
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    player.y = e.touches[0].clientY - rect.top - player.h / 2;
    player.y = clamp(player.y, 0, canvas.height - player.h);
  }, { passive: false });
}


/* ===== FÍSICA: COLISIONES y REBOTES ===== */
// AABB vs círculo (simple)
function collision(b, p) {
  return b.x - b.r < p.x + p.w &&
         b.x + b.r > p.x &&
         b.y - b.r < p.y + p.h &&
         b.y + b.r > p.y;
}

// ajuste de ángulo según punto de impacto (paddle)
function handlePaddleCollision(paddle) {
  const relativeY = (ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
  const clamped = clamp(relativeY, -1, 1);

  const speedBefore = Math.hypot(ball.dx, ball.dy);
  ball.speed = Math.min(10, speedBefore * 1.06);

  const toRight = (paddle === player);
  // definimos dx con magnitud ball.speed (en unidades "por frame a 60fps")
  ball.dx = (toRight ? 1 : -1) * Math.abs(ball.speed);
  // dy proporcional al impacto
  ball.dy = clamped * ball.speed * 0.9;
}


/* ===== IA: objetivo, reacción y movimiento (no perfecta) ===== */
// ahora acepta deltaMs para escalar movimiento según tiempo
function updateAI(deltaMs = 16.6667) {
  if (!canvas) return;
  const now = Date.now();

  if (ball.dx > 0) { // bola acercándose a IA
    if (now - lastAiReaction > aiSettings.reactionTime) {
      const offset = (Math.random() * 2 - 1) * aiSettings.errorMargin;
      aiTargetY = clamp(ball.y + offset, ai.h / 2, canvas.height - ai.h / 2);
      lastAiReaction = now;

      const closeToAi = ball.x > canvas.width - 120;
      if (closeToAi && Math.random() < aiSettings.missChance) {
        const missOffset = (Math.random() > 0.5 ? 1 : -1) * (ai.h * 0.7 + Math.random() * aiSettings.errorMargin);
        aiTargetY = clamp(ball.y + missOffset, ai.h / 2, canvas.height - ai.h / 2);
        aiLastMissTime = now;
      }
    }
  } else { // bola va hacia el jugador
    if (now - lastAiReaction > aiSettings.reactionTime) {
      aiTargetY = canvas.height / 2;
      lastAiReaction = now;
    }
  }

  // mover IA hacia aiTargetY, escalando por delta
  const f = deltaMs / (1000/60); // factor relativo a 60fps
  const aiCenter = ai.y + ai.h / 2;
  const diff = aiTargetY - aiCenter;
  const step = Math.sign(diff) * Math.min(Math.abs(diff), ai.dy * aiSettings.speedFactor * f);
  ai.y += step;

  // límites
  ai.y = clamp(ai.y, 0, canvas.height - ai.h);
}


/* ===== RESET BOLA ===== */
function resetBall() {
  if (!canvas) return;
  ball.x = canvas.width / 2;
  ball.y = canvas.height / 2;
  ball.speed = 4;
  const angle = (Math.random() * 0.6) - 0.3; // -0.3..0.3 radians approx
  const dir = Math.random() > 0.5 ? 1 : -1;
  ball.dx = dir * Math.abs(ball.speed * Math.cos(angle));
  ball.dy = ball.speed * Math.sin(angle);
}


/* ===== UPDATE (usa deltaMs) ===== */
function update(deltaMs) {
  if (!canvas) return;
  // factor respecto a 60fps (16.666... ms)
  const f = deltaMs / (1000/60);

  // mover bola escalando por tiempo
  ball.x += ball.dx * f;
  ball.y += ball.dy * f;

  // rebote superior/inferior
  if (ball.y + ball.r > canvas.height) {
    ball.y = canvas.height - ball.r;
    ball.dy *= -1;
  }
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.dy *= -1;
  }

  // actualizar IA pasando delta
  updateAI(deltaMs);

  // colisión con jugador
  if (collision(ball, player)) {
    handlePaddleCollision(player);
    ball.x = player.x + player.w + ball.r + 0.5;
  }

  // colisión con IA (ten cuidado con la ventana de "fallo" que definimos)
  if (collision(ball, ai)) {
    const now = Date.now();
    const justMissed = (now - aiLastMissTime) < 800;
    if (justMissed && Math.random() < 0.8) {
      // falla: no rebotar, empujar la bola fuera para evitar retrigger
      ball.x = ai.x - ball.r - 0.5;
    } else {
      handlePaddleCollision(ai);
      ball.x = ai.x - ball.r - 0.5;
    }
  }

  // puntos
  if (ball.x - ball.r < 0) {
    ai.score++;
    resetBall();
  }
  if (ball.x + ball.r > canvas.width) {
    player.score++;
    resetBall();
  }

  // actualizar displays
  if (scoreDisplay) scoreDisplay.textContent = `Jugador ${player.score} - ${ai.score} Amadeus`;
  if (playerScoreInput) playerScoreInput.value = player.score;
}


/* ===== RENDER ===== */
function render() {
  if (!ctx || !canvas) return;
  // fondo
  drawRect(0, 0, canvas.width, canvas.height, "#000");
  // paletas
  drawRect(player.x, player.y, player.w, player.h, "#fff");
  drawRect(ai.x, ai.y, ai.w, ai.h, "#fff");
  // bola
  drawCircle(ball.x, ball.y, ball.r, "#fff");
}


/* ===== LOOP PRINCIPAL con requestAnimationFrame (delta-safe) ===== */
let paused = false;
let lastTs = null;
let rafId = null;

function loop(ts) {
  if (!lastTs) lastTs = ts;
  // limitar delta para evitar saltos enormes cuando la pestaña vuelve del background
  const delta = Math.min(40, ts - lastTs);
  lastTs = ts;

  if (!paused) {
    update(delta);
    render();
  } else {
    // opcional: se podría dibujar un overlay de pausa aquí
  }

  rafId = requestAnimationFrame(loop);
}

// arrancar loop
rafId = requestAnimationFrame(loop);


/* ===== BOTÓN DE PAUSA (encima del canvas) ===== */
// Intentamos obtener un botón existente (#pauseBtn). Si no existe, lo creamos y lo posicionamos.
let pauseBtn = document.getElementById('pauseBtn');
(function ensurePauseButton() {
  const wrapper = document.querySelector('.game__wrapper') || document.body;
  // aseguramos que wrapper tenga position: relative para posicion absoluta del botón
  const compStyle = window.getComputedStyle(wrapper);
  if (compStyle.position === 'static' || !compStyle.position) {
    wrapper.style.position = wrapper.style.position || 'relative';
  }

  if (!pauseBtn) {
    pauseBtn = document.createElement('button');
    pauseBtn.id = 'pauseBtn';
    pauseBtn.type = 'button';
    pauseBtn.className = 'pause-button';
    pauseBtn.textContent = '⏸️';
    // insertarlo como primer hijo para que quede encima del canvas
    wrapper.insertBefore(pauseBtn, wrapper.firstChild);
  }

  // toggle pausa al click
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶️' : '⏸️';
    // si pausas, no cancelamos RAF; solo detenemos actualización/render dentro del loop
  });

  // opcional: tecla P para pausar
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') {
      paused = !paused;
      if (pauseBtn) pauseBtn.textContent = paused ? '▶️' : '⏸️';
    }
  });
}());


/* ===== SISTEMA DE PUNTAJES (TOP 15, sin duplicados) ===== */
const form = document.getElementById("playerForm");
const tableBody = document.querySelector("#scoreTable tbody");

function getStoredScores() {
  return JSON.parse(localStorage.getItem('scores')) || [];
}
function saveStoredScores(arr) {
  localStorage.setItem('scores', JSON.stringify(arr));
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderScoreTable() {
  if (!tableBody) return;
  const scores = getStoredScores();
  // ordenar desc por score; desempatar por timestamp asc
  scores.sort((a, b) => Number(b.score) - Number(a.score) || (a.ts || 0) - (b.ts || 0));
  tableBody.innerHTML = '';
  for (const s of scores) {
    const name = escapeHtml(s.name);
    const score = Number(s.score);
    const row = `<tr><td>${name}</td><td>${score}</td></tr>`;
    tableBody.insertAdjacentHTML('beforeend', row);
  }
}

function addScore(name, score, maxEntries = 15) {
  const trimmedName = (name || 'Anon').trim();
  const sc = Number(score || 0);

  // evitamos puntajes 0 o inválidos
  if (sc <= 0) return false;

  const scores = getStoredScores();
  scores.push({ name: trimmedName, score: sc, ts: Date.now() });

  // ordenar por score desc y timestamp asc
  scores.sort((a, b) => Number(b.score) - Number(a.score) || (a.ts || 0) - (b.ts || 0));3

  // eliminar duplicados exactos (mismo nombre + mismo score)
  const seen = new Set();
  const dedup = [];
  for (const s of scores) {
    const key = `${s.name}|${s.score}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(s);
    }
  }

  // limitar top N
  const top = dedup.slice(0, maxEntries);
  saveStoredScores(top);
  renderScoreTable();
  return true;
}

// renderizar al cargar la página
document.addEventListener('DOMContentLoaded', renderScoreTable);

// handler del form
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('playerName');
    const name = (nameInput && nameInput.value) ? nameInput.value :







