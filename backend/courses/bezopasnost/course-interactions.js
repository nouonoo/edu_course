const CourseInteractions = (() => {
    let activeScreen = null;
    let onGateChange = null;
    const gateState = new Map();
    const screenRequirements = new Map();
    const outroByScreen = new Map();

    function isSectionOutro(el) {
        return el.matches('article[class*="-part--outro"]:not(.intro-part)');
    }

    function queryGatedBlocks(root, gateId) {
        return Array.from(root.querySelectorAll(`[data-gated-by="${gateId}"]`))
            .filter((el) => !isSectionOutro(el));
    }

    function isInteractionsReady(screenId) {
        const reqs = screenRequirements.get(screenId) || [];
        return reqs.length === 0 || reqs.every((req) => req.ready());
    }

    function isScreenFullyReady(screenId) {
        if (isInteractionsReady(screenId)) return true;
        const section = typeof LMSBridge !== 'undefined' ? LMSBridge.getSectionByScreen(screenId) : null;
        if (section && LMSBridge.isSectionCompleted(section.id)) {
            return true;
        }
        return false;
    }

    function syncOutroVisibility(screenId, ready) {
        (outroByScreen.get(screenId) || []).forEach((el) => {
            el.classList.toggle('is-locked', !ready);
        });
    }

    function updateOutroGate(screenId) {
        syncOutroVisibility(screenId, isInteractionsReady(screenId));
    }

    function setGate(screenId, ready) {
        const prev = gateState.get(screenId);
        gateState.set(screenId, ready);
        if (prev !== ready && typeof onGateChange === 'function') {
            onGateChange(screenId, ready);
        }
    }

    function updateCombinedGate(screenId) {
        setGate(screenId, isScreenFullyReady(screenId));
        updateOutroGate(screenId);
    }

    function isGateReady(screenId) {
        return gateState.get(screenId) !== false;
    }

    function initSliders(root) {
        const sliders = Array.from(root.querySelectorAll('[data-slider]'));
        if (sliders.length === 0) return null;

        const states = sliders.map((sliderEl) => {
            const slides = Array.from(sliderEl.querySelectorAll('[data-slide]'));
            if (slides.length === 0) return { ready: () => true, required: 0 };

            let index = 0;
            const visited = new Set([0]);
            const sliderId = sliderEl.dataset.sliderId;
            const gatedBlocks = sliderId
                ? Array.from(root.querySelectorAll(`[data-gated-by-slider="${sliderId}"]`))
                : [];
            const prevBtn = sliderEl.querySelector('[data-slider-prev]');
            const nextBtn = sliderEl.querySelector('[data-slider-next]');
            const dotsHost = sliderEl.parentElement?.querySelector('[data-slider-dots]');

            const dotClass = sliderEl.classList.contains('s2-slider') ? 's2-slider-dot' : 's1-slider-dot';

            function setGatedLocked(locked) {
                gatedBlocks.forEach((block) => block.classList.toggle('is-locked', locked));
            }

            function renderDots() {
                if (!dotsHost) return;
                dotsHost.innerHTML = slides.map((_, i) =>
                    `<span class="${dotClass}${i === index ? ' is-active' : ''}"></span>`
                ).join('');
            }

            function updateButtons() {
                if (prevBtn) {
                    prevBtn.disabled = index === 0;
                    prevBtn.classList.toggle('is-active', index > 0);
                }
                if (nextBtn) {
                    nextBtn.disabled = index >= slides.length - 1;
                    nextBtn.classList.toggle('is-active', index < slides.length - 1);
                }
            }

            function showSlide(nextIndex) {
                index = Math.max(0, Math.min(nextIndex, slides.length - 1));
                slides.forEach((slide, i) => {
                    slide.classList.toggle('is-active', i === index);
                    slide.style.display = i === index ? '' : 'none';
                });
                visited.add(index);
                updateButtons();
                renderDots();
                if (gatedBlocks.length) {
                    setGatedLocked(visited.size < slides.length);
                }
                updateCombinedGate(activeScreen);
            }

            slides.forEach((slide, i) => {
                if (i !== 0) slide.style.display = 'none';
            });
            updateButtons();
            renderDots();
            if (gatedBlocks.length) {
                setGatedLocked(visited.size < slides.length);
            }

            prevBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                showSlide(index - 1);
            });
            nextBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                showSlide(index + 1);
            });

            return {
                ready: () => visited.size >= slides.length,
                required: slides.length
            };
        });

        return {
            ready: () => states.every(s => s.ready()),
            required: states.reduce((sum, s) => sum + s.required, 0)
        };
    }

    function initLegacySlider(root) {
        const slides = Array.from(root.querySelectorAll('[data-slide], .frame-31, .frame-23')).filter(el => {
            if (el.closest('[data-slider]')) return false;
            return el.querySelector('.btn-back, .arrow-right-wrapper, .btn-back-2, .btn-back-3, .btn-back-4');
        });
        if (slides.length === 0) return null;

        let index = 0;
        const visited = new Set([0]);

        slides.forEach((slide, i) => {
            slide.style.display = i === 0 ? '' : 'none';
            slide.dataset.slideIndex = String(i);
        });

        function showSlide(nextIndex) {
            index = Math.max(0, Math.min(nextIndex, slides.length - 1));
            slides.forEach((slide, i) => {
                slide.style.display = i === index ? '' : 'none';
            });
            visited.add(index);
            updateCombinedGate(activeScreen);
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
            ready: () => visited.size >= slides.length,
            required: slides.length
        };
    }

    function initCourseAccordion(root) {
        const accordion = root.querySelector('[data-accordion]');
        if (!accordion) return null;

        const items = Array.from(accordion.querySelectorAll('[data-accordion-item]'));
        if (items.length === 0) return null;

        const opened = new Set();

        items.forEach((item, index) => {
            const trigger = item.querySelector('[data-accordion-trigger]');
            if (!trigger) return;

            trigger.addEventListener('click', (event) => {
                event.preventDefault();
                const isOpen = item.classList.toggle('is-open');
                trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                if (isOpen) {
                    opened.add(index);
                    updateCombinedGate(activeScreen);
                }
            });
        });

        return {
            ready: () => opened.size >= items.length,
            required: items.length
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
                updateCombinedGate(activeScreen);
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
        const requirements = [];
        const boundCards = new Set();

        function bindFlipGroup(cards, gatedBlocks) {
            const flipped = new Set();

            function setGatedLocked(locked) {
                gatedBlocks.forEach((block) => block.classList.toggle('is-locked', locked));
            }

            function syncGate() {
                if (gatedBlocks.length) {
                    setGatedLocked(flipped.size < cards.length);
                }
                updateCombinedGate(activeScreen);
            }

            function toggleCard(card, index) {
                card.classList.toggle('is-flipped');
                if (card.classList.contains('is-flipped')) flipped.add(index);
                syncGate();
            }

            cards.forEach((card, i) => {
                card.addEventListener('click', (event) => {
                    if (event.target.closest('[data-flip-toggle]') || card.hasAttribute('data-flip')) {
                        event.preventDefault();
                        toggleCard(card, i);
                    }
                });
                card.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleCard(card, i);
                    }
                });
            });

            if (gatedBlocks.length) {
                setGatedLocked(true);
            }

            requirements.push({
                ready: () => flipped.size >= cards.length,
                required: cards.length
            });
        }

        Array.from(root.querySelectorAll('[data-flip-set]')).forEach((container) => {
            const setId = container.dataset.flipSet;
            const cards = Array.from(container.querySelectorAll('[data-flip]'));
            cards.forEach((card) => boundCards.add(card));
            const gatedBlocks = Array.from(root.querySelectorAll(`[data-gated-by-flip="${setId}"]`));
            if (cards.length) bindFlipGroup(cards, gatedBlocks);
        });

        const orphanCards = Array.from(
            root.querySelectorAll('[data-flip], .flip-card, .frame-8[data-flip-card]')
        ).filter((card) => !boundCards.has(card));

        if (orphanCards.length) {
            bindFlipGroup(orphanCards, []);
        }

        if (requirements.length === 0) return null;

        return {
            ready: () => requirements.every((req) => req.ready()),
            required: requirements.reduce((sum, req) => sum + req.required, 0)
        };
    }

    function getAssignmentId() {
        return new URLSearchParams(window.location.search).get('assignment_id') || 'local';
    }

    function getDragTaskKey(screenId, taskId) {
        return `bezopasnost:${getAssignmentId()}:${screenId}:${taskId}`;
    }

    function isDragTaskPersisted(screenId, taskId) {
        try {
            return localStorage.getItem(getDragTaskKey(screenId, taskId)) === 'solved';
        } catch {
            return false;
        }
    }

    function persistDragTaskSolved(screenId, taskId) {
        try {
            localStorage.setItem(getDragTaskKey(screenId, taskId), 'solved');
        } catch {
            /* ignore quota errors */
        }
    }

    function initDragDrop(root) {
        const container = root.querySelector('[data-drag-drop]');
        if (!container) return null;

        const pool = container.querySelector('[data-drag-pool]');
        const zones = Array.from(container.querySelectorAll('[data-drop]'));
        const confirmBtn = container.querySelector('[data-drag-confirm]');
        const resetBtn = container.querySelector('[data-drag-reset]');
        const successBox = container.querySelector('[data-drag-success]');
        const errorBox = container.querySelector('[data-drag-error]');
        const taskId = container.dataset.dragTask || 'drag-drop';
        const gatedBlocks = queryGatedBlocks(root, taskId);

        if (!pool || zones.length === 0) return null;

        let solved = false;
        let dragItem = null;
        let touchOffsetY = 0;

        const initialOrder = Array.from(pool.querySelectorAll('.s1-drag-item, [data-item-id]'));

        function getItems() {
            return Array.from(container.querySelectorAll('[data-item-id]'));
        }

        function hideFeedback() {
            successBox?.classList.add('is-hidden');
            errorBox?.classList.add('is-hidden');
        }

        function allPlaced() {
            return getItems().every(item => item.parentElement?.hasAttribute('data-drop'));
        }

        function setGatedLocked(locked) {
            gatedBlocks.forEach((block) => block.classList.toggle('is-locked', locked));
        }

        function setActionButtonsActive(active) {
            [confirmBtn, resetBtn].forEach((btn) => {
                if (!btn) return;
                if (active) btn.removeAttribute('disabled');
                else btn.setAttribute('disabled', 'disabled');
            });
        }

        function applySolvedState({ showFeedback = true } = {}) {
            solved = true;
            container.classList.add('is-solved');
            hideFeedback();
            if (showFeedback) successBox?.classList.remove('is-hidden');
            setGatedLocked(false);

            getItems().forEach((item) => {
                const zone = zones.find(z => z.dataset.drop === item.dataset.correct);
                if (zone) zone.appendChild(item);
                item.draggable = false;
            });

            setActionButtonsActive(false);
            updateCombinedGate(activeScreen);
        }

        function checkAnswer() {
            if (solved) return;
            hideFeedback();
            setActionButtonsActive(false);

            if (!allPlaced()) {
                errorBox?.classList.remove('is-hidden');
                return;
            }

            const correct = getItems().every(item => {
                const zone = item.parentElement?.dataset.drop;
                return zone === item.dataset.correct;
            });

            if (correct) {
                persistDragTaskSolved(activeScreen, taskId);
                applySolvedState();
            } else {
                errorBox?.classList.remove('is-hidden');
            }
        }

        function reset() {
            if (solved) return;
            hideFeedback();
            initialOrder.forEach(item => {
                item.draggable = true;
                item.classList.remove('is-dragging');
                pool.appendChild(item);
            });
            setActionButtonsActive(true);
        }

        if (isDragTaskPersisted(activeScreen, taskId)) {
            applySolvedState({ showFeedback: true });
        } else {
            setGatedLocked(true);
        }

        function moveItemTo(item, target) {
            if (!item || !target) return;
            target.appendChild(item);
        }

        container.addEventListener('dragstart', (event) => {
            const item = event.target.closest('[data-item-id]');
            if (!item || solved) {
                event.preventDefault();
                return;
            }
            dragItem = item;
            item.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.dataset.itemId || '');
        });

        container.addEventListener('dragend', (event) => {
            const item = event.target.closest('[data-item-id]');
            item?.classList.remove('is-dragging');
            dragItem = null;
            zones.forEach(z => z.classList.remove('is-over'));
        });

        container.addEventListener('dragover', (event) => {
            const zone = event.target.closest('[data-drop], [data-drag-pool]');
            if (!zone || solved) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            zones.forEach(z => z.classList.remove('is-over'));
            if (zone.hasAttribute('data-drop')) zone.classList.add('is-over');
        });

        container.addEventListener('dragleave', (event) => {
            const zone = event.target.closest('[data-drop]');
            if (zone && !zone.contains(event.relatedTarget)) {
                zone.classList.remove('is-over');
            }
        });

        container.addEventListener('drop', (event) => {
            event.preventDefault();
            const zone = event.target.closest('[data-drop], [data-drag-pool]');
            if (!zone || !dragItem || solved) return;
            moveItemTo(dragItem, zone);
            zones.forEach(z => z.classList.remove('is-over'));
            hideFeedback();
        });

        getItems().forEach((item) => {
            item.addEventListener('touchstart', (event) => {
                if (solved) return;
                dragItem = item;
                const touch = event.touches[0];
                const rect = item.getBoundingClientRect();
                touchOffsetY = touch.clientY - rect.top;
                item.classList.add('is-dragging');
            }, { passive: true });

            item.addEventListener('touchmove', (event) => {
                if (!dragItem || solved) return;
                const touch = event.touches[0];
                dragItem.style.position = 'fixed';
                dragItem.style.zIndex = '1000';
                dragItem.style.left = `${touch.clientX - dragItem.offsetWidth / 2}px`;
                dragItem.style.top = `${touch.clientY - touchOffsetY}px`;
                dragItem.style.width = `${dragItem.offsetWidth}px`;
            }, { passive: true });

            item.addEventListener('touchend', () => {
                if (!dragItem || solved) return;
                const rect = dragItem.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                dragItem.style.position = '';
                dragItem.style.zIndex = '';
                dragItem.style.left = '';
                dragItem.style.top = '';
                dragItem.style.width = '';
                dragItem.classList.remove('is-dragging');

                const target = document.elementFromPoint(cx, cy)?.closest('[data-drop], [data-drag-pool]');
                if (target) moveItemTo(dragItem, target);
                dragItem = null;
                hideFeedback();
            });
        });

        confirmBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            checkAnswer();
        });
        resetBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            reset();
        });

        return { ready: () => solved, required: 1 };
    }

    function initQuizzes(root) {
        const quizzes = Array.from(root.querySelectorAll('[data-quiz]'));
        if (quizzes.length === 0) return null;

        const states = quizzes.map((quizEl) => {
            const quizId = quizEl.dataset.quizId || 'quiz';
            const quizType = quizEl.dataset.quizType || 'single';
            const correctSet = new Set(
                (quizEl.dataset.correct || '').split(',').map(s => s.trim()).filter(Boolean)
            );
            const options = Array.from(quizEl.querySelectorAll('[data-option]'));
            const confirmBtn = quizEl.querySelector('[data-quiz-confirm]');
            const resetBtn = quizEl.querySelector('[data-quiz-reset]');
            const retryBtns = Array.from(quizEl.querySelectorAll('[data-quiz-retry]'));
            const successBox = quizEl.querySelector('[data-quiz-feedback-success]');
            const errorBox = quizEl.querySelector('[data-quiz-feedback-error]');
            const severeBox = quizEl.querySelector('[data-quiz-feedback-severe]');
            const gatedBlocks = queryGatedBlocks(root, quizId);

            let solved = false;

            function hideFeedback() {
                successBox?.classList.add('is-hidden');
                errorBox?.classList.add('is-hidden');
                severeBox?.classList.add('is-hidden');
            }

            function setGatedLocked(locked) {
                gatedBlocks.forEach((block) => block.classList.toggle('is-locked', locked));
            }

            function getSelectedSet() {
                return new Set(
                    options
                        .filter(opt => opt.classList.contains('is-selected'))
                        .map(opt => String(opt.dataset.option))
                );
            }

            function setsEqual(a, b) {
                if (a.size !== b.size) return false;
                for (const value of a) {
                    if (!b.has(value)) return false;
                }
                return true;
            }

            function setActionButtonsActive(active) {
                [confirmBtn, resetBtn].forEach((btn) => {
                    if (!btn) return;
                    if (active) btn.removeAttribute('disabled');
                    else btn.setAttribute('disabled', 'disabled');
                });
            }

            function applySolved({ showFeedback = true } = {}) {
                solved = true;
                quizEl.classList.add('is-solved');
                hideFeedback();
                if (showFeedback) successBox?.classList.remove('is-hidden');
                setGatedLocked(false);
                options.forEach((opt) => {
                    opt.classList.add('is-disabled');
                    if (correctSet.has(String(opt.dataset.option))) {
                        opt.classList.add('is-selected');
                    }
                });
                setActionButtonsActive(false);
                persistDragTaskSolved(activeScreen, quizId);
                updateCombinedGate(activeScreen);
            }

            function checkAnswer() {
                if (solved) return;
                hideFeedback();
                const selected = getSelectedSet();
                if (selected.size === 0) return;

                setActionButtonsActive(false);

                if (setsEqual(selected, correctSet)) {
                    applySolved();
                    return;
                }

                if (severeBox && quizId === 'quiz-converter' && (selected.has('1') || selected.has('4'))) {
                    severeBox.classList.remove('is-hidden');
                } else {
                    errorBox?.classList.remove('is-hidden');
                }
            }

            function reset() {
                if (solved) return;
                hideFeedback();
                options.forEach((opt) => opt.classList.remove('is-selected', 'is-disabled'));
                setActionButtonsActive(true);
            }

            options.forEach((opt) => {
                opt.addEventListener('click', () => {
                    if (solved) return;
                    if (quizType === 'single') {
                        options.forEach(o => o.classList.remove('is-selected'));
                        opt.classList.add('is-selected');
                    } else {
                        opt.classList.toggle('is-selected');
                    }
                    hideFeedback();
                });
            });

            confirmBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                checkAnswer();
            });
            resetBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                reset();
            });
            retryBtns.forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    reset();
                });
            });

            if (isDragTaskPersisted(activeScreen, quizId)) {
                correctSet.forEach((id) => {
                    const opt = options.find(o => String(o.dataset.option) === id);
                    opt?.classList.add('is-selected');
                });
                applySolved({ showFeedback: true });
            } else {
                setGatedLocked(true);
            }

            return { ready: () => solved, required: 1 };
        });

        return {
            ready: () => states.every(s => s.ready()),
            required: states.length
        };
    }

    function initIntroParts(root) {
        const parts = Array.from(root.querySelectorAll('[data-intro-part]'));
        if (parts.length === 0) return null;

        const viewed = new Set();
        let observer = null;

        function getVisibleRatio(el) {
            const rect = el.getBoundingClientRect();
            const vh = window.innerHeight || document.documentElement.clientHeight;
            const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
            return visible / Math.max(rect.height, 1);
        }

        function isPartVisible(part) {
            const inner = part.querySelector('.intro-hero-inner, .intro-outro-inner, .intro-content-inner');
            const contentRatio = inner ? getVisibleRatio(inner) : 0;
            const partRatio = getVisibleRatio(part);
            return contentRatio >= 0.2 || partRatio >= 0.35;
        }

        function markViewed(part) {
            const id = part.dataset.introPart;
            if (!id || viewed.has(id)) return;
            viewed.add(id);
            part.classList.add('is-viewed');
            updateCombinedGate(activeScreen);
        }

        function checkAllParts() {
            parts.forEach((part) => {
                if (isPartVisible(part)) markViewed(part);
            });
        }

        const observeTargets = parts.map((part) =>
            part.querySelector('.intro-hero-inner, .intro-outro-inner, .intro-content-inner') || part
        );

        if (typeof IntersectionObserver !== 'undefined') {
            observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
                        const part = entry.target.closest('[data-intro-part]') || entry.target;
                        markViewed(part);
                    }
                });
            }, { threshold: [0.2, 0.35, 0.55, 0.75] });

            observeTargets.forEach((target) => observer.observe(target));
        }

        const onScroll = () => checkAllParts();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        checkAllParts();
        requestAnimationFrame(checkAllParts);

        return {
            ready: () => viewed.size >= parts.length,
            required: parts.length,
            destroy: () => {
                observer?.disconnect();
                window.removeEventListener('scroll', onScroll);
                window.removeEventListener('resize', onScroll);
            }
        };
    }

    function initMarkerModals(root) {
        const markers = Array.from(root.querySelectorAll('[data-marker]'));
        if (markers.length === 0) return null;

        const viewed = new Set();

        function closeModal(modal) {
            if (!modal) return;
            const id = modal.dataset.markerModal;
            modal.classList.add('is-hidden');
            const marker = root.querySelector(`[data-marker="${id}"]`);
            if (marker) {
                marker.classList.remove('is-active');
                marker.classList.add('is-viewed');
                viewed.add(id);
                updateCombinedGate(activeScreen);
            }
        }

        markers.forEach((marker) => {
            const id = marker.dataset.marker;
            marker.addEventListener('click', () => {
                markers.forEach(m => m.classList.remove('is-active'));
                marker.classList.add('is-active');
                root.querySelectorAll('[data-marker-modal]').forEach((modal) => {
                    modal.classList.add('is-hidden');
                });
                const modal = root.querySelector(`[data-marker-modal="${id}"]`);
                modal?.classList.remove('is-hidden');
            });
        });

        root.querySelectorAll('[data-modal-close]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                closeModal(btn.closest('[data-marker-modal]'));
            });
        });

        root.querySelectorAll('[data-marker-modal]').forEach((modal) => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(modal);
            });
        });

        return {
            ready: () => viewed.size >= markers.length,
            required: markers.length
        };
    }

    function scanScreen(screenEl, screenId) {
        activeScreen = screenId;
        if (!screenEl) {
            setGate(screenId, true);
            return { required: 0, ready: true };
        }

        if (screenEl.dataset.interactionsBound === 'true') {
            const existing = screenRequirements.get(screenId) || [];
            const ready = isScreenFullyReady(screenId);
            setGate(screenId, ready);
            updateOutroGate(screenId);
            return {
                required: existing.reduce((sum, req) => sum + (req.required || 1), 0),
                ready
            };
        }
        screenEl.dataset.interactionsBound = 'true';

        const outros = Array.from(screenEl.querySelectorAll('article[class*="-part--outro"]:not(.intro-part)'));
        outroByScreen.set(screenId, outros);
        outros.forEach((el) => el.classList.add('is-locked'));

        const requirements = [];

        const sliders = initSliders(screenEl);
        if (sliders) requirements.push(sliders);

        const legacySlider = initLegacySlider(screenEl);
        if (legacySlider) requirements.push(legacySlider);

        const courseAccordion = initCourseAccordion(screenEl);
        if (courseAccordion) requirements.push(courseAccordion);

        const accordion = initAccordion(screenEl);
        if (accordion) requirements.push(accordion);

        const flip = initFlipCards(screenEl);
        if (flip) requirements.push(flip);

        const dragDrop = initDragDrop(screenEl);
        if (dragDrop) requirements.push(dragDrop);

        const quizzes = initQuizzes(screenEl);
        if (quizzes) requirements.push(quizzes);

        const markerModals = initMarkerModals(screenEl);
        if (markerModals) requirements.push(markerModals);

        const introParts = initIntroParts(screenEl);
        if (introParts) requirements.push(introParts);

        screenRequirements.set(screenId, requirements);

        if (requirements.length === 0) {
            setGate(screenId, true);
            updateOutroGate(screenId);
            return { required: 0, ready: true };
        }

        const ready = isScreenFullyReady(screenId);
        setGate(screenId, ready);
        updateOutroGate(screenId);
        return {
            required: requirements.reduce((sum, req) => sum + (req.required || 1), 0),
            ready
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
