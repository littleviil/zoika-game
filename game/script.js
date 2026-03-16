const ANIMALS = [
  { radius: 26,  scoreValue: 1,   path: "../images/animals/hamster.png" },
  { radius: 34,  scoreValue: 3,   path: "../images/animals/cat.png" },
  { radius: 44,  scoreValue: 6,   path: "../images/animals/pig.png" },
  { radius: 58,  scoreValue: 12,  path: "../images/animals/sheep.png" },
  { radius: 82,  scoreValue: 25,  path: "../images/animals/elephant.png" }
];

const GAME = {
  WIDTH: 640,
  HEIGHT: 960,
  DROP_Y: 85,
  GAME_OVER_LINE_Y: 145,
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
  loadedTextures: 0
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
  const wallStyle = { isStatic: true, render: { fillStyle: "#6d4c41" } };
  
  const bodies = [
    Matter.Bodies.rectangle(GAME.WIDTH / 2, GAME.HEIGHT + 30, GAME.WIDTH * 2, 60, wallStyle),
    Matter.Bodies.rectangle(-30, GAME.HEIGHT / 2, 60, GAME.HEIGHT * 2, wallStyle),
    Matter.Bodies.rectangle(GAME.WIDTH + 30, GAME.HEIGHT / 2, 60, GAME.HEIGHT * 2, wallStyle),
    Matter.Bodies.rectangle(GAME.WIDTH / 2, GAME.GAME_OVER_LINE_Y, GAME.WIDTH - 100, 6, {
      isStatic: true,
      render: { fillStyle: "#e63946" },
      label: "gameover-line"
    })
  ];
  
  Matter.Composite.add(GAME.engine.world, bodies);
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
  if (GAME.gameOver) return;
  
  for (const animal of GAME.animalsInPlay) {
    if (animal.position.y < GAME.GAME_OVER_LINE_Y && !animal.isStatic) {
      GAME.gameOver = true;
      document.getElementById("restart").style.display = "inline-block";
      setTimeout(() => {
        alert(`Игра окончена!\n\nВаш счёт: ${GAME.score}`);
      }, 300);
      break;
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
  GAME.animalsInPlay = [];
  document.getElementById("score").textContent = "0";
  document.getElementById("restart").style.display = "none"; // скрываем кнопку на старте
  
  spawnNextAnimal();
  
  setupControls();
  
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

// ────────────────────────────────────────────────

window.addEventListener("load", () => {
  preloadTextures(() => {
    startGame();
  });
});