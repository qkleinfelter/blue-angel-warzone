const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const body = document.body;
const gameInfo = document.getElementById("game-info");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlay-kicker");
const overlayTitle = document.getElementById("overlay-title");
const overlayCopy = document.getElementById("overlay-copy");
const overlayStats = document.getElementById("overlay-stats");
const overlayButton = document.getElementById("overlay-button");

const background = new Image();
background.src = "images/warzone-bg.png";

const shipImage = new Image();
shipImage.src = "images/blue-angel.png";

const fighterEnemyImage = new Image();
fighterEnemyImage.src = "images/fighter-jet-enemy.png";

const helicopterEnemyImage = new Image();
helicopterEnemyImage.src = "images/helicopter-enemy.png";

const SHIP_FORWARD_ANGLE = 2.73;
const SHIP_PULL = 10.5;
const SHIP_DRAG = 4.6;
const SHIP_MAX_SPEED = 1500;
const SHIP_MAX_HEALTH = 5;
const PLAYER_BULLET_SPEED = 1100;
const PLAYER_FIRE_INTERVAL = 85;
const ENEMY_BULLET_SPEED = 520;
const ENEMY_BULLET_LIFE = 2400;
const PLAYER_BULLET_LIFE = 1600;
const SMOKE_INTERVAL = 42;
const SMOKE_LIFE = 520;
const ENEMY_SPAWN_INTERVAL = 1900;
const MAX_ENEMIES = 5;
const ROUND_LENGTH = 30000;
const PLAYER_HIT_COOLDOWN = 420;
const HIT_SPARK_LIFE = 180;
const DEATH_SMOKE_LIFE = 950;
const MAX_SMOKE_PARTICLES = 55;
const MAX_SPARK_PARTICLES = 140;

const sprites = {
  player: null,
  fighter: null,
  helicopter: null,
};

const enemyTypes = {
  fighter: {
    key: "fighter",
    image: fighterEnemyImage,
    health: 5,
    speed: 205,
    fireInterval: 1750,
    bulletDamage: 1,
    angleOffset: Math.PI / 2,
    width: 150,
  },
  helicopter: {
    key: "helicopter",
    image: helicopterEnemyImage,
    health: 3,
    speed: 160,
    fireInterval: 2200,
    bulletDamage: 1,
    angleOffset: 0,
    width: 170,
  },
};

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
  width: 202,
  height: 104,
  health: SHIP_MAX_HEALTH,
  alive: true,
  hitFlashUntil: 0,
  invulnerableUntil: 0,
};

const playerBullets = [];
const enemyBullets = [];
const smoke = [];
const enemies = [];
const sparks = [];
const input = {
  mouseDown: false,
  spaceDown: false,
};

const gameState = {
  startedAt: null,
  ended: false,
  won: false,
  started: false,
  score: 0,
  kills: 0,
  multiplier: 1,
  overlayMode: "start",
};

let lastFrameTime = performance.now();
let lastPlayerShotAt = 0;
let lastSmokeAt = 0;
let lastEnemySpawnAt = 0;

function createProcessedSprite(image, options = {}) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;

  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0);

  const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const { data } = imageData;

  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = 0;
  let maxY = 0;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];
    const brightness = (red + green + blue) / 3;
    const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);

    const removeWhite = options.dropWhite && brightness > 244 && colorSpread < 18;
    const removeBlack =
      options.dropBlack && red <= options.dropBlack && green <= options.dropBlack && blue <= options.dropBlack;

    if (removeWhite || removeBlack) {
      data[index + 3] = 0;
      continue;
    }

    if (alpha > 0) {
      const pixelIndex = index / 4;
      const x = pixelIndex % sourceCanvas.width;
      const y = Math.floor(pixelIndex / sourceCanvas.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  sourceContext.putImageData(imageData, 0, 0);

  if (minX > maxX || minY > maxY) {
    return sourceCanvas;
  }

  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = maxX - minX + 1;
  trimmedCanvas.height = maxY - minY + 1;
  const trimmedContext = trimmedCanvas.getContext("2d");
  trimmedContext.drawImage(
    sourceCanvas,
    minX,
    minY,
    trimmedCanvas.width,
    trimmedCanvas.height,
    0,
    0,
    trimmedCanvas.width,
    trimmedCanvas.height
  );

  return trimmedCanvas;
}

function prepareSprites() {
  if (!sprites.player && shipImage.complete) {
    sprites.player = createProcessedSprite(shipImage, { dropWhite: true });
    ship.width = 202;
    ship.height = (sprites.player.height / sprites.player.width) * ship.width;
  }

  if (!sprites.fighter && fighterEnemyImage.complete) {
    sprites.fighter = createProcessedSprite(fighterEnemyImage, { dropBlack: 3 });
  }

  if (!sprites.helicopter && helicopterEnemyImage.complete) {
    sprites.helicopter = createProcessedSprite(helicopterEnemyImage, { dropWhite: true });
  }
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

function getTimeRemaining(now) {
  if (gameState.startedAt === null) {
    return ROUND_LENGTH;
  }

  return Math.max(0, ROUND_LENGTH - (now - gameState.startedAt));
}

function isRoundActive(now) {
  return gameState.started && !gameState.ended && getTimeRemaining(now) > 0 && ship.alive;
}

function setBodyState(stateName) {
  body.classList.remove("is-start", "is-running", "is-ended");
  body.classList.add(stateName);
}

function updateOverlay() {
  const nextMode = !gameState.started ? "start" : gameState.ended ? "ended" : "running";
  if (gameState.overlayMode === nextMode) {
    return;
  }

  gameState.overlayMode = nextMode;

  if (nextMode === "start") {
    gameInfo.hidden = false;
    overlay.hidden = false;
    overlay.classList.add("is-visible");
    overlayKicker.textContent = "SCUFFED AIR SUPERIORITY";
    overlayTitle.textContent = "BLUE ANGEL WARZONE";
    overlayCopy.textContent =
      "Survive for 30 seconds, smoke the enemy birds, and do not let them land five hits.";
    overlayStats.textContent = "Fighters take 5 hits. Helicopters take 3.";
    overlayButton.textContent = "START SCRAP";
    setBodyState("is-start");
    return;
  }

  if (nextMode === "running") {
    gameInfo.hidden = true;
    overlay.classList.remove("is-visible");
    overlay.hidden = true;
    setBodyState("is-running");
    return;
  }

  gameInfo.hidden = false;
  overlay.hidden = false;
  overlay.classList.add("is-visible");
  overlayKicker.textContent = gameState.won ? "TIME SURVIVED" : "MISSION FAILED";
  overlayTitle.textContent = gameState.won ? "YOU LASTED 30 SECONDS" : "SHOT OUT OF THE SKY";
  overlayCopy.textContent = gameState.won
    ? "The bird stayed airborne. Hit restart if you want another ugly miracle."
    : "The sky won that one. Restart and spray harder next round.";
  overlayStats.textContent = `Score ${gameState.score} | Kills ${gameState.kills} | Multiplier ${gameState.multiplier.toFixed(1)}x`;
  overlayButton.textContent = "RESTART SCRAP";
  setBodyState("is-ended");
}

function resetGame() {
  ship.x = canvas.width * 0.5;
  ship.y = canvas.height * 0.62;
  ship.vx = 0;
  ship.vy = 0;
  ship.angle = -SHIP_FORWARD_ANGLE;
  ship.headingX = 1;
  ship.headingY = 0;
  ship.health = SHIP_MAX_HEALTH;
  ship.alive = true;
  ship.hitFlashUntil = 0;
  ship.invulnerableUntil = 0;

  pointer.x = ship.x;
  pointer.y = ship.y;

  playerBullets.length = 0;
  enemyBullets.length = 0;
  smoke.length = 0;
  sparks.length = 0;
  enemies.length = 0;

  input.mouseDown = false;
  input.spaceDown = false;

  gameState.startedAt = performance.now();
  gameState.ended = false;
  gameState.won = false;
  gameState.started = true;
  gameState.score = 0;
  gameState.kills = 0;
  gameState.multiplier = 1;
  gameState.overlayMode = "start";

  lastPlayerShotAt = 0;
  lastSmokeAt = 0;
  lastEnemySpawnAt = performance.now();
  updateOverlay();
}

function updateShip(deltaSeconds, now) {
  if (!ship.alive) {
    ship.vx *= Math.exp(-6 * deltaSeconds);
    ship.vy *= Math.exp(-6 * deltaSeconds);
    ship.x += ship.vx * deltaSeconds;
    ship.y += ship.vy * deltaSeconds;
    return;
  }

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

  ship.x = clamp(ship.x, ship.width * 0.3, canvas.width - ship.width * 0.3);
  ship.y = clamp(ship.y, ship.height * 0.3, canvas.height - ship.height * 0.3);

  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > 5) {
    ship.headingX = ship.vx / speed;
    ship.headingY = ship.vy / speed;
    ship.angle = Math.atan2(ship.headingY, ship.headingX) - SHIP_FORWARD_ANGLE;
  }

  if (ship.hitFlashUntil < now) {
    ship.hitFlashUntil = 0;
  }
}

function wantsToFire() {
  return input.mouseDown || input.spaceDown;
}

function spawnPlayerBullet(now) {
  const noseOffset = ship.width * 0.36;
  playerBullets.push({
    x: ship.x + ship.headingX * noseOffset,
    y: ship.y + ship.headingY * noseOffset,
    vx: ship.headingX * PLAYER_BULLET_SPEED,
    vy: ship.headingY * PLAYER_BULLET_SPEED,
    bornAt: now,
    radius: 8,
    color: "rgba(255, 255, 255, 0.95)",
    tailColor: "rgba(255, 120, 34, 0)",
  });
}

function spawnEnemyBullet(enemy, now) {
  const toShipX = ship.x - enemy.x;
  const toShipY = ship.y - enemy.y;
  const distance = Math.hypot(toShipX, toShipY) || 1;
  const directionX = toShipX / distance;
  const directionY = toShipY / distance;
  const muzzleOffset = enemy.width * 0.3;

  enemyBullets.push({
    x: enemy.x + directionX * muzzleOffset,
    y: enemy.y + directionY * muzzleOffset,
    vx: directionX * ENEMY_BULLET_SPEED,
    vy: directionY * ENEMY_BULLET_SPEED,
    bornAt: now,
    radius: 10,
    damage: enemy.bulletDamage,
    color: "rgba(255, 92, 92, 0.92)",
    tailColor: "rgba(255, 158, 56, 0)",
  });
}

function spawnSmoke(now) {
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed < 180 || !ship.alive) {
    return;
  }

  const perpendicularX = -ship.headingY;
  const perpendicularY = ship.headingX;
  const tailOffset = ship.width * 0.26;
  const sideDrift = (Math.random() - 0.5) * ship.height * 0.16;

  smoke.push({
    x: ship.x - ship.headingX * tailOffset + perpendicularX * sideDrift,
    y: ship.y - ship.headingY * tailOffset + perpendicularY * sideDrift,
    vx: -ship.headingX * (65 + Math.random() * 55) + (Math.random() - 0.5) * 34,
    vy: -ship.headingY * (65 + Math.random() * 55) + (Math.random() - 0.5) * 34,
    size: 7 + Math.random() * 5,
    bornAt: now,
  });

  if (smoke.length > MAX_SMOKE_PARTICLES) {
    smoke.splice(0, smoke.length - MAX_SMOKE_PARTICLES);
  }
}

function spawnHitSparks(x, y, directionX, directionY, isDeath = false) {
  const count = isDeath ? 18 : 7;
  const baseSize = isDeath ? 16 : 6;
  const life = isDeath ? 420 : HIT_SPARK_LIFE;

  for (let index = 0; index < count; index += 1) {
    const spread = isDeath ? Math.PI * 2 : 0.9;
    const baseAngle = Math.atan2(directionY || 0, directionX || 1);
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const speed = (isDeath ? 130 : 90) + Math.random() * (isDeath ? 180 : 110);
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: baseSize + Math.random() * baseSize,
      bornAt: performance.now(),
      life,
      red: isDeath ? 255 : 255,
      green: isDeath ? 168 : 236,
      blue: isDeath ? 82 : 183,
    });
  }

  if (sparks.length > MAX_SPARK_PARTICLES) {
    sparks.splice(0, sparks.length - MAX_SPARK_PARTICLES);
  }
}

function spawnDeathSmoke(x, y, sourceVx, sourceVy) {
  for (let index = 0; index < 8; index += 1) {
    smoke.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 14,
      vx: sourceVx * 0.1 + (Math.random() - 0.5) * 110,
      vy: sourceVy * 0.1 + (Math.random() - 0.5) * 110,
      size: 12 + Math.random() * 10,
      bornAt: performance.now(),
      life: DEATH_SMOKE_LIFE + Math.random() * 220,
    });
  }

  if (smoke.length > MAX_SMOKE_PARTICLES) {
    smoke.splice(0, smoke.length - MAX_SMOKE_PARTICLES);
  }
}

function createEnemy(typeKey, now) {
  const type = enemyTypes[typeKey];
  const sprite = sprites[type.key];
  const aspectRatio = sprite.height / sprite.width;
  const side = Math.floor(Math.random() * 4);
  const margin = 120;

  let x = 0;
  let y = 0;

  if (side === 0) {
    x = -margin;
    y = Math.random() * canvas.height;
  } else if (side === 1) {
    x = canvas.width + margin;
    y = Math.random() * canvas.height;
  } else if (side === 2) {
    x = Math.random() * canvas.width;
    y = -margin;
  } else {
    x = Math.random() * canvas.width;
    y = canvas.height + margin;
  }

  return {
    type: type.key,
    x,
    y,
    vx: 0,
    vy: 0,
    width: type.width,
    height: type.width * aspectRatio,
    angle: 0,
    angleOffset: type.angleOffset,
    speed: type.speed,
    health: type.health,
    maxHealth: type.health,
    fireInterval: type.fireInterval,
    bulletDamage: type.bulletDamage,
    nextShotAt: now + 900 + Math.random() * 1400,
    sprite,
    hitFlashUntil: 0,
    orbitDirection: Math.random() < 0.5 ? -1 : 1,
    orbitStrength: 0.35 + Math.random() * 0.45,
    strafeTimer: 600 + Math.random() * 850,
    strafeDirection: Math.random() < 0.5 ? -1 : 1,
  };
}

function spawnEnemy(now) {
  if (enemies.length >= MAX_ENEMIES) {
    return;
  }

  const typeKey = Math.random() < 0.55 ? "helicopter" : "fighter";
  enemies.push(createEnemy(typeKey, now));
}

function updateEnemyMotion(enemy, deltaSeconds) {
  const toShipX = ship.x - enemy.x;
  const toShipY = ship.y - enemy.y;
  const distance = Math.hypot(toShipX, toShipY) || 1;
  const directionX = toShipX / distance;
  const directionY = toShipY / distance;
  const tangentX = -directionY * enemy.orbitDirection;
  const tangentY = directionX * enemy.orbitDirection;

  enemy.strafeTimer -= deltaSeconds * 1000;
  if (enemy.strafeTimer <= 0) {
    enemy.strafeDirection *= -1;
    enemy.strafeTimer = 650 + Math.random() * 950;
  }

  const orbitBlend = distance > 330 ? enemy.orbitStrength * 0.45 : enemy.orbitStrength;
  const retreatFactor = distance < 220 ? -0.28 : distance > 420 ? 1 : 0.22;
  const desiredDirX = directionX * retreatFactor + tangentX * orbitBlend * enemy.strafeDirection;
  const desiredDirY = directionY * retreatFactor + tangentY * orbitBlend * enemy.strafeDirection;
  const desiredDirLength = Math.hypot(desiredDirX, desiredDirY) || 1;
  const desiredSpeed = enemy.speed;
  const desiredVx = (desiredDirX / desiredDirLength) * desiredSpeed;
  const desiredVy = (desiredDirY / desiredDirLength) * desiredSpeed;
  const steering = 2.5;

  enemy.vx += (desiredVx - enemy.vx) * steering * deltaSeconds;
  enemy.vy += (desiredVy - enemy.vy) * steering * deltaSeconds;
  enemy.x += enemy.vx * deltaSeconds;
  enemy.y += enemy.vy * deltaSeconds;
  enemy.angle = Math.atan2(enemy.vy, enemy.vx) + enemy.angleOffset;
}

function updateEnemies(deltaSeconds, now) {
  for (let index = enemies.length - 1; index >= 0; index -= 1) {
    const enemy = enemies[index];
    updateEnemyMotion(enemy, deltaSeconds);

    if (enemy.hitFlashUntil < now) {
      enemy.hitFlashUntil = 0;
    }

    if (ship.alive && now >= enemy.nextShotAt && !gameState.ended) {
      spawnEnemyBullet(enemy, now);
      enemy.nextShotAt = now + enemy.fireInterval + Math.random() * 800;
    }

    const tooFarAway =
      enemy.x < -220 ||
      enemy.x > canvas.width + 220 ||
      enemy.y < -220 ||
      enemy.y > canvas.height + 220;

    if (enemy.health <= 0 || tooFarAway) {
      if (enemy.health <= 0) {
        gameState.score += enemy.type === "fighter" ? 150 : 100;
      }
      enemies.splice(index, 1);
    }
  }
}

function updateProjectiles(projectiles, deltaSeconds, now, maxLife) {
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index];
    projectile.x += projectile.vx * deltaSeconds;
    projectile.y += projectile.vy * deltaSeconds;

    const expired = now - projectile.bornAt > maxLife;
    const offscreen =
      projectile.x < -70 ||
      projectile.x > canvas.width + 70 ||
      projectile.y < -70 ||
      projectile.y > canvas.height + 70;

    if (expired || offscreen) {
      projectiles.splice(index, 1);
    }
  }
}

function updateSmoke(deltaSeconds, now) {
  for (let index = smoke.length - 1; index >= 0; index -= 1) {
    const puff = smoke[index];
    puff.x += puff.vx * deltaSeconds;
    puff.y += puff.vy * deltaSeconds;
    puff.vx *= Math.exp(-2.6 * deltaSeconds);
    puff.vy *= Math.exp(-2.2 * deltaSeconds);
    puff.size += 12 * deltaSeconds;

    if (now - puff.bornAt > (puff.life || SMOKE_LIFE)) {
      smoke.splice(index, 1);
    }
  }
}

function updateSparks(deltaSeconds, now) {
  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    const spark = sparks[index];
    spark.x += spark.vx * deltaSeconds;
    spark.y += spark.vy * deltaSeconds;
    spark.vx *= Math.exp(-5.5 * deltaSeconds);
    spark.vy *= Math.exp(-5.1 * deltaSeconds);
    spark.size *= Math.exp(-2.4 * deltaSeconds);

    if (now - spark.bornAt > spark.life) {
      sparks.splice(index, 1);
    }
  }
}

function intersectsCircle(targetX, targetY, radius, projectile) {
  return Math.hypot(projectile.x - targetX, projectile.y - targetY) <= radius + projectile.radius;
}

function handleCollisions(now) {
  for (let bulletIndex = playerBullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
    const bullet = playerBullets[bulletIndex];
    let hitEnemy = false;

    for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = enemies[enemyIndex];
      const radius = Math.max(enemy.width, enemy.height) * 0.24;
      if (!intersectsCircle(enemy.x, enemy.y, radius, bullet)) {
        continue;
      }

      enemy.health -= 1;
      enemy.hitFlashUntil = now + 80;
      spawnHitSparks(bullet.x, bullet.y, bullet.vx, bullet.vy);
      playerBullets.splice(bulletIndex, 1);

      if (enemy.health <= 0) {
        gameState.kills += 1;
        gameState.multiplier = 1 + gameState.kills * 0.1;
        spawnHitSparks(enemy.x, enemy.y, bullet.vx, bullet.vy, true);
        spawnDeathSmoke(enemy.x, enemy.y, enemy.vx, enemy.vy);
      }

      hitEnemy = true;
      break;
    }

    if (hitEnemy) {
      continue;
    }
  }

  if (!ship.alive) {
    return;
  }

  for (let bulletIndex = enemyBullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
    const bullet = enemyBullets[bulletIndex];
    const radius = Math.max(ship.width, ship.height) * 0.2;
    if (!intersectsCircle(ship.x, ship.y, radius, bullet)) {
      continue;
    }

    if (now < ship.invulnerableUntil) {
      enemyBullets.splice(bulletIndex, 1);
      continue;
    }

    ship.health = Math.max(0, ship.health - bullet.damage);
    ship.hitFlashUntil = now + 130;
    ship.invulnerableUntil = now + PLAYER_HIT_COOLDOWN;
    spawnHitSparks(bullet.x, bullet.y, bullet.vx, bullet.vy);
    enemyBullets.splice(bulletIndex, 1);

    if (ship.health === 0) {
      ship.alive = false;
      gameState.ended = true;
      gameState.won = false;
      spawnHitSparks(ship.x, ship.y, ship.vx, ship.vy, true);
      spawnDeathSmoke(ship.x, ship.y, ship.vx, ship.vy);
      break;
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

function drawProjectiles(projectiles) {
  for (const projectile of projectiles) {
    const projectileSpeed = Math.hypot(projectile.vx, projectile.vy) || 1;
    const directionX = projectile.vx / projectileSpeed;
    const directionY = projectile.vy / projectileSpeed;
    const trailX = projectile.x - directionX * 22;
    const trailY = projectile.y - directionY * 22;

    const gradient = ctx.createLinearGradient(projectile.x, projectile.y, trailX, trailY);
    gradient.addColorStop(0, projectile.color);
    gradient.addColorStop(1, projectile.tailColor);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(projectile.x, projectile.y);
    ctx.lineTo(trailX, trailY);
    ctx.stroke();

    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSmoke(now) {
  for (const puff of smoke) {
    const age = (now - puff.bornAt) / (puff.life || SMOKE_LIFE);
    const opacity = Math.max(0, 0.22 * (1 - age));
    ctx.fillStyle = `rgba(182, 186, 192, ${opacity})`;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSparks(now) {
  for (const spark of sparks) {
    const age = (now - spark.bornAt) / spark.life;
    const opacity = Math.max(0, 1 - age);
    ctx.strokeStyle = `rgba(${spark.red}, ${spark.green}, ${spark.blue}, ${opacity})`;
    ctx.lineWidth = Math.max(1.2, spark.size * 0.24);
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(spark.x - spark.vx * 0.02, spark.y - spark.vy * 0.02);
    ctx.stroke();
  }
}

function drawEnemy(enemy, now) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.angle);
  ctx.shadowColor = enemy.type === "fighter" ? "rgba(255, 70, 70, 0.38)" : "rgba(140, 255, 155, 0.28)";
  ctx.shadowBlur = 16;

  if (enemy.hitFlashUntil > now) {
    ctx.globalAlpha = 0.7;
  }

  ctx.drawImage(enemy.sprite, -enemy.width * 0.5, -enemy.height * 0.5, enemy.width, enemy.height);
  ctx.restore();

  const barWidth = enemy.width * 0.58;
  const barX = enemy.x - barWidth * 0.5;
  const barY = enemy.y - enemy.height * 0.46;
  ctx.fillStyle = "rgba(15, 15, 18, 0.68)";
  ctx.fillRect(barX, barY, barWidth, 6);
  ctx.fillStyle = enemy.type === "fighter" ? "#ff6c6c" : "#9bff8b";
  ctx.fillRect(barX, barY, barWidth * (enemy.health / enemy.maxHealth), 6);
}

function drawShip(now) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.shadowColor = ship.hitFlashUntil > now ? "rgba(255, 90, 90, 0.85)" : "rgba(30, 80, 255, 0.5)";
  ctx.shadowBlur = ship.hitFlashUntil > now ? 30 : 22;
  ctx.globalAlpha = ship.alive ? 1 : 0.68;
  ctx.drawImage(sprites.player, -ship.width * 0.5, -ship.height * 0.5, ship.width, ship.height);
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

function drawHud(now) {
  const healthBarWidth = 220;
  const healthBarHeight = 16;
  const padding = 24;
  const timeRemaining = getTimeRemaining(now);
  const secondsRemaining = Math.ceil(timeRemaining / 1000);
  const healthRatio = ship.health / SHIP_MAX_HEALTH;

  ctx.save();
  ctx.fillStyle = "rgba(13, 12, 14, 0.7)";
  ctx.fillRect(canvas.width - 290, 24, 250, 98);

  ctx.fillStyle = "#f4e8d2";
  ctx.font = "700 14px 'Space Grotesk', sans-serif";
  ctx.fillText("HULL", canvas.width - 266, 48);

  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(canvas.width - 266, 58, healthBarWidth, healthBarHeight);
  ctx.fillStyle = healthRatio > 0.4 ? "#79e082" : "#ff6c6c";
  ctx.fillRect(canvas.width - 266, 58, healthBarWidth * healthRatio, healthBarHeight);

  ctx.fillStyle = "#f4e8d2";
  ctx.fillText(`TIME ${String(secondsRemaining).padStart(2, "0")}s`, canvas.width - 266, 98);
  ctx.fillText(`KILLS ${gameState.kills}`, canvas.width - 266, 118);
  ctx.fillText(`X${gameState.multiplier.toFixed(1)}`, canvas.width - 186, 118);
  ctx.fillText(`SCORE ${gameState.score}`, canvas.width - 148, 98);
  ctx.restore();

  if (!gameState.started || (!gameState.ended && timeRemaining > 0)) {
    return;
  }
}

function updateGameState(now) {
  if (!gameState.started) {
    updateOverlay();
    return;
  }

  if (gameState.startedAt === null) {
    gameState.startedAt = now;
  }

  if (!gameState.ended && getTimeRemaining(now) <= 0) {
    gameState.ended = true;
    gameState.won = ship.alive;
  }

  if (gameState.ended) {
    updateOverlay();
  }
}

function gameLoop(now) {
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.033);
  lastFrameTime = now;

  if (!background.complete || !shipImage.complete || !fighterEnemyImage.complete || !helicopterEnemyImage.complete) {
    requestAnimationFrame(gameLoop);
    return;
  }

  prepareSprites();
  if (!sprites.player || !sprites.fighter || !sprites.helicopter) {
    requestAnimationFrame(gameLoop);
    return;
  }

  updateGameState(now);
  updateShip(deltaSeconds, now);

  if (now - lastSmokeAt >= SMOKE_INTERVAL) {
    spawnSmoke(now);
    lastSmokeAt = now;
  }

  if (isRoundActive(now) && wantsToFire() && now - lastPlayerShotAt >= PLAYER_FIRE_INTERVAL) {
    spawnPlayerBullet(now);
    lastPlayerShotAt = now;
  }

  if (isRoundActive(now) && now - lastEnemySpawnAt >= ENEMY_SPAWN_INTERVAL) {
    spawnEnemy(now);
    lastEnemySpawnAt = now;
  }

  updateProjectiles(playerBullets, deltaSeconds, now, PLAYER_BULLET_LIFE);
  updateProjectiles(enemyBullets, deltaSeconds, now, ENEMY_BULLET_LIFE);
  updateSmoke(deltaSeconds, now);
  updateSparks(deltaSeconds, now);

  if (isRoundActive(now)) {
    updateEnemies(deltaSeconds, now);
    handleCollisions(now);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawSmoke(now);
  drawSparks(now);
  for (const enemy of enemies) {
    drawEnemy(enemy, now);
  }
  drawProjectiles(enemyBullets);
  drawProjectiles(playerBullets);
  if (ship.alive) {
    drawAimPulse(now);
  }
  drawShip(now);
  drawHud(now);

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

overlayButton.addEventListener("click", () => {
  resetGame();
});

resizeCanvas();
updateOverlay();
requestAnimationFrame(gameLoop);