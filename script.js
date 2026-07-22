const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const background = new Image();
background.src = "images/warzone-bg.png";

const shipImage = new Image();
shipImage.src = "images/blue-angel.png";
let shipSprite = null;

const SHIP_FORWARD_ANGLE = 2.73;
const SHIP_SCALE = 0.3;
const SHIP_PULL = 10.5;
const SHIP_DRAG = 4.6;
const SHIP_MAX_SPEED = 1500;
const BULLET_SPEED = 1100;
const FIRE_INTERVAL = 85;
const BULLET_LIFE = 1600;
const SMOKE_INTERVAL = 22;
const SMOKE_LIFE = 900;

const pointer = {
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.6,
  active: false,
};

const ship = {
  x: pointer.x,
  y: pointer.y,
  vx: 0,
  vy: 0,
  angle: -SHIP_FORWARD_ANGLE,
  headingX: 1,
  headingY: 0,
  width: 670 * SHIP_SCALE,
  height: 344 * SHIP_SCALE,
};

const bullets = [];
const smoke = [];
const input = {
  mouseDown: false,
  spaceDown: false,
};

let lastFrameTime = performance.now();
let lastShotAt = 0;
let lastSmokeAt = 0;

function prepareShipSprite() {
  if (shipSprite || !shipImage.complete) {
    return;
  }

  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = shipImage.naturalWidth;
  spriteCanvas.height = shipImage.naturalHeight;

  const spriteContext = spriteCanvas.getContext("2d", { willReadFrequently: true });
  spriteContext.drawImage(shipImage, 0, 0);

  const imageData = spriteContext.getImageData(0, 0, spriteCanvas.width, spriteCanvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red + green + blue) / 3;
    const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);

    if (brightness > 244 && colorSpread < 18) {
      data[index + 3] = 0;
    }
  }

  spriteContext.putImageData(imageData, 0, 0);
  shipSprite = spriteCanvas;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setPointerPosition(clientX, clientY) {
  pointer.x = clamp(clientX, 0, canvas.width);
  pointer.y = clamp(clientY, 0, canvas.height);
  pointer.active = true;
}

function updateShip(deltaSeconds) {
  const towardPointerX = pointer.x - ship.x;
  const towardPointerY = pointer.y - ship.y;

  ship.vx += towardPointerX * SHIP_PULL * deltaSeconds;
  ship.vy += towardPointerY * SHIP_PULL * deltaSeconds;

  const dragFactor = Math.exp(-SHIP_DRAG * deltaSeconds);
  ship.vx *= dragFactor;
  ship.vy *= dragFactor;

  const speedBeforeClamp = Math.hypot(ship.vx, ship.vy);
  if (speedBeforeClamp > SHIP_MAX_SPEED) {
    const scale = SHIP_MAX_SPEED / speedBeforeClamp;
    ship.vx *= scale;
    ship.vy *= scale;
  }

  ship.x += ship.vx * deltaSeconds;
  ship.y += ship.vy * deltaSeconds;

  ship.x = clamp(ship.x, 0, canvas.width);
  ship.y = clamp(ship.y, 0, canvas.height);

  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > 5) {
    ship.headingX = ship.vx / speed;
    ship.headingY = ship.vy / speed;
    ship.angle = Math.atan2(ship.headingY, ship.headingX) - SHIP_FORWARD_ANGLE;
  }
}

function wantsToFire() {
  return input.mouseDown || input.spaceDown;
}

function spawnBullet(now) {
  const noseOffset = ship.width * 0.36;
  bullets.push({
    x: ship.x + ship.headingX * noseOffset,
    y: ship.y + ship.headingY * noseOffset,
    vx: ship.headingX * BULLET_SPEED,
    vy: ship.headingY * BULLET_SPEED,
    bornAt: now,
  });
}

function spawnSmoke(now) {
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed < 90) {
    return;
  }

  const perpendicularX = -ship.headingY;
  const perpendicularY = ship.headingX;
  const tailOffset = ship.width * 0.26;
  const sideDrift = (Math.random() - 0.5) * ship.height * 0.16;

  smoke.push({
    x: ship.x - ship.headingX * tailOffset + perpendicularX * sideDrift,
    y: ship.y - ship.headingY * tailOffset + perpendicularY * sideDrift,
    vx: -ship.headingX * (90 + Math.random() * 85) + (Math.random() - 0.5) * 70,
    vy: -ship.headingY * (90 + Math.random() * 85) + (Math.random() - 0.5) * 70,
    size: 12 + Math.random() * 10,
    bornAt: now,
  });
}

function updateBullets(deltaSeconds, now) {
  for (let index = bullets.length - 1; index >= 0; index -= 1) {
    const bullet = bullets[index];
    bullet.x += bullet.vx * deltaSeconds;
    bullet.y += bullet.vy * deltaSeconds;

    const expired = now - bullet.bornAt > BULLET_LIFE;
    const offscreen =
      bullet.x < -50 ||
      bullet.x > canvas.width + 50 ||
      bullet.y < -50 ||
      bullet.y > canvas.height + 50;

    if (expired || offscreen) {
      bullets.splice(index, 1);
    }
  }
}

function updateSmoke(deltaSeconds, now) {
  for (let index = smoke.length - 1; index >= 0; index -= 1) {
    const puff = smoke[index];
    puff.x += puff.vx * deltaSeconds;
    puff.y += puff.vy * deltaSeconds;
    puff.vx *= Math.exp(-1.4 * deltaSeconds);
    puff.vy *= Math.exp(-1.2 * deltaSeconds);
    puff.size += 28 * deltaSeconds;

    if (now - puff.bornAt > SMOKE_LIFE) {
      smoke.splice(index, 1);
    }
  }
}

function drawBackground() {
  const scale = Math.max(canvas.width / background.width, canvas.height / background.height);
  const drawWidth = background.width * scale;
  const drawHeight = background.height * scale;
  const offsetX = (canvas.width - drawWidth) * 0.5;
  const offsetY = (canvas.height - drawHeight) * 0.5;

  ctx.drawImage(background, offsetX, offsetY, drawWidth, drawHeight);

  const vignette = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.2,
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.7
  );
  vignette.addColorStop(0, "rgba(255, 166, 66, 0.05)");
  vignette.addColorStop(1, "rgba(10, 6, 6, 0.62)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawBullets() {
  for (const bullet of bullets) {
    const bulletSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
    const directionX = bullet.vx / bulletSpeed;
    const directionY = bullet.vy / bulletSpeed;
    const trailX = bullet.x - directionX * 22;
    const trailY = bullet.y - directionY * 22;

    const gradient = ctx.createLinearGradient(bullet.x, bullet.y, trailX, trailY);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(1, "rgba(255, 120, 34, 0)");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y);
    ctx.lineTo(trailX, trailY);
    ctx.stroke();

    ctx.fillStyle = "#ffe6a7";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSmoke(now) {
  for (const puff of smoke) {
    const age = (now - puff.bornAt) / SMOKE_LIFE;
    const opacity = Math.max(0, 0.52 * (1 - age));
    const gradient = ctx.createRadialGradient(
      puff.x,
      puff.y,
      puff.size * 0.15,
      puff.x,
      puff.y,
      puff.size
    );
    gradient.addColorStop(0, `rgba(242, 241, 233, ${opacity})`);
    gradient.addColorStop(0.45, `rgba(148, 154, 161, ${opacity * 0.75})`);
    gradient.addColorStop(1, "rgba(36, 40, 48, 0)");

    ctx.filter = "blur(2px)";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.filter = "none";
  }
}

function drawShip() {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.shadowColor = "rgba(30, 80, 255, 0.5)";
  ctx.shadowBlur = 22;
  ctx.drawImage(shipSprite, -ship.width * 0.5, -ship.height * 0.5, ship.width, ship.height);
  ctx.restore();
}

function drawAimPulse(now) {
  const pulse = 12 + Math.sin(now * 0.01) * 2;
  ctx.strokeStyle = "rgba(119, 184, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, pulse, 0, Math.PI * 2);
  ctx.stroke();
}

function gameLoop(now) {
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.033);
  lastFrameTime = now;

  if (!background.complete || !shipImage.complete) {
    requestAnimationFrame(gameLoop);
    return;
  }

  prepareShipSprite();
  if (!shipSprite) {
    requestAnimationFrame(gameLoop);
    return;
  }

  updateShip(deltaSeconds);

  if (now - lastSmokeAt >= SMOKE_INTERVAL) {
    spawnSmoke(now);
    lastSmokeAt = now;
  }

  if (wantsToFire() && now - lastShotAt >= FIRE_INTERVAL) {
    spawnBullet(now);
    lastShotAt = now;
  }

  updateBullets(deltaSeconds, now);
  updateSmoke(deltaSeconds, now);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawSmoke(now);
  drawBullets();
  drawAimPulse(now);
  drawShip();

  requestAnimationFrame(gameLoop);
}

window.addEventListener("resize", resizeCanvas);

window.addEventListener("mousemove", (event) => {
  setPointerPosition(event.clientX, event.clientY);
});

window.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }

  setPointerPosition(event.clientX, event.clientY);
  input.mouseDown = true;
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    input.mouseDown = false;
  }
});

window.addEventListener("mouseleave", () => {
  input.mouseDown = false;
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    input.spaceDown = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    input.spaceDown = false;
  }
});

resizeCanvas();
shipImage.addEventListener("load", prepareShipSprite);
requestAnimationFrame(gameLoop);