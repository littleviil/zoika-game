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
        friction: 0.8,
        restitution: 0.1,
        render: {
            visible: false  
        }
    };

    const floor = Matter.Bodies.rectangle(GAME.WIDTH / 2, GAME.HEIGHT + 40, GAME.WIDTH * 1.4, 120, staticOptions);
    const leftWall = Matter.Bodies.rectangle(-40, GAME.HEIGHT / 2, 100, GAME.HEIGHT * 1.4, staticOptions);
    const rightWall = Matter.Bodies.rectangle(GAME.WIDTH + 40, GAME.HEIGHT / 2, 100, GAME.HEIGHT * 1.4, staticOptions);

    Matter.Composite.add(GAME.engine.world, [floor, leftWall, rightWall]);
}

function createAnimal(x, y, typeIndex, isStatic = false) {
  const def = ANIMALS[typeIndex];
  const options = {
    restitution: 0.18,
    friction: 0.008,
    density: 0.65,
    frictionAir: 0.005
  };
  
  if (GAME.textures[typeIndex]) {
    options.render = {
      sprite: {
        texture: GAME.textures[typeIndex],
        xScale: (def.radius * 2) / 256,
        yScale: (def.radius * 2) / 256
      }
    };
  } else {
    // Fallback: цветной круг, если текстура не загрузилась
    options.render = { fillStyle: `hsl(${typeIndex * 72}, 70%, 50%)` };
  }
  
  const body = Matter.Bodies.circle(x, y, def.radius, options);
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
    if (GAME.gameOver || !GAME.allowGameOverCheck) return;

    for (const animal of GAME.animalsInPlay) {
        if (!animal) continue;

        // Проверяем только тех, кто действительно выше красной линии
        if (animal.position.y < GAME.GAME_OVER_LINE_Y) {
            
            // Дополнительная защита: если животное ещё быстро падает — не считаем проигрыш
            const speedY = Math.abs(animal.velocity.y);
            if (speedY < 3.5) {   // почти остановилось или застряло наверху
                GAME.gameOver = true;
                document.getElementById("restart").style.display = "inline-block";
                
                setTimeout(() => {
                    alert(`Игра окончена!\n\nВаш счёт: ${GAME.score}`);
                }, 250);
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

    // Включаем проверку Game Over только через 1.3 секунды
    // (даём первому животному спокойно упасть и отскочить)
    setTimeout(() => {
        GAME.allowGameOverCheck = true;
    }, 1300);

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