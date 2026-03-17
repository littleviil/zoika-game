const ANIMALS = [
  { visualRadius: 6, physicsRadius: 24, scoreValue: 1,   path: "../images/animals/hamster.png" },
  { visualRadius: 8, physicsRadius: 32, scoreValue: 3,   path: "../images/animals/cat.png" },
  { visualRadius: 10, physicsRadius: 40, scoreValue: 6,   path: "../images/animals/pig.png" },
  { visualRadius: 12, physicsRadius: 48, scoreValue: 12,  path: "../images/animals/sheep.png" },
  { visualRadius: 14, physicsRadius: 56, scoreValue: 25,  path: "../images/animals/elephant.png" }
];

const GAME = {
    WIDTH: 540,
    HEIGHT: 650,
    DROP_Y: 92,                    // чуть ниже, чтобы было комфортнее
    GAME_OVER_LINE_Y: 100,         // ← БЫЛО 145, СТАЛО 205 (главный фикс)
    MAX_ANIMAL_INDEX: ANIMALS.length - 1,
    
    engine: null,
    render: null,
    runner: null,
    mouseConstraint: null,
    
    currentAnimal: null,
    animalsInPlay: [],
    score: 0,
    gameOver: false,
    
    textures: {},
    loadedTextures: 0,
    allowGameOverCheck: false     // ← НОВЫЙ ФЛАГ
};

function preloadTextures(callback) {
  ANIMALS.forEach((animal, index) => {
    const img = new Image();
    img.onload = () => {
      GAME.textures[index] = img.src;
      GAME.loadedTextures++;
      if (GAME.loadedTextures === ANIMALS.length) callback();
    };
    img.onerror = () => {
      console.warn(`Ошибка загрузки изображения: ${animal.path}. Использую fallback.`);
      GAME.textures[index] = null; // fallback в createAnimal
      GAME.loadedTextures++;
      if (GAME.loadedTextures === ANIMALS.length) callback();
    };
    img.src = animal.path;
  });
}

function createWallsAndFloor() {
    const staticOptions = {
        isStatic: true,
        friction: 1.0,          // максимум
        frictionStatic: 1.5,    // сильно помогает стопке не разъезжаться
        restitution: 0.02,      // почти никакого отскока от границ
        render: { visible: false }
    };

    const floor = Matter.Bodies.rectangle(
        GAME.WIDTH / 2, 
        GAME.HEIGHT + 35, 
        GAME.WIDTH * 1.45, 
        90, 
        staticOptions
    );

    const leftWall = Matter.Bodies.rectangle(-45, GAME.HEIGHT / 2, 90, GAME.HEIGHT * 1.5, staticOptions);
    const rightWall = Matter.Bodies.rectangle(GAME.WIDTH + 45, GAME.HEIGHT / 2, 90, GAME.HEIGHT * 1.5, staticOptions);

    Matter.Composite.add(GAME.engine.world, [floor, leftWall, rightWall]);
}

function createAnimal(x, y, typeIndex, isStatic = false) {
    const def = ANIMALS[typeIndex];

    const options = {
        restitution: 0.18,          // ↓ сильно уменьшаем отскок
        friction: 0.9,              // ↑ почти максимум
        frictionStatic: 1.2,        // добавляем — важно для покоя
        frictionAir: 0.015,         // чуть меньше, чтобы не тормозило слишком сильно в воздухе
        density: 0.0008,            // ↓ уменьшаем плотность → легче "ложатся"
        slop: 0.01,                 // меньше "проваливания"
        inertia: Infinity,          // оставляем — хорошо против вращения
        render: {}
    };

    if (GAME.textures[typeIndex]) {
        const visualDiameter = def.visualRadius * 2;
        options.render.sprite = {
            texture: GAME.textures[typeIndex],
            xScale: visualDiameter / 256,
            yScale: visualDiameter / 256
        };
    } else {
        options.render.fillStyle = `hsl(${typeIndex * 72}, 70%, 50%)`;
    }

    // ← Вот где физический радиус больше визуального
    const body = Matter.Bodies.circle(x, y, def.physicsRadius, options);

    body.animalType = typeIndex;
    body.isStatic = isStatic;

    return body;
}

function spawnNextAnimal() {
  if (GAME.gameOver) return;
  
  const typeIndex = Math.floor(Math.random() * Math.min(4, ANIMALS.length));
  
  GAME.currentAnimal = createAnimal(GAME.WIDTH / 2, GAME.DROP_Y, typeIndex, true);
  Matter.Composite.add(GAME.engine.world, GAME.currentAnimal);
  
  updateNextPreview();
}

function updateNextPreview() {
  const previewIndex = Math.floor(Math.random() * Math.min(4, ANIMALS.length));
  document.getElementById("next-animal").src = GAME.textures[previewIndex] || '';
}

function dropCurrentAnimal() {
    if (!GAME.currentAnimal || GAME.gameOver || !GAME.currentAnimal.isStatic) return;

    GAME.currentAnimal.isStatic = false;
    GAME.animalsInPlay.push(GAME.currentAnimal);
    GAME.currentAnimal = null;

    // Самое важное: отключаем проверку Game Over на время падения этого животного
    GAME.allowGameOverCheck = false;

    // Включаем обратно через 800–1200 мс (в зависимости от гравитации и высоты)
    setTimeout(() => {
        GAME.allowGameOverCheck = true;
    }, 1000);   // 1000 мс — хороший баланс для твоей гравитации 1.12

    setTimeout(spawnNextAnimal, 400);   // можно чуть быстрее, 300–500 мс
}

function handleCollisions() {
  Matter.Events.on(GAME.engine, "collisionStart", (event) => {
    // если игра уже закончена — ничего не делаем
    if (GAME.gameOver) return;

    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;

      // пропускаем, если хотя бы одно тело — не животное
      if (!bodyA?.animalType || !bodyB?.animalType) continue;

      // сливаем только одинаковые типы
      if (bodyA.animalType !== bodyB.animalType) continue;

      // не сливаем максимальный уровень
      if (bodyA.animalType >= GAME.MAX_ANIMAL_INDEX) continue;

      // защита от множественного слияния одного и того же тела
      if (bodyA.isMerging || bodyB.isMerging) continue;

      // помечаем тела как находящиеся в процессе слияния
      bodyA.isMerging = bodyB.isMerging = true;

      const newType = bodyA.animalType + 1;

      // берём среднюю точку между двумя животными
      const midX = (bodyA.position.x + bodyB.position.x) / 2;
      const midY = (bodyA.position.y + bodyB.position.y) / 2;

      // удаляем старые тела
      Matter.Composite.remove(GAME.engine.world, [bodyA, bodyB]);

      // создаём новое животное
      const newAnimal = createAnimal(midX, midY, newType, false);

      // сразу убираем остаточную скорость и вращение — это сильно уменьшает хаос после слияния
      Matter.Body.setVelocity(newAnimal, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(newAnimal, 0);

      // можно слегка сдвинуть вниз, чтобы новое животное не "всплывало" (опционально)
      // Matter.Body.translate(newAnimal, { x: 0, y: 8 });

      // добавляем в мир и в массив активных животных
      Matter.Composite.add(GAME.engine.world, newAnimal);
      GAME.animalsInPlay.push(newAnimal);

      // начисляем очки
      GAME.score += ANIMALS[newType].scoreValue * 2;
      document.getElementById("score").textContent = GAME.score;

      setTimeout(() => {
        bodyA.isMerging = false;
        bodyB.isMerging = false;
      }, 120);
    }
  });
}

function checkGameOver() {
    if (GAME.gameOver || !GAME.allowGameOverCheck) return;
    if (GAME.animalsInPlay.length === 0) return;

    for (const animal of GAME.animalsInPlay) {
        if (!animal) continue;

        // Игнорируем верхнюю зону (спавн + запас на отскок)
        if (animal.position.y < GAME.DROP_Y + 120) continue;   // ← важно!

        if (animal.position.y < GAME.GAME_OVER_LINE_Y) {
            const speedY = Math.abs(animal.velocity.y);

            // Если скорость маленькая → почти остановилось наверху → проигрыш
            if (speedY < 2.8) {          // было 3.5 → можно опустить до 2.5–3.0
                GAME.gameOver = true;
                document.getElementById("restart").style.display = "inline-block";

                setTimeout(() => {
                    alert(`Игра окончена!\n\nВаш счёт: ${GAME.score}`);
                }, 300);
                return;
            }
        }
    }
}

function initPhysics() {
  GAME.engine = Matter.Engine.create();
  GAME.engine.gravity.y = 1.12;
  
  const container = document.getElementById("canvas-container");
  
  GAME.render = Matter.Render.create({
    element: container,
      engine: GAME.engine,
      options: {
          width: GAME.WIDTH,
          height: GAME.HEIGHT,
          wireframes: false,
          background: 'transparent',           // ← главное изменение
          wireframeBackground: 'transparent',  // на случай переключения в wireframe-режим
          showAngleIndicator: false,
          showCollisions: false,           
          showVelocity: false
      }
  });
  GAME.render.canvas.style.background = 'transparent';
  GAME.render.canvas.style.backgroundColor = 'transparent';
  
  GAME.runner = Matter.Runner.create();
  Matter.Render.run(GAME.render);
  Matter.Runner.run(GAME.runner, GAME.engine);
  
  createWallsAndFloor();
}

function setupControls() {
  const mouse = Matter.Mouse.create(GAME.render.canvas);
  GAME.mouseConstraint = Matter.MouseConstraint.create(GAME.engine, { mouse });
  Matter.Composite.add(GAME.engine.world, GAME.mouseConstraint);
  GAME.render.mouse = mouse;
  
  GAME.render.canvas.addEventListener("click", dropCurrentAnimal);
  
  Matter.Events.on(GAME.engine, "beforeUpdate", () => {
    if (!GAME.currentAnimal || !GAME.currentAnimal.isStatic) return;
    
    const mx = Math.max(GAME.currentAnimal.circleRadius * 1.5, 
                        Math.min(GAME.WIDTH - GAME.currentAnimal.circleRadius * 1.5, 
                                 mouse.position.x));
    
    GAME.currentAnimal.position.x = mx;
  });
}

function startGame() {
    initPhysics();
    handleCollisions();
    
    GAME.score = 0;
    GAME.gameOver = false;
    GAME.allowGameOverCheck = false;   // сначала проверка выключена
    GAME.animalsInPlay = [];
    
    document.getElementById("score").textContent = "0";
    document.getElementById("restart").style.display = "none";

    spawnNextAnimal();
    setupControls();

    // // Включаем проверку Game Over только через 1.3 секунды
    // // (даём первому животному спокойно упасть и отскочить)
    // setTimeout(() => {
    //     GAME.allowGameOverCheck = true;
    // }, 1300);

    Matter.Events.on(GAME.engine, "afterUpdate", checkGameOver);
}

function restartGame() {
  if (GAME.render) Matter.Render.stop(GAME.render);
  if (GAME.runner) Matter.Runner.stop(GAME.runner);
  
  document.getElementById("canvas-container").innerHTML = "";
  
  GAME.engine = null;
  GAME.render = null;
  GAME.runner = null;
  GAME.mouseConstraint = null;
  GAME.currentAnimal = null;
  GAME.animalsInPlay = [];
  
  startGame();
}


window.addEventListener("load", () => {
  preloadTextures(() => {
    startGame();
  });
});

function adaptCanvasSize() {
    if (!GAME.render || !GAME.render.canvas) return;

    const cont = document.getElementById('canvas-container');
    if (!cont) return;

    const w = cont.clientWidth;
    const h = cont.clientHeight || (w * 1.5);  // fallback на пропорцию

    GAME.render.canvas.width = w;
    GAME.render.canvas.height = h;
    GAME.render.options.width = w;
    GAME.render.options.height = h;
    GAME.render.bounds.max.x = w;
    GAME.render.bounds.max.y = h;
}

// Запуск при загрузке и изменении размера окна
window.addEventListener('load', adaptCanvasSize);
window.addEventListener('resize', adaptCanvasSize);
window.addEventListener('orientationchange', adaptCanvasSize);

// В startGame() после setupControls() добавь:
adaptCanvasSize();