const CourseInteractions = (() => {
    let activeScreen = null;
    let onGateChange = null;
    const gateState = new Map();

    function setGate(screenId, ready) {
        const prev = gateState.get(screenId);
        gateState.set(screenId, ready);
        if (prev !== ready && typeof onGateChange === 'function') {
            onGateChange(screenId, ready);
        }
    }

    function isGateReady(screenId) {
        return gateState.get(screenId) !== false;
    }

    function initSlider(root) {
        const slides = Array.from(root.querySelectorAll('[data-slide], .frame-31, .frame-23')).filter(el => {
            return el.querySelector('.btn-back, .arrow-right-wrapper, .btn-back-2, .btn-back-3, .btn-back-4');
        });
        if (slides.length === 0) return null;

        const uniqueSlides = slides.length ? slides : [root];
        let index = 0;
        const visited = new Set([0]);

        uniqueSlides.forEach((slide, i) => {
            slide.style.display = i === 0 ? '' : 'none';
            slide.dataset.slideIndex = String(i);
        });

        function showSlide(nextIndex) {
            index = Math.max(0, Math.min(nextIndex, uniqueSlides.length - 1));
            uniqueSlides.forEach((slide, i) => {
                slide.style.display = i === index ? '' : 'none';
            });
            visited.add(index);
            setGate(activeScreen, visited.size >= uniqueSlides.length);
        }

        root.addEventListener('click', (event) => {
            const nextBtn = event.target.closest('.arrow-right-wrapper, .btn-back-3');
            const prevBtn = event.target.closest('.btn-back, .btn-back-2, .btn-back-4');
            if (nextBtn) {
                event.preventDefault();
                showSlide(index + 1);
            }
            if (prevBtn) {
                event.preventDefault();
                showSlide(index - 1);
            }
        });

        return {
            ready: () => visited.size >= uniqueSlides.length,
            required: uniqueSlides.length
        };
    }

    function initAccordion(root) {
        const toggles = Array.from(root.querySelectorAll('.frame-18, .frame-15 .frame-18')).filter(el => {
            const label = (el.textContent || '').trim().toUpperCase();
            return label.includes('ПОДРОБНЕЕ') || label.includes('ПОДРОБНЕ');
        });
        if (toggles.length === 0) return null;

        const opened = new Set();
        toggles.forEach((toggle, i) => {
            toggle.addEventListener('click', (event) => {
                event.preventDefault();
                const panel = toggle.closest('.frame-15, .frame-7')?.querySelector('.frame-19, .frame-20');
                if (panel) {
                    panel.classList.toggle('is-open');
                    panel.style.display = panel.classList.contains('is-open') ? 'block' : 'none';
                }
                opened.add(i);
                setGate(activeScreen, opened.size >= toggles.length);
            });
        });

        root.querySelectorAll('.frame-19, .frame-20').forEach(panel => {
            if (!panel.classList.contains('is-open')) panel.style.display = 'none';
        });

        return {
            ready: () => opened.size >= toggles.length,
            required: toggles.length
        };
    }

    function initFlipCards(root) {
        const cards = Array.from(root.querySelectorAll('[data-flip], .flip-card, .frame-8[data-flip-card]'));
        if (cards.length === 0) return null;

        const flipped = new Set();
        cards.forEach((card, i) => {
            card.addEventListener('click', () => {
                card.classList.toggle('is-flipped');
                if (card.classList.contains('is-flipped')) flipped.add(i);
                setGate(activeScreen, flipped.size >= cards.length);
            });
        });

        return {
            ready: () => flipped.size >= cards.length,
            required: cards.length
        };
    }

    function initQuiz(root) {
        const quiz = root.querySelector('[data-quiz]');
        if (!quiz) return null;

        let solved = false;
        const correct = quiz.dataset.correct || '';
        quiz.addEventListener('click', (event) => {
            const option = event.target.closest('[data-option]');
            if (!option || solved) return;
            if (String(option.dataset.option) === String(correct)) {
                solved = true;
                option.classList.add('is-correct');
                setGate(activeScreen, true);
            } else {
                option.classList.add('is-wrong');
            }
        });

        return { ready: () => solved, required: 1 };
    }

    function initMarkers(root) {
        const markers = Array.from(root.querySelectorAll('[data-marker], .marker-point, .qlementine-icons-wrapper'));
        if (markers.length < 2) return null;

        const clicked = new Set();
        markers.forEach((marker, i) => {
            marker.style.cursor = 'pointer';
            marker.addEventListener('click', () => {
                marker.classList.add('is-active');
                clicked.add(i);
                setGate(activeScreen, clicked.size >= markers.length);
            });
        });

        return {
            ready: () => clicked.size >= markers.length,
            required: markers.length
        };
    }

    function scanScreen(screenEl, screenId) {
        activeScreen = screenId;
        const requirements = [];

        const slider = initSlider(screenEl);
        if (slider) requirements.push(slider);

        const accordion = initAccordion(screenEl);
        if (accordion) requirements.push(accordion);

        const flip = initFlipCards(screenEl);
        if (flip) requirements.push(flip);

        const quiz = initQuiz(screenEl);
        if (quiz) requirements.push(quiz);

        const markers = initMarkers(screenEl);
        if (markers) requirements.push(markers);

        if (requirements.length === 0) {
            setGate(screenId, true);
            return { required: 0, ready: true };
        }

        const ready = () => requirements.every(req => req.ready());
        setGate(screenId, ready());
        return {
            required: requirements.reduce((sum, req) => sum + (req.required || 1), 0),
            ready: ready()
        };
    }

    function bindGateListener(callback) {
        onGateChange = callback;
    }

    return {
        scanScreen,
        isGateReady,
        bindGateListener
    };
})();
