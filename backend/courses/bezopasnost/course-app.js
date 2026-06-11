document.addEventListener('DOMContentLoaded', async () => {
    const FLOW = [
        'splash', 'navigation', 'intro',
        'section-1', 'section-2', 'section-3', 'section-4', 'section-5', 'section-6',
        'conclusion'
    ];

    const MODULE_META = {
        navigation: {
            index: 1,
            titleLines: ['Инструкция', 'по навигации'],
            tags: [
                { text: 'Как перемещаться по слайдам', variant: 'beige' },
                { text: 'Где найти все самое полезное', variant: 'olive' }
            ]
        },
        intro: {
            index: 2,
            titleLines: ['Введение'],
            tags: [
                { text: 'Зачем учиться защищаться', variant: 'beige' },
                { text: 'Основные инциденты', variant: 'olive' }
            ]
        },
        'section-1': {
            index: 3,
            titleLines: ['Основы', 'безопасности'],
            tags: [
                { text: 'Виды ИТ-ресурсов', variant: 'beige' },
                { text: 'Политика безопасности и ее основные принципы', variant: 'olive' }
            ]
        },
        'section-2': {
            index: 4,
            titleLines: ['Работа с', 'ИТ-ресурсами'],
            tags: [
                { text: 'Правила работы с ИТ-ресурсами', variant: 'beige' },
                { text: 'Облачные сервисы', variant: 'olive' },
                { text: 'Стороннее оборудование и сервисы', variant: 'grey' }
            ]
        },
        'section-3': {
            index: 5,
            titleLines: ['Работа в офисе', 'и удалённо'],
            tags: [
                { text: 'Работа в офисе', variant: 'beige' },
                { text: 'Удалённая работа', variant: 'olive' }
            ]
        },
        'section-4': {
            index: 6,
            titleLines: ['Работа', 'в интернете'],
            tags: [
                { text: 'Интернет', variant: 'beige' },
                { text: 'Электронная почта', variant: 'olive' }
            ]
        },
        'section-5': {
            index: 7,
            titleLines: ['Работа', 'с клиентами'],
            tags: [
                { text: 'Конференции', variant: 'beige' },
                { text: 'Внешние сайты', variant: 'peach' },
                { text: 'Электронная почта', variant: 'grey' },
                { text: 'Соцсети и мессенджеры', variant: 'olive' },
                { text: 'Искусственный интеллект', variant: 'dark' }
            ]
        },
        'section-6': {
            index: 8,
            titleLines: ['Ответственность', 'сотрудников'],
            tags: [
                { text: 'Сообщение об инцидентах безопасности', variant: 'beige' },
                { text: 'Нарушение политики', variant: 'olive' }
            ]
        },
        conclusion: {
            index: 9,
            titleLines: ['Заключение'],
            tags: [
                { text: 'Главные мысли из курса', variant: 'beige' }
            ]
        }
    };

    const SCREENS_WITHOUT_HEADER = new Set(['splash', 'navigation']);
    const LOCKED_NAV_SCREENS = new Set();

    let currentScreen = 'splash';
    let courseStarted = false;

    const header = document.getElementById('course-header');
    const btnContents = document.getElementById('btn-contents');
    const progressFill = document.getElementById('course-progress-fill');
    const progressText = document.getElementById('course-progress-text');
    const contentsOverlay = document.getElementById('contents-overlay');
    const contentsGrid = document.getElementById('contents-grid');
    function getScreenEl(screenId) {
        return document.getElementById(`screen-${screenId}`);
    }

    function setHeaderVisible(visible) {
        header?.classList.toggle('is-hidden', !visible);
        const headerHeight = visible && header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        document.documentElement.style.setProperty('--header-offset', `${headerHeight}px`);
    }

    function updateProgress(totalScore) {
        const value = Math.max(0, Math.min(100, Math.round(totalScore || 0)));
        if (progressFill) progressFill.style.width = `${value}%`;
        if (progressText) progressText.textContent = `${value}%`;
    }

    function isNavLocked() {
        return LOCKED_NAV_SCREENS.has(currentScreen);
    }

    function updateNavButtons(screenId) {
        const screenEl = getScreenEl(screenId);
        if (!screenEl) return;

        const gateReady = CourseInteractions.isGateReady(screenId);
        const navLocked = isNavLocked();

        screenEl.querySelectorAll('.btn-next, .slide-btn--next, [data-action="next"]').forEach(btn => {
            btn.classList.toggle('is-disabled', !gateReady || navLocked);
        });

        screenEl.querySelectorAll('.btn-back, .slide-btn--back, [data-action="back"]').forEach(btn => {
            btn.classList.toggle('is-disabled', navLocked);
        });

        btnContents?.classList.toggle('is-disabled', navLocked || screenId === 'splash');
    }

    async function completeCurrentScreen() {
        const section = LMSBridge.getSectionByScreen(currentScreen);
        if (!section) return;

        if (LMSBridge.isScorableSection(section) && !LMSBridge.isSectionCompleted(section.id)) {
            try {
                const result = await LMSBridge.completeScreen(currentScreen);
                if (result?.total_score != null) updateProgress(result.total_score);
            } catch (error) {
                console.warn(error);
            }
        } else if (!LMSBridge.isSectionCompleted(section.id)) {
            await LMSBridge.completeSection(section.id);
        }
        renderContentsGrid();
    }

    function switchScreen(screenId, { skipComplete = false } = {}) {
        if (!FLOW.includes(screenId)) return;

        if (!skipComplete && currentScreen !== screenId && currentScreen !== 'splash') {
            if (CourseInteractions.isGateReady(currentScreen)) {
                completeCurrentScreen();
            }
        }

        document.querySelectorAll('.course-screen').forEach(screen => screen.classList.remove('active'));
        const target = getScreenEl(screenId);
        if (target) {
            target.classList.add('active');
            currentScreen = screenId;
        }

        if (screenId !== 'splash') courseStarted = true;

        const showHeader = courseStarted && !SCREENS_WITHOUT_HEADER.has(screenId);
        setHeaderVisible(showHeader);

        CourseInteractions.scanScreen(target, screenId);
        updateNavButtons(screenId);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (screenId === 'intro') {
            requestAnimationFrame(() => updateNavButtons(screenId));
            setTimeout(() => updateNavButtons(screenId), 400);
        }
        renderContentsGrid();
    }

    function getNextScreen(screenId) {
        const index = FLOW.indexOf(screenId);
        return index >= 0 && index < FLOW.length - 1 ? FLOW[index + 1] : null;
    }

    function getPrevScreen(screenId) {
        const index = FLOW.indexOf(screenId);
        return index > 0 ? FLOW[index - 1] : null;
    }

    function openContents() {
        if (!courseStarted || isNavLocked()) return;
        renderContentsGrid();
        contentsOverlay?.classList.remove('is-hidden');
    }

    function closeContents() {
        contentsOverlay?.classList.add('is-hidden');
    }

    function renderTagMarkup(tags) {
        return (tags || []).map(tag => {
            const text = typeof tag === 'string' ? tag : tag.text;
            const variant = typeof tag === 'string' ? 'beige' : (tag.variant || 'beige');
            return `<span class="module-card-tag module-card-tag--${variant}">${text}</span>`;
        }).join('');
    }

    function renderWatermark(tags) {
        const texts = (tags || []).map(t => (typeof t === 'string' ? t : t.text));
        if (!texts.length) return '';
        const repeated = [...texts, ...texts].join('   ');
        return `
            <div class="module-card-watermark" aria-hidden="true">
                <span style="top:18%;left:-5%;">${repeated}</span>
                <span style="top:48%;left:10%;">${repeated}</span>
            </div>
        `;
    }

    function renderContentsGrid() {
        if (!contentsGrid || !LMSBridge.manifest) return;
        contentsGrid.innerHTML = '';

        (LMSBridge.manifest.sections || []).forEach(section => {
            if (section.type === 'splash' || !section.screen || section.screen === 'splash') return;

            const meta = MODULE_META[section.screen] || { index: '', titleLines: [section.title || ''], tags: [] };
            const completed = LMSBridge.isSectionCompleted(section.id);
            const unlocked = LMSBridge.isSectionUnlocked(section.id);
            const isCurrent = section.screen === currentScreen && !completed;
            const isLocked = !unlocked && !completed;

            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'module-card';
            if (completed) card.classList.add('is-completed');
            if (isLocked) card.classList.add('is-locked');
            if (isCurrent) card.classList.add('is-current');

            const title = (meta.titleLines || [section.title]).join(' ');

            card.innerHTML = `
                ${renderWatermark(meta.tags)}
                <div class="module-card-body">
                    <div class="module-card-index">${meta.index || ''}</div>
                    <div class="module-card-title">${title}</div>
                    <div class="module-card-tags">${renderTagMarkup(meta.tags)}</div>
                </div>
                <div class="module-card-overlay module-card-overlay--done">
                    <span class="module-card-badge module-card-badge--done" aria-hidden="true">✓</span>
                </div>
                <div class="module-card-overlay module-card-overlay--lock">
                    <span class="module-card-badge module-card-badge--lock">
                        <img src="assets/images/заблокировано.svg" alt="">
                    </span>
                </div>
            `;

            card.addEventListener('click', () => {
                if (isLocked) return;
                closeContents();
                switchScreen(section.screen, { skipComplete: true });
            });

            contentsGrid.appendChild(card);
        });
    }

    function handleAction(action, sourceEl) {
        if (sourceEl?.classList.contains('is-disabled')) return;

        switch (action) {
            case 'start':
                switchScreen('navigation', { skipComplete: true });
                break;
            case 'contents':
                openContents();
                break;
            case 'back': {
                const prev = getPrevScreen(currentScreen);
                if (prev) switchScreen(prev, { skipComplete: true });
                break;
            }
            case 'next': {
                if (!CourseInteractions.isGateReady(currentScreen)) return;
                const next = getNextScreen(currentScreen);
                if (!next) return;
                completeCurrentScreen().then(() => {
                    switchScreen(next, { skipComplete: true });
                });
                break;
            }
            case 'finish':
                completeCurrentScreen().then(async () => {
                    try {
                        const result = await LMSBridge.finishCourse();
                        const msg = result.passed
                            ? `Курс успешно пройден! Итог: ${Math.round(result.total_score)}%`
                            : `Курс завершён (${Math.round(result.total_score)}%). Для пересдачи обратитесь к эксперту.`;
                        alert(msg);
                        window.location.href = LMSBridge.getReturnUrl();
                    } catch (error) {
                        alert(error.message);
                    }
                });
                break;
            default:
                break;
        }
    }

    function bindGlobalNavigation() {
        document.getElementById('course-app')?.addEventListener('click', (event) => {
            const hotspot = event.target.closest('.hotspot[data-action], [data-action]');
            if (!hotspot) return;

            const action = hotspot.dataset.action;
            if (!action) return;

            if (hotspot.matches('[data-action]')) {
                event.preventDefault();
                handleAction(action, hotspot);
            }
        });

        btnContents?.addEventListener('click', () => openContents());
        document.getElementById('btn-close-contents')?.addEventListener('click', () => closeContents());

        contentsOverlay?.addEventListener('click', (event) => {
            if (event.target === contentsOverlay) closeContents();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !contentsOverlay?.classList.contains('is-hidden')) {
                closeContents();
            }
        });
    }

    CourseInteractions.bindGateListener((screenId, ready) => {
        if (screenId === currentScreen) updateNavButtons(screenId);
    });

    try {
        const data = await LMSBridge.init();
        updateProgress(data.progress?.total_score || 0);

        LMSBridge.on('progress', payload => {
            if (payload?.total_score != null) updateProgress(payload.total_score);
            renderContentsGrid();
        });

        bindGlobalNavigation();
        renderContentsGrid();

        window.addEventListener('resize', () => {
            if (!header?.classList.contains('is-hidden')) {
                setHeaderVisible(true);
            }
        });

        const resume = LMSBridge.getResumeScreen();
        const hasProgress = (data.progress?.total_score || 0) > 0
            || (data.progress?.sections || []).length > 0;

        if (hasProgress && resume && resume !== 'splash') {
            courseStarted = true;
            switchScreen(resume, { skipComplete: true });
        } else {
            switchScreen('splash', { skipComplete: true });
        }
    } catch (error) {
        document.body.innerHTML = `
            <div style="padding:40px;text-align:center;font-family:Segoe UI,sans-serif;">
                <h2>Курс недоступен</h2>
                <p>${error.message}</p>
                <p><a href="${LMSBridge.getReturnUrl()}">Вернуться к обучению</a></p>
            </div>
        `;
    }
});
