const ANIMALS = [
  { radius: 15,  scoreValue: 1,   path: "../images/animals/hamster.png" },
  { radius: 20,  scoreValue: 3,   path: "../images/animals/cat.png" },
  { radius: 25,  scoreValue: 6,   path: "../images/animals/pig.png" },
  { radius: 30,  scoreValue: 12,  path: "../images/animals/sheep.png" },
  { radius: 35,  scoreValue: 25,  path: "../images/animals/elephant.png" }
];

const GAME = {
    WIDTH: 540,
    HEIGHT: 650,
    DROP_Y: 70,                    // чуть ниже, чтобы было комфортнее
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
    allowGameOverCheck: false
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
    // Общие настройки для стен и пола (статические, не отталкивают сильно)
    const staticOptions = {
        isStatic: true,
        friction: 0.8,              // чуть больше трения, чтобы животные не скользили вечно
        restitution: 0.1,           // почти не отскакивают от стен
        render: {
            fillStyle: '#6d4c41',   // тёмно-коричневый (можно поменять)
            strokeStyle: '#4a372c',
            lineWidth: 4
        }
    };

    // Пол
    const floor = Matter.Bodies.rectangle(
        GAME.WIDTH / 2,
        GAME.HEIGHT + 40,           // чуть ниже видимой области
        GAME.WIDTH * 1.4,           // шире, чтобы края не просвечивали
        120,                        // толще, чтобы не проваливалось
        staticOptions
    );

    // Левая стена
    const leftWall = Matter.Bodies.rectangle(
        -40,                        // чуть за пределами экрана
        GAME.HEIGHT / 2,
        100,
        GAME.HEIGHT * 1.4,
        staticOptions
    );

    // Правая стена
    const rightWall = Matter.Bodies.rectangle(
        GAME.WIDTH + 40,
        GAME.HEIGHT / 2,
        100,
        GAME.HEIGHT * 1.4,
        staticOptions
    );

    // Добавляем все тела в мир
    Matter.Composite.add(GAME.engine.world, [floor, leftWall, rightWall]);

    // Красная линия — ТОЛЬКО визуальная (не физическое тело!)
    // Рисуем её позже в afterRender (см. ниже)
}

function createAnimal(x, y, typeIndex, isStatic = false) {
    const def = ANIMALS[typeIndex];
    const options = { /* ... твои настройки ... */ };

    if (GAME.textures[typeIndex]) {
        options.render = { /* sprite */ };
    } else {
        options.render = { fillStyle: `hsl(${typeIndex * 70}, 80%, 55%)` };
    }

    const body = Matter.Bodies.circle(x, y, def.radius, options);
    body.animalType = typeIndex;
    body.isStatic = isStatic;
    body.birthTime = Date.now();        // ← новая строка

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

    // После сброса отключаем проверку на 1.4 секунды
    GAME.allowGameOverCheck = false;
    setTimeout(() => {
        if (!GAME.gameOver) GAME.allowGameOverCheck = true;
    }, 1400);

    setTimeout(spawnNextAnimal, 320);
}

function handleCollisions() {
  Matter.Events.on(GAME.engine, "collisionStart", (event) => {
    if (GAME.gameOver) return;
    
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      
      if (!bodyA.animalType || !bodyB.animalType) continue;
      if (bodyA.animalType !== bodyB.animalType) continue;
      if (bodyA.animalType >= GAME.MAX_ANIMAL_INDEX) continue;
      
      if (bodyA.isMerging || bodyB.isMerging) continue;
      bodyA.isMerging = bodyB.isMerging = true;
      
      const newType = bodyA.animalType + 1;
      const midX = (bodyA.position.x + bodyB.position.x) / 2;
      const midY = (bodyA.position.y + bodyB.position.y) / 2;
      
      Matter.Composite.remove(GAME.engine.world, [bodyA, bodyB]);
      
      const newAnimal = createAnimal(midX, midY, newType);
      Matter.Composite.add(GAME.engine.world, newAnimal);
      GAME.animalsInPlay.push(newAnimal);
      
      GAME.score += ANIMALS[newType].scoreValue * 2;
      document.getElementById("score").textContent = GAME.score;
      
      setTimeout(() => {
        bodyA.isMerging = bodyB.isMerging = false;
      }, 100);
    }
  });
}

function checkGameOver() {
    if (GAME.gameOver) return;

    // Проверяем только каждые ~300 мс, чтобы не нагружать
    if (GAME.engine.timing.timestamp % 300 > 50) return;

    let overflowCount = 0;

    for (const animal of GAME.animalsInPlay) {
        if (!animal) continue;

        // Игнорируем очень молодые объекты (меньше 1.5 сек)
        if (animal.birthTime && Date.now() - animal.birthTime < 1500) continue;

        // Считаем скорость
        const speed = Math.sqrt(animal.velocity.x ** 2 + animal.velocity.y ** 2);

        // Только почти остановившиеся и высоко расположенные
        if (animal.position.y < GAME.GAME_OVER_LINE_Y && speed < 2.5) {
            overflowCount++;
        }
    }

    // Проигрыш только если ≥ 1–2 стабилизированных животных выше линии
    if (overflowCount >= 1) {   // можно поставить >= 2 если хочешь строже
        GAME.gameOver = true;
        document.getElementById("restart").style.display = "inline-block";
        setTimeout(() => {
            alert(`Игра окончена!\nВаш счёт: ${GAME.score}`);
        }, 400);
    }
}

function initPhysics() {
    GAME.engine = Matter.Engine.create();
    GAME.engine.gravity.y = 1;               // ← было 1.12 или больше — верни к 1

    const container = document.getElementById("canvas-container");

    GAME.render = Matter.Render.create({
        element: container,
        engine: GAME.engine,
        options: {
            width: GAME.WIDTH,
            height: GAME.HEIGHT,
            wireframes: false,
            background: "#f0f4f8"
        }
    });

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

    const targetX = mouse.position.x;
    const currentX = GAME.currentAnimal.position.x;

    // Плавное следование, а не мгновенное
    GAME.currentAnimal.position.x += (targetX - currentX) * 0.25;

    // Жёсткие границы
    GAME.currentAnimal.position.x = Math.max(
        GAME.currentAnimal.circleRadius + 10,
        Math.min(GAME.WIDTH - GAME.currentAnimal.circleRadius - 10,
                 GAME.currentAnimal.position.x)
    );
});
}

function startGame() {
    initPhysics();
    handleCollisions();
    
    GAME.score.birthTime = 0;
    GAME.gameOver.birthTime = false;
    GAME.allowGameOverCheck.birthTime = false;
    GAME.animalsInPlay.birthTime = [];
    GAME.currentAnimal.birthTime = Date.now();
    
    document.getElementById("score").textContent = "0";
    document.getElementById("restart").style.display = "none";

    spawnNextAnimal();
    setupControls();

    // Включаем проверку только через 3 секунды
    setTimeout(() => {
        GAME.allowGameOverCheck = true;
    }, 3000);

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