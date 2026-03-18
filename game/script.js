// ═══ Таблица животных ════════════════════════════════════════════════════════
const LEVEL_SCALE = (() => {
    const p = new URLSearchParams(window.location.search).get("level");
    if (p === "hard")   return 1.6;
    if (p === "medium") return 1.3;
    return 1; // easy (default)
})();

// Визуальный множитель спрайта: 1.1 покрывает прозрачные поля картинок
// без видимого наложения животных друг на друга
const SPRITE_VISUAL = 1.3;

const ANIMALS = [
  { physicsRadius: 24 * LEVEL_SCALE, scoreValue:  10, path: "../images/animals/hamster.png"  },
  { physicsRadius: 32 * LEVEL_SCALE, scoreValue:  20, path: "../images/animals/cat.png"      },
  { physicsRadius: 40 * LEVEL_SCALE, scoreValue:  40, path: "../images/animals/pig.png"      },
  { physicsRadius: 48 * LEVEL_SCALE, scoreValue:  80, path: "../images/animals/sheep.png"    },
  { physicsRadius: 56 * LEVEL_SCALE, scoreValue: 150, path: "../images/animals/elephant.png" }
];

const ELEPHANT_IDX   = ANIMALS.length - 1; // 4 — финальное животное

let _gameOverTimer = null; // один таймер разрешения проверки (clearTimeout при каждом броске)
const ELEPHANT_BONUS = 200;                 // очки за слияние двух слонов

// ═══ Состояние игры ══════════════════════════════════════════════════════════
const GAME = {
    WIDTH:  540,
    HEIGHT: 650,
    // DROP_Y: под шапкой (~60px) + радиус слона — зверь целиком виден
    // GAME_OVER_LINE_Y: ещё два диаметра слона ниже — даёт визуально чёткую зону
    DROP_Y:           Math.round(60 + ANIMALS[ELEPHANT_IDX].physicsRadius),
    GAME_OVER_LINE_Y: Math.round(60 + ANIMALS[ELEPHANT_IDX].physicsRadius * 3),

    engine: null,
    render: null,
    runner: null,
    _mouse: null,

    currentAnimal:  null,
    animalsInPlay:  [],
    popEffects:     [],  // анимации взрыва слонов
    mergeFlashes:   [],  // короткие вспышки обычных слияний
    score:          0,
    gameOver:       false,
    nextAnimalType: null,

    textures:       {},
    loadedTextures: 0,
    allowGameOverCheck: false
};

// ═══ Вспомогательные функции UI ═══════════════════════════════════════════════
function ui(id) { return document.getElementById(id); }

function showGameOver() {
    GAME.gameOver = true;

    const screen = ui("gameover-screen");
    const val    = ui("gameover-score-value");
    if (val)    val.textContent  = GAME.score;
    if (screen) screen.classList.add("show");
}

function hideGameOver() {
    const screen = ui("gameover-screen");
    if (screen) screen.classList.remove("show");
}

// ═══ Предзагрузка текстур ════════════════════════════════════════════════════
function preloadTextures(callback) {
    let loaded = 0;
    ANIMALS.forEach((animal, index) => {
        const img = new Image();
        img.onload = () => {
            GAME.textures[index] = img.src;
            if (++loaded === ANIMALS.length) callback();
        };
        img.onerror = () => {
            console.warn(`Нет текстуры: ${animal.path}`);
            GAME.textures[index] = null;
            if (++loaded === ANIMALS.length) callback();
        };
        img.src = animal.path;
    });
}

// ═══ Физические границы ══════════════════════════════════════════════════════
function createWallsAndFloor() {
    const opts = {
        isStatic: true,
        friction: 0.5, frictionStatic: 1.0,
        restitution: 0.0,
        render: { visible: false }
    };

    // Физические стенки — прямые вертикальные (как в оригинальной Suika).
    // Визуальный конус стакана — только декорация в setupOverlayRendering.
    const GlassTopY = 58, GlassBotY = GAME.HEIGHT - 2;
    const WallX = 13;   // отступ прямой стенки (совпадает с верхним краем визуального конуса)
    const FloorH = 18;
    const thick  = 80;

    Matter.Composite.add(GAME.engine.world, [
        // Левая прямая стенка
        Matter.Bodies.rectangle(WallX - thick / 2, GAME.HEIGHT / 2, thick, GAME.HEIGHT, opts),
        // Правая прямая стенка
        Matter.Bodies.rectangle(GAME.WIDTH - WallX + thick / 2, GAME.HEIGHT / 2, thick, GAME.HEIGHT, opts),
        // Пол
        Matter.Bodies.rectangle(GAME.WIDTH / 2, GlassBotY - FloorH / 2,
            GAME.WIDTH - WallX * 2, FloorH, opts),
        // Потолок — не даёт вылетать при взрыве слонов
        Matter.Bodies.rectangle(GAME.WIDTH / 2, GlassTopY - 25,
            GAME.WIDTH * 2, 50, opts),
    ]);
}

// ═══ Создание тела животного ══════════════════════════════════════════════════
function createAnimal(x, y, typeIndex, isStatic) {
    const def   = ANIMALS[typeIndex];
    // Спрайт рисуется на 30% крупнее физического тела — перекрывает прозрачные
    // отступы вокруг рисунка в картинках 1250×1250, убирая видимые зазоры
    const scale = (def.physicsRadius * 2 * SPRITE_VISUAL) / 1250;

    const options = {
        restitution: 0.18, friction: 0.9, frictionStatic: 1.2,
        frictionAir: 0.015, density: 0.0008, slop: 0.005,
        inertia: Infinity,
        render: GAME.textures[typeIndex]
            ? { sprite: { texture: GAME.textures[typeIndex], xScale: scale, yScale: scale } }
            : { fillStyle: `hsl(${typeIndex * 72}, 70%, 50%)` }
    };

    const body = Matter.Bodies.circle(x, y, def.physicsRadius, options);
    body.animalType = typeIndex;
    body.justMerged = false;

    if (isStatic) Matter.Body.setStatic(body, true);
    return body;
}

// ═══ Спавн животного ═════════════════════════════════════════════════════════
function spawnNextAnimal() {
    if (GAME.gameOver) return;

    const typeIndex = GAME.nextAnimalType !== null
        ? GAME.nextAnimalType
        : Math.floor(Math.random() * Math.min(4, ANIMALS.length));

    // Готовим следующий тип заранее для корректного превью
    GAME.nextAnimalType = Math.floor(Math.random() * Math.min(4, ANIMALS.length));

    GAME.currentAnimal = createAnimal(GAME.WIDTH / 2, GAME.DROP_Y, typeIndex, true);
    Matter.Composite.add(GAME.engine.world, GAME.currentAnimal);

    const el = ui("next-animal");
    if (el) el.src = GAME.textures[GAME.nextAnimalType] || '';
}

// ═══ Сброс животного ═════════════════════════════════════════════════════════
function dropCurrentAnimal() {
    if (!GAME.currentAnimal || GAME.gameOver || !GAME.currentAnimal.isStatic) return;

    Matter.Body.setStatic(GAME.currentAnimal, false);
    GAME.animalsInPlay.push(GAME.currentAnimal);
    GAME.currentAnimal = null;

    GAME.allowGameOverCheck = false;
    clearTimeout(_gameOverTimer);
    _gameOverTimer = setTimeout(() => { GAME.allowGameOverCheck = true; }, 900);
    setTimeout(spawnNextAnimal, 380);
}

// ═══ Логика слияний ══════════════════════════════════════════════════════════
function handleCollisions() {
    Matter.Events.on(GAME.engine, "collisionStart", event => {
        if (GAME.gameOver) return;

        for (const { bodyA, bodyB } of event.pairs) {
            if (bodyA.animalType === undefined || bodyB.animalType === undefined) continue;
            if (bodyA.animalType !== bodyB.animalType) continue;
            if (bodyA.isMerging  || bodyB.isMerging)  continue;

            bodyA.isMerging = bodyB.isMerging = true;

            const typeIndex = bodyA.animalType;
            const midX = (bodyA.position.x + bodyB.position.x) / 2;
            const midY = (bodyA.position.y + bodyB.position.y) / 2;

            // Убираем оба тела
            Matter.Composite.remove(GAME.engine.world, bodyA);
            Matter.Composite.remove(GAME.engine.world, bodyB);
            GAME.animalsInPlay = GAME.animalsInPlay.filter(a => a !== bodyA && a !== bodyB);

            // ── ДВА СЛОНА → исчезают + бонусные очки ─────────────────────
            if (typeIndex === ELEPHANT_IDX) {
                GAME.score += ELEPHANT_BONUS;
                ui("score").textContent = GAME.score;

                // Физическая ударная волна — прямое задание скорости
                // Ударная волна: прямое задание скорости — всё летит по полю
                for (const body of GAME.animalsInPlay) {
                    const dx   = body.position.x - midX;
                    const dy   = body.position.y - midY;
                    const dist = Math.hypot(dx, dy) || 1;
                    // затухание линейное, минимум 0.3 — даже дальние звери летят
                    const falloff = Math.max(0.3, 1 - dist / GAME.WIDTH);
                    Matter.Body.setVelocity(body, {
                        x: (dx / dist) * 50 * falloff,
                        y: (dy / dist) * 50 * falloff - 20 * falloff
                    });
                }

                // Пока звери летают после взрыва — не считать game-over
                GAME.allowGameOverCheck = false;
                clearTimeout(_gameOverTimer);
                _gameOverTimer = setTimeout(() => { GAME.allowGameOverCheck = true; }, 2500);

                // Искры — 12 лучей в случайных направлениях
                const sparks = Array.from({ length: 12 }, (_, i) => ({
                    angle: (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
                    len:   0.5 + Math.random() * 0.7
                }));
                GAME.popEffects.push({
                    x: midX, y: midY,
                    r: ANIMALS[ELEPHANT_IDX].physicsRadius,
                    born: Date.now(), sparks
                });
                continue;
            }

            // ── ОБЫЧНОЕ СЛИЯНИЕ → следующий уровень + очки ───────────────
            GAME.score += ANIMALS[typeIndex + 1].scoreValue;
            ui("score").textContent = GAME.score;

            // Короткая вспышка при слиянии
            GAME.mergeFlashes.push({ x: midX, y: midY, r: ANIMALS[typeIndex + 1].physicsRadius, born: Date.now() });

            const newType   = typeIndex + 1;
            const newAnimal = createAnimal(midX, midY, newType, false);
            Matter.Body.setVelocity(newAnimal, { x: 0, y: 1 });
            Matter.Body.setAngularVelocity(newAnimal, 0);
            Matter.Composite.add(GAME.engine.world, newAnimal);
            GAME.animalsInPlay.push(newAnimal);

            // Не проверять game-over для только что созданного тела
            newAnimal.justMerged = true;
            setTimeout(() => { newAnimal.justMerged = false; }, 700);
        }
    });
}

// ═══ Проверка конца игры ══════════════════════════════════════════════════════
// Зверь должен быть выше линии И почти неподвижен 10 кадров подряд (~0.17 с).
// Это исключает ложные срабатывания при быстром пролёте через зону.
function checkGameOver() {
    if (GAME.gameOver || !GAME.allowGameOverCheck) return;

    for (const animal of GAME.animalsInPlay) {
        if (!animal || animal.justMerged) {
            if (animal) animal._dangerFrames = 0;
            continue;
        }

        // Проверяем верхний край физического тела (не центр) —
        // это соответствует тому, что видит игрок
        const topEdge = animal.position.y - animal.circleRadius;
        const speed   = Math.hypot(animal.velocity.x, animal.velocity.y);

        if (topEdge < GAME.GAME_OVER_LINE_Y && speed < 3) {
            animal._dangerFrames = (animal._dangerFrames || 0) + 1;
            if (animal._dangerFrames >= 10) {
                showGameOver();
                return;
            }
        } else {
            animal._dangerFrames = 0;
        }
    }
}

// ═══ Физика и рендер ═════════════════════════════════════════════════════════
function initPhysics() {
    GAME.engine = Matter.Engine.create({
        positionIterations: 12,  // default 6 — важно для наклонных стенок
        velocityIterations: 10,  // default 4 — уменьшает "телепорт" при угловых стыках
        constraintIterations: 4
    });
    GAME.engine.gravity.y = 1.12;

    const container = ui("canvas-container");

    GAME.render = Matter.Render.create({
        element: container,
        engine:  GAME.engine,
        options: {
            width:      GAME.WIDTH,
            height:     GAME.HEIGHT,
            wireframes: false,
            background: '#b8dff5',
            showAngleIndicator: false,
            showCollisions:     false,
            showVelocity:       false
        }
    });

    GAME.runner = Matter.Runner.create();
    Matter.Render.run(GAME.render);
    Matter.Runner.run(GAME.runner, GAME.engine);

    createWallsAndFloor();
}

// ═══ Управление (мышь / клик) ═════════════════════════════════════════════════
function setupControls() {
    GAME._mouse = Matter.Mouse.create(GAME.render.canvas);
    GAME.render.mouse = GAME._mouse; // автокоррекция масштаба

    GAME.render.canvas.addEventListener("click", dropCurrentAnimal);

    Matter.Events.on(GAME.engine, "beforeUpdate", () => {
        if (!GAME.currentAnimal || !GAME.currentAnimal.isStatic) return;
        const r  = GAME.currentAnimal.circleRadius;
        const mx = Math.max(r * 1.5, Math.min(GAME.WIDTH - r * 1.5, GAME._mouse.position.x));
        Matter.Body.setPosition(GAME.currentAnimal, { x: mx, y: GAME.DROP_Y });
    });
}

// ═══ Наложение поверх канваса ═════════════════════════════════════════════════
function setupOverlayRendering() {
    Matter.Events.on(GAME.render, "afterRender", () => {
        const ctx = GAME.render.canvas.getContext("2d");
        const W = GAME.WIDTH, H = GAME.HEIGHT;
        ctx.save();

        ctx.shadowBlur = 0;

        // ── Линия опасности ───────────────────────────────────────────────
        ctx.setLineDash([11, 7]);
        ctx.strokeStyle = "rgba(210,40,40,0.9)";
        ctx.lineWidth   = 2.5;
        ctx.shadowColor = "#ff2222";
        ctx.shadowBlur  = 7;
        ctx.beginPath();
        ctx.moveTo(7, GAME.GAME_OVER_LINE_Y);
        ctx.lineTo(W - 7, GAME.GAME_OVER_LINE_Y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.font       = "bold 10px Arial";
        ctx.fillStyle  = "rgba(210,40,40,0.85)";
        ctx.textAlign  = "right";
        ctx.fillText("⚠ ОПАСНО", W - 10, GAME.GAME_OVER_LINE_Y - 4);

        // ── Прицел ────────────────────────────────────────────────────────
        if (GAME.currentAnimal && !GAME.gameOver) {
            const cx = GAME.currentAnimal.position.x;
            ctx.setLineDash([4, 6]);
            ctx.strokeStyle = "rgba(255,255,255,0.28)";
            ctx.lineWidth   = 1;
            ctx.shadowBlur  = 0;
            ctx.beginPath();
            ctx.moveTo(cx, GAME.DROP_Y + GAME.currentAnimal.circleRadius + 2);
            ctx.lineTo(cx, H - 10);
            ctx.stroke();
        }

        // ── Вспышки обычных слияний (короткий пульс) ─────────────────────
        ctx.setLineDash([]);
        const now = Date.now();
        const easeOut = t => 1 - (1 - t) ** 3;

        GAME.mergeFlashes = GAME.mergeFlashes.filter(f => {
            const t = (now - f.born) / 350;
            if (t >= 1) return false;
            const alpha = (1 - t) * 0.7;
            const r     = f.r * (1 + easeOut(t) * 1.2);
            const grad  = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
            grad.addColorStop(0, `rgba(255,255,220,${alpha})`);
            grad.addColorStop(1, `rgba(255,255,180,0)`);
            ctx.fillStyle = grad;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
            ctx.fill();
            return true;
        });

        // ── Взрыв слонов ──────────────────────────────────────────────────
        GAME.popEffects = GAME.popEffects.filter(p => {
            const DURATION = 1300;
            const t = (now - p.born) / DURATION;
            if (t >= 1) return false;

            // 1. Белая вспышка (первые 25%)
            if (t < 0.25) {
                const ft    = t / 0.25;
                const alpha = (1 - ft) * 0.85;
                const r     = p.r * (0.4 + easeOut(ft) * 1.6);
                const grad  = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
                grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
                grad.addColorStop(0.5, `rgba(255,240,180,${alpha * 0.6})`);
                grad.addColorStop(1,   `rgba(255,200,50,0)`);
                ctx.fillStyle = grad;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // 2. Золотое кольцо (основное)
            {
                const alpha = Math.max(0, 1 - t * 1.8);
                const r     = p.r * (1 + easeOut(t) * 3);
                ctx.strokeStyle = `rgba(255,215,0,${alpha})`;
                ctx.lineWidth   = 7 * (1 - t) + 1;
                ctx.shadowColor = "#ffcc00";
                ctx.shadowBlur  = 30 * alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 3. Оранжевое кольцо (чуть позади)
            if (t < 0.75) {
                const lt    = t / 0.75;
                const alpha = (1 - lt) * 0.65;
                const r     = p.r * (1 + easeOut(lt) * 5);
                ctx.strokeStyle = `rgba(255,130,0,${alpha})`;
                ctx.lineWidth   = 3 * (1 - lt) + 0.5;
                ctx.shadowColor = "#ff8800";
                ctx.shadowBlur  = 12 * alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 4. Ударная волна — тонкое быстрое кольцо
            if (t < 0.45) {
                const lt    = t / 0.45;
                const alpha = (1 - lt) * 0.45;
                const r     = p.r * (1 + lt * 7);
                ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                ctx.lineWidth   = 1.5;
                ctx.shadowBlur  = 0;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 5. Искры
            if (p.sparks && t < 0.7) {
                const lt = t / 0.7;
                ctx.shadowBlur = 0;
                for (const spark of p.sparks) {
                    const dist  = p.r * (1 + easeOut(lt) * 4.5) * spark.len;
                    const sx    = p.x + Math.cos(spark.angle) * dist;
                    const sy    = p.y + Math.sin(spark.angle) * dist;
                    const alpha = (1 - lt) * 0.95;
                    const size  = 4 * (1 - lt * 0.6);
                    ctx.fillStyle = lt < 0.4
                        ? `rgba(255,255,200,${alpha})`
                        : `rgba(255,180,50,${alpha})`;
                    ctx.beginPath();
                    ctx.arc(sx, sy, size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // 6. Текст очков — плавно поднимается и исчезает
            {
                const visible = t < 0.75 ? 1 : (1 - (t - 0.75) / 0.25);
                const rise    = easeOut(Math.min(t * 2, 1)) * 70;
                const size    = Math.round(28 * (1 - t * 0.2));
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.shadowBlur  = 5;
                ctx.font      = `bold ${size}px Arial`;
                ctx.fillStyle = `rgba(255,235,30,${visible})`;
                ctx.textAlign = "center";
                ctx.fillText(`+${ELEPHANT_BONUS}`, p.x, p.y - 20 - rise);
            }

            return true;
        });

        ctx.restore();
    });
}

// ═══ Запуск игры ══════════════════════════════════════════════════════════════
function startGame() {
    initPhysics();
    handleCollisions();
    setupOverlayRendering();

    GAME.score          = 0;
    GAME.gameOver       = false;
    GAME.allowGameOverCheck = false;
    GAME.animalsInPlay  = [];
    GAME.popEffects     = [];
    GAME.mergeFlashes   = [];
    GAME.nextAnimalType = null;

    const scoreEl = ui("score");
    if (scoreEl) scoreEl.textContent = "0";

    spawnNextAnimal();
    setupControls();

    Matter.Events.on(GAME.engine, "afterUpdate", checkGameOver);
}

// ═══ Перезапуск (UI-элементы сохраняются) ════════════════════════════════════
function restartGame() {
    // 1. Скрываем экран конца игры
    hideGameOver();

    // 2. Останавливаем старый движок
    const oldCanvas = GAME.render ? GAME.render.canvas : null;
    if (GAME.render)  Matter.Render.stop(GAME.render);
    if (GAME.runner)  Matter.Runner.stop(GAME.runner);

    // 3. Удаляем только Matter.js canvas (UI-элементы не трогаем)
    if (oldCanvas && oldCanvas.parentNode) {
        oldCanvas.parentNode.removeChild(oldCanvas);
    }

    // 4. Сбрасываем ссылки
    GAME.engine   = null;
    GAME.render   = null;
    GAME.runner   = null;
    GAME._mouse   = null;
    GAME.currentAnimal  = null;
    GAME.animalsInPlay  = [];
    GAME.popEffects     = [];
    GAME.mergeFlashes   = [];
    GAME.nextAnimalType = null;

    // 5. Запускаем заново
    startGame();
}

// ═══ Старт при загрузке страницы ═════════════════════════════════════════════
window.addEventListener("load", () => {
    preloadTextures(startGame);
});
