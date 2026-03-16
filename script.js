document.addEventListener('DOMContentLoaded', () => {
    const mainScreen     = document.getElementById('main-screen');
    const levelScreen    = document.getElementById('level-screen');
    const gameScreen     = document.getElementById('game-screen');
    const aboutModal     = document.getElementById('modal');
    const tutorialModal  = document.getElementById('tutorial-modal');

    const btnStart       = document.getElementById('btn-start');
    const btnAbout       = document.getElementById('btn-about');
    const btnBack        = document.getElementById('btn-back');
    const levelButtons   = document.querySelectorAll('#level-screen .level-btn');
    const btnMenu        = document.getElementById('btn-menu');
    const modalClose     = document.getElementById('modal-close');
    const tutorialClose  = document.getElementById('tutorial-close');
    const btnStartGame   = document.getElementById('btn-start-game');
    const btnChangeLevel = document.getElementById('btn-change-level');

    const difficultyEl   = document.getElementById('current-difficulty');
    const scoreEl        = document.getElementById('score-value');
    const nextPreview    = document.getElementById('next-animal-preview');

    let currentLevel = 'medium';
    let score = 0;

    const animals = [
        { name: 'hamster',  src: 'images/animals/hamster.png',  size: 50,  points: 2   },
        { name: 'cat',      src: 'images/animals/cat.png',      size: 70,  points: 4   },
        { name: 'pig',      src: 'images/animals/pig.png',      size: 95,  points: 8   },
        { name: 'sheep',    src: 'images/animals/sheep.png',    size: 125, points: 16  },
        { name: 'elephant', src: 'images/animals/elephant.png', size: 165, points: 32  }
    ];


    function showScreen(el) {
        [mainScreen, levelScreen, gameScreen].forEach(s => s?.classList.remove('active'));
        el?.classList.add('active');
    }

    function showModal(modal) {
        modal?.classList.add('show');
    }

    function hideModal(modal) {
        modal?.classList.remove('show');
    }

    function updateNextAnimal(imgSrc) {
        if (nextPreview) nextPreview.src = imgSrc;
    }

    function updateScore(newScore) {
        score = newScore;
        if (scoreEl) scoreEl.textContent = score;
    }

    function updateDifficulty(level) {
        currentLevel = level;
        const names = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
        if (difficultyEl) difficultyEl.textContent = names[level] || 'Средний';
    }

    function startGamePreview() {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const examples = [
            { type: 0, x: 80,  y: 300 }, 
            { type: 1, x: 180, y: 280 }, 
            { type: 2, x: 280, y: 320 }, 
            { type: 3, x: 140, y: 420 },  
            { type: 4, x: 220, y: 180 }  
        ];

        examples.forEach(ex => {
            const animal = animals[ex.type];
            const img = new Image();
            img.src = animal.src;
            img.onload = () => {
                ctx.drawImage(img, ex.x - animal.size/2, ex.y - animal.size/2, animal.size, animal.size);
            };
        });

        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 6;
        ctx.shadowColor = '#ff1a1a';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(20, canvas.height * 0.18);
        ctx.lineTo(canvas.width - 20, canvas.height * 0.18);
        ctx.stroke();
    }

    btnStart?.addEventListener('click', () => showScreen(levelScreen));
    btnAbout?.addEventListener('click', () => showModal(aboutModal));
    modalClose?.addEventListener('click', () => hideModal(aboutModal));
    aboutModal?.addEventListener('click', e => { if (e.target === aboutModal) hideModal(aboutModal); });

    btnBack?.addEventListener('click', () => showScreen(mainScreen));

    levelButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const level = btn.dataset.level;
            if (level) {
                updateDifficulty(level);
                updateNextAnimal(animals[0].src);
                updateScore(0);
                showModal(tutorialModal);
            }
        });
    });

    btnStartGame?.addEventListener('click', () => {
        hideModal(tutorialModal);
        showScreen(gameScreen);
        setTimeout(startGamePreview, 150);
    });

    btnChangeLevel?.addEventListener('click', () => hideModal(tutorialModal));
    tutorialClose?.addEventListener('click', () => hideModal(tutorialModal));
    tutorialModal?.addEventListener('click', e => { if (e.target === tutorialModal) hideModal(tutorialModal); });

    btnMenu?.addEventListener('click', () => showScreen(mainScreen));

    showScreen(mainScreen);
    updateDifficulty('medium');
    updateNextAnimal(animals[0].src);
});