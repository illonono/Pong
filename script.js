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
  burger.classList.add('header__burger--active');
  nav.classList.add('header__nav--active');
  overlay.classList.add('header__overlay--active');
  document.body.classList.add('no-scroll');
}
function closeNav() {
  burger.classList.remove('header__burger--active');
  nav.classList.remove('header__nav--active');
  overlay.classList.remove('header__overlay--active');
  document.body.classList.remove('no-scroll');
}

// toggles
burger.addEventListener('click', () => {
  if (nav.classList.contains('header__nav--active')) closeNav();
  else openNav();
});
// cerrar si tocan overlay
overlay.addEventListener('click', closeNav);
// cerrar al pulsar un link (útil en móvil)
document.querySelectorAll('.header__nav a').forEach(a => a.addEventListener('click', closeNav));


/* ===== PONG GAME ===== */
const canvas = document.getElementById("pong");
const ctx = canvas.getContext("2d");

// --- Resize dinámico ---
function resizeCanvas() {
  // el CSS controla el ancho; tomamos clientWidth/clientHeight y lo pasamos al canvas
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

// --- Propiedades del juego ---
const paddleHeight = 80;
const paddleWidth = 10;

// objetos
const player = { x: 0, y: 0, w: paddleWidth, h: paddleHeight, dy: 8, score: 0 };
const ai =     { x: 0, y: 0, w: paddleWidth, h: paddleHeight, dy: 6, score: 0 }; // ai.dy es su velocidad de desplazamiento
const ball =   { x: 0, y: 0, r: 7, speed: 4, dx: 4, dy: 3 };

resizeCanvas(); // inicial

const scoreDisplay = document.getElementById("score");
const playerScoreInput = document.getElementById("playerScore");

/* ===== AJUSTES DE LA IA (tweak para dificultad) =====
   errorMargin: píxeles del offset aleatorio
   reactionTime: ms entre actualizaciones de objetivo
   missChance: probabilidad de fallo (0..1) cuando la pelota está cerca
*/
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
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function drawCircle(x, y, r, color) {
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
  player.y = clamp(player.y, 0, canvas.height - player.h);
});

// mouse: puntero mueve el centro de la paleta del jugador
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
  // limita
  const clamped = clamp(relativeY, -1, 1);

  // max bounce angle no decimal; usamos clamped para modificar dy
  // invierte dx y ajusta dy
  const speedBefore = Math.hypot(ball.dx, ball.dy);
  // aumentar la velocidad ligeramente cada colisión (máx 10)
  ball.speed = Math.min(10, speedBefore * 1.06);

  // dirección horizontal: si colisiona con player la bola debe ir a la derecha, si con ai a la izquierda
  const toRight = (paddle === player);

  // establecer dx con magnitud ball.speed y signo adecuado
  ball.dx = (toRight ? 1 : -1) * Math.abs(ball.speed);

  // ajustar dy proporcional al impacto (multiplicador para sensación arcade)
  ball.dy = clamped * ball.speed * 0.9;
}


/* ===== IA: objetivo, reacción y movimiento (no perfecta) ===== */
function updateAI(deltaMs) {
  // sólo actualizamos objetivo cuando la bola va hacia la IA
  const now = Date.now();

  // Si la bola se dirige hacia la IA (dx > 0), actualizamos el objetivo con latencia
  if (ball.dx > 0) {
    if (now - lastAiReaction > aiSettings.reactionTime) {
      // offset aleatorio dentro del margen de error
      const offset = (Math.random() * 2 - 1) * aiSettings.errorMargin;
      aiTargetY = clamp(ball.y + offset, ai.h / 2, canvas.height - ai.h / 2);
      lastAiReaction = now;

      // pequeño comportamiento aleatorio: si la bola está muy cerca, posibilidad de "fallar"
      const closeToAi = ball.x > canvas.width - 120; // umbral
      if (closeToAi && Math.random() < aiSettings.missChance) {
        // forzar un "error": objetivo desplazado lejos (causa que falle)
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
  ball.x = canvas.width / 2;
  ball.y = canvas.height / 2;
  // inicio con velocidad y dirección alternada
  ball.speed = 4;
  const angle = (Math.random() * 0.6) - 0.3; // pequeño ángulo inicial -0.3..0.3
  const dir = Math.random() > 0.5 ? 1 : -1;
  ball.dx = dir * Math.abs(ball.speed * Math.cos(angle));
  ball.dy = ball.speed * Math.sin(angle);
}

function update() {
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

  // IA seguimiento "exacto pero humano" ya hecho en updateAI()

  // Colisiones con paletas (mejor manejo)
  // comprobar colisión con jugador
  if (collision(ball, player)) {
    handlePaddleCollision(player);
    // empujar la bola fuera de la paleta para evitar múltiples colisiones seguidas
    ball.x = player.x + player.w + ball.r + 0.5;
  }

  // comprobar colisión con IA
  if (collision(ball, ai)) {
    // si la IA acaba de "fallar" por diseño reciente, permitimos que la bola pase
    const now = Date.now();
    const justMissed = (now - aiLastMissTime) < 800; // ventana en la que la IA falló
    if (justMissed && Math.random() < 0.8) {
      // dejar pasar (no rebotar): empujar la bola para que atraviese ligeramente
      ball.x = ai.x - ball.r - 0.5;
      // no cambiamos dx/dy -> la máquina falla
    } else {
      // respuesta normal
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
  scoreDisplay.textContent = `Jugador ${player.score} - ${ai.score} Amadeus`;
  if (playerScoreInput) playerScoreInput.value = player.score;
}

function render() {
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

/* ===== GUARDAR PUNTAJE ===== */
const form = document.getElementById("playerForm");
const tableBody = document.querySelector("#scoreTable tbody");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("playerName").value || "Anon";
    const score = player.score;
    const row = `<tr><td>${name}</td><td>${score}</td></tr>`;
    tableBody.insertAdjacentHTML("beforeend", row);

    const scores = JSON.parse(localStorage.getItem("scores")) || [];
    scores.push({ name, score });
    localStorage.setItem("scores", JSON.stringify(scores));
    // opcional: limpiar nombre
    // document.getElementById("playerName").value = "";
  });
}

