document.addEventListener('DOMContentLoaded', () => {
    // Экраны
    const mainScreen    = document.getElementById('main-screen');
    const levelScreen   = document.getElementById('level-screen');
    const gameScreen    = document.getElementById('game-screen');

    // Модалки
    const aboutModal    = document.getElementById('modal');
    const tutorialModal = document.getElementById('tutorial-modal');

    // Кнопки
    const btnStart      = document.getElementById('btn-start');
    const btnAbout      = document.getElementById('btn-about');
    const btnBack       = document.getElementById('btn-back');
    const levelButtons  = document.querySelectorAll('#level-screen .level-btn');
    const btnMenu       = document.getElementById('btn-menu');
    const modalClose    = document.getElementById('modal-close');
    const tutorialClose = document.getElementById('tutorial-close');
    const btnStartGame  = document.getElementById('btn-start-game');
    const btnChangeLevel = document.getElementById('btn-change-level');

    // Элементы игры
    const difficultyEl  = document.getElementById('current-difficulty');
    const scoreEl       = document.getElementById('score-value');
    const nextPreview   = document.getElementById('next-animal-preview');

    let currentLevel = 'medium';

    // ── Функции ───────────────────────────────────────

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

    function updateGameUI(level) {
        currentLevel = level;
        const names = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
        const emojis = { easy: '🐭', medium: '🐱', hard: '🐶' };
        
        if (difficultyEl) difficultyEl.textContent = names[level] || 'Средний';
        if (scoreEl)      scoreEl.textContent = '0';
        if (nextPreview)  nextPreview.textContent = emojis[level] || '🐱';
    }

    // ── Обработчики ──────────────────────────────────

    btnStart?.addEventListener('click', () => showScreen(levelScreen));
    btnAbout?.addEventListener('click', () => showModal(aboutModal));
    modalClose?.addEventListener('click', () => hideModal(aboutModal));
    aboutModal?.addEventListener('click', e => { if (e.target === aboutModal) hideModal(aboutModal); });

    btnBack?.addEventListener('click', () => showScreen(mainScreen));

    levelButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const level = btn.dataset.level;
            if (level) {
                console.log("Выбрана сложность:", level);
                updateGameUI(level);
                showModal(tutorialModal);
            }
        });
    });

    btnStartGame?.addEventListener('click', () => {
        console.log("Запуск игры → уровень:", currentLevel);
        hideModal(tutorialModal);
        showScreen(gameScreen);
    });

    btnChangeLevel?.addEventListener('click', () => {
        hideModal(tutorialModal);
    });

    tutorialClose?.addEventListener('click', () => hideModal(tutorialModal));
    tutorialModal?.addEventListener('click', e => { if (e.target === tutorialModal) hideModal(tutorialModal); });

    btnMenu?.addEventListener('click', () => showScreen(mainScreen));

    // Старт
    showScreen(mainScreen);
    updateGameUI('medium');
});