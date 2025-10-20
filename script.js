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

// toggles
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
const canvas = document.getElementById("pong");
const ctx = canvas ? canvas.getContext("2d") : null;

/* defensas tempranas */
if (!canvas || !ctx) {
  console.warn("Canvas o contexto 2D no encontrado. El juego no puede inicializarse.");
}

/* --- Resize dinámico --- */
function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
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

// --- Utilidades ---
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ===== Propiedades del juego ===== */
const paddleHeight = 80;
const paddleWidth = 10;

// objetos
const player = { x: 0, y: 0, w: paddleWidth, h: paddleHeight, dy: 8, score: 0 };
const ai =     { x: 0, y: 0, w: paddleWidth, h: paddleHeight, dy: 6, score: 0 }; // ai.dy es su velocidad de desplazamiento
const ball =   { x: 0, y: 0, r: 7, speed: 4, dx: 4, dy: 3 };

resizeCanvas(); // inicial

const scoreDisplay = document.getElementById("score");
const playerScoreInput = document.getElementById("playerScore");

/* ===== AJUSTES DE LA IA ===== */
const aiSettings = {
  errorMargin: 60,     // más alto = más inexacto
  reactionTime: 120,   // ms (mayor = reacción más lenta)
  missChance: 0.10,    // 0.10 = 10% de fallar en situaciones cercanas
  speedFactor: 1.0     // multiplicador de ai.dy
};

let lastAiReaction = 0;
let aiTargetY = ai.y + ai.h / 2; // centro objetivo de la paleta
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
// teclado: H arriba, B abajo (se mueve paso a paso)
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "h") player.y -= player.dy;
  if (key === "b") player.y += player.dy;
  // límites
  if (canvas) player.y = clamp(player.y, 0, canvas.height - player.h);
});

// mouse: puntero mueve el centro de la paleta del jugador
if (canvas) {
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    player.y = e.clientY - rect.top - player.h / 2;
    player.y = clamp(player.y, 0, canvas.height - player.h);
  });

  // touch (móvil)
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    player.y = e.touches[0].clientY - rect.top - player.h / 2;
    player.y = clamp(player.y, 0, canvas.height - player.h);
  }, { passive: false });
}

/* ===== FÍSICA: COLISIONES + REBOTE MÁS REALISTA ===== */
// detección AABB con círculo (simple)
function collision(b, p) {
  return b.x - b.r < p.x + p.w &&
         b.x + b.r > p.x &&
         b.y - b.r < p.y + p.h &&
         b.y + b.r > p.y;
}

// manejar colisión con paleta y ajustar ángulo según punto de impacto
function handlePaddleCollision(paddle) {
  // punto relativo (-1..1)
  const relativeY = (ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
  const clamped = clamp(relativeY, -1, 1);

  const speedBefore = Math.hypot(ball.dx, ball.dy);
  ball.speed = Math.min(10, speedBefore * 1.06);

  const toRight = (paddle === player);

  // establecer dx con magnitud ball.speed y signo adecuado
  ball.dx = (toRight ? 1 : -1) * Math.abs(ball.speed);

  // ajustar dy proporcional al impacto
  ball.dy = clamped * ball.speed * 0.9;
}

/* ===== IA: objetivo, reacción y movimiento (no perfecta) ===== */
function updateAI() {
  if (!canvas) return;
  const now = Date.now();

  // Si la bola se dirige hacia la IA (dx > 0), actualizamos el objetivo con latencia
  if (ball.dx > 0) {
    if (now - lastAiReaction > aiSettings.reactionTime) {
      // offset aleatorio dentro del margen de error
      const offset = (Math.random() * 2 - 1) * aiSettings.errorMargin;
      aiTargetY = clamp(ball.y + offset, ai.h / 2, canvas.height - ai.h / 2);
      lastAiReaction = now;

      // posibilidad de "fallar" si la bola está cerca
      const closeToAi = ball.x > canvas.width - 120;
      if (closeToAi && Math.random() < aiSettings.missChance) {
        const missOffset = (Math.random() > 0.5 ? 1 : -1) * (ai.h * 0.7 + Math.random() * aiSettings.errorMargin);
        aiTargetY = clamp(ball.y + missOffset, ai.h / 2, canvas.height - ai.h / 2);
        aiLastMissTime = now;
      }
    }
  } else {
    // bola va hacia el jugador: la IA vuelve al centro lentamente
    if (now - lastAiReaction > aiSettings.reactionTime) {
      aiTargetY = canvas.height / 2;
      lastAiReaction = now;
    }
  }

  // mover IA hacia aiTargetY (apuntar al centro de la paleta)
  const aiCenter = ai.y + ai.h / 2;
  const diff = aiTargetY - aiCenter;
  const step = Math.sign(diff) * Math.min(Math.abs(diff), ai.dy * aiSettings.speedFactor);
  ai.y += step;

  // límites
  ai.y = clamp(ai.y, 0, canvas.height - ai.h);
}

/* ===== UPDATE / RENDER / LOOP ===== */
function resetBall() {
  if (!canvas) return;
  ball.x = canvas.width / 2;
  ball.y = canvas.height / 2;
  ball.speed = 4;
  const angle = (Math.random() * 0.6) - 0.3; // -0.3..0.3
  const dir = Math.random() > 0.5 ? 1 : -1;
  ball.dx = dir * Math.abs(ball.speed * Math.cos(angle));
  ball.dy = ball.speed * Math.sin(angle);
}

function update() {
  if (!canvas) return;

  // Movimiento bola
  ball.x += ball.dx;
  ball.y += ball.dy;

  // Rebote superior/inferior
  if (ball.y + ball.r > canvas.height) {
    ball.y = canvas.height - ball.r;
    ball.dy *= -1;
  }
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.dy *= -1;
  }

  // Actualizar IA
  updateAI();

  // Colisiones con paletas
  if (collision(ball, player)) {
    handlePaddleCollision(player);
    ball.x = player.x + player.w + ball.r + 0.5;
  }

  if (collision(ball, ai)) {
    const now = Date.now();
    const justMissed = (now - aiLastMissTime) < 800;
    if (justMissed && Math.random() < 0.8) {
      // la IA falla intencionalmente: no rebotar
      ball.x = ai.x - ball.r - 0.5;
    } else {
      handlePaddleCollision(ai);
      ball.x = ai.x - ball.r - 0.5;
    }
  }

  // Puntos
  if (ball.x - ball.r < 0) {
    ai.score++;
    resetBall();
  }
  if (ball.x + ball.r > canvas.width) {
    player.score++;
    resetBall();
  }

  // Mostrar puntaje
  if (scoreDisplay) scoreDisplay.textContent = `Jugador ${player.score} - ${ai.score} Amadeus`;
  if (playerScoreInput) playerScoreInput.value = player.score;
}

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

/* game loop */
function game() {
  update();
  render();
}
const fps = 60;
setInterval(game, 1000 / fps);


/* ===== SISTEMA DE PAUSA ===== */
let paused = false;
const pauseBtn = document.getElementById("pauseBtn");

if (pauseBtn) {
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "▶️" : "⏸️";
  });
}

// reescribir el bucle de juego para respetar el estado de pausa
function game() {
  if (!paused) {
    update();
    render();
  }
}
setInterval(game, 1000 / fps);



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
  // Orden descendente por score, y por timestamp ascendente para desempates
  scores.sort((a, b) => Number(b.score) - Number(a.score) || (a.ts || 0) - (b.ts || 0));
  tableBody.innerHTML = '';
  for (const s of scores) {
    const name = escapeHtml(s.name);
    const score = Number(s.score);
    const row = `<tr><td>${name}</td><td>${score}</td></tr>`;
    tableBody.insertAdjacentHTML('beforeend', row);
  }
}

// utilidad para añadir score con deduplicado + top N
function addScore(name, score, maxEntries = 15) {
  const trimmedName = (name || 'Anon').trim();
  const sc = Number(score || 0);

  // opcional: evita guardar puntajes 0 para no ensuciar la tabla
  if (sc <= 0) return false;

  const scores = getStoredScores();
  scores.push({ name: trimmedName, score: sc, ts: Date.now() });

  // ordenar
  scores.sort((a, b) => Number(b.score) - Number(a.score) || (a.ts || 0) - (b.ts || 0));

  // eliminar duplicados exactos (mismo name y mismo score), manteniendo el primero (mejor orden)
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

// limpiar puntajes (útil para desarrollo o correr desde consola)
// localStorage.removeItem('scores');

// renderizar al cargar
document.addEventListener('DOMContentLoaded', renderScoreTable);

// handler del form (reemplaza tu handler anterior)
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('playerName');
    const name = (nameInput && nameInput.value) ? nameInput.value : 'Anon';
    const score = Number(player.score || 0);

    const added = addScore(name, score, 15);
    if (!added) {
      // opcional: feedback si no se guardó por ser 0
      // alert('No hay puntaje válido para guardar (debe ser > 0).');
    } else {
      // limpiar campo nombre 
      if (nameInput) nameInput.value = '';
      if (playerScoreInput) playerScoreInput.value = score;
    }
  });
  //localStorage.removeItem('scores');
  //renderScoreTable();  guardadito,
}





