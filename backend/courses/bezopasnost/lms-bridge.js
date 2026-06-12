const LMSBridge = (() => {
    const API_URL = (() => {
        const origin = window.location.origin;
        if (origin.includes(':5000')) return `${origin}/api`;
        return 'http://127.0.0.1:5000/api';
    })();

    let courseId = null;
    let assignmentId = null;
    let authToken = null;
    let manifest = null;
    let passThreshold = 70;
    let sectionWeight = 0;
    const completedSections = new Set();
    const listeners = [];

    function emit(event, payload) {
        listeners.forEach(fn => fn(event, payload));
    }

    function on(event, handler) {
        listeners.push((e, p) => { if (e === event) handler(p); });
    }

    function resolveCourseId() {
        const pathMatch = window.location.pathname.match(/course-content\/(\d+)/);
        if (pathMatch) return parseInt(pathMatch[1], 10);
        const params = new URLSearchParams(window.location.search);
        return parseInt(params.get('course_id') || '0', 10);
    }

    function isScorableSection(section) {
        if (!section) return false;
        if (section.scorable === false) return false;
        if (section.type === 'splash' || section.type === 'intro' || section.type === 'conclusion') return false;
        return true;
    }

    function isSectionCompleted(sectionId) {
        return completedSections.has(sectionId);
    }

    function isSectionUnlocked(sectionId) {
        const sections = manifest?.sections || [];
        const index = sections.findIndex(s => s.id === sectionId);
        if (index < 0) return false;

        const section = sections[index];
        if (section.type === 'splash') return true;
        if (isSectionCompleted(sectionId)) return true;

        for (let i = 0; i < index; i++) {
            const prev = sections[i];
            if (prev.type === 'splash') continue;
            if (!isSectionCompleted(prev.id)) return false;
        }
        return true;
    }

    function getSectionByScreen(screenId) {
        return (manifest?.sections || []).find(s => s.screen === screenId && s.type !== 'practical') || null;
    }

    function getResumeScreen() {
        const sections = manifest?.sections || [];
        for (const section of sections) {
            if (section.type === 'splash') continue;
            if (isScorableSection(section) && !isSectionCompleted(section.id)) {
                return section.screen;
            }
            if (!isScorableSection(section) && section.screen !== 'splash' && !isSectionCompleted(section.id)) {
                return section.screen;
            }
        }
        return 'splash';
    }

    function redirectToLogin(message) {
        sessionStorage.removeItem('authToken');
        const returnUrl = getReturnUrl();
        const loginUrl = new URL(returnUrl);
        loginUrl.pathname = loginUrl.pathname.replace(/[^/]+$/, 'login.html');
        loginUrl.search = '';
        if (message) sessionStorage.setItem('authRedirectMessage', message);
        window.location.replace(loginUrl.toString());
    }

    async function init() {
        const params = new URLSearchParams(window.location.search);
        courseId = resolveCourseId();
        assignmentId = params.get('assignment_id');
        authToken = params.get('authToken') || sessionStorage.getItem('authToken');

        if (!courseId || !assignmentId) throw new Error('Назначение или курс не найдены');
        if (!authToken) {
            redirectToLogin('Сессия истекла. Войдите снова, чтобы продолжить курс.');
            return null;
        }

        sessionStorage.setItem('authToken', authToken);

        const response = await fetch(
            `${API_URL}/courses/${courseId}?assignment_id=${assignmentId}`,
            { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (response.status === 401) {
            redirectToLogin('Сессия истекла. Войдите снова, чтобы продолжить курс.');
            return null;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Курс недоступен');

        manifest = data.manifest;
        passThreshold = data.pass_threshold || 70;
        sectionWeight = manifest?.section_weight || 0;

        (data.progress?.sections || []).forEach(item => {
            const section = (manifest?.sections || []).find(s => s.id === item.section_id);
            const isDone = item.score > 0 || (section && !isScorableSection(section));
            if (isDone) completedSections.add(item.section_id);
        });

        emit('ready', { manifest, progress: data.progress, passThreshold });
        return data;
    }

    async function completeSection(sectionId, options = {}) {
        const section = (manifest?.sections || []).find(s => s.id === sectionId);
        if (!section || section.type === 'splash' || isSectionCompleted(sectionId)) {
            return null;
        }
        const passedFirstTry = options.passedFirstTry !== false;
        const response = await fetch(
            `${API_URL}/courses/${courseId}/sections/${sectionId}/complete`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    assignment_id: assignmentId,
                    is_practical: section.type === 'practical',
                    passed_first_try: passedFirstTry,
                    section_weight: sectionWeight
                })
            }
        );
        if (response.status === 401) {
            redirectToLogin('Сессия истекла. Войдите снова, чтобы продолжить курс.');
            return null;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        completedSections.add(sectionId);
        sessionStorage.setItem(`course_resume_${assignmentId}`, sectionId);
        emit('progress', data);
        return data;
    }

    async function completeScreen(screenId, options = {}) {
        const section = getSectionByScreen(screenId);
        if (!section) return null;
        return completeSection(section.id, options);
    }

    async function finishCourse() {
        const scorableCount = manifest?.scorable_count
            || (manifest?.sections || []).filter(s => isScorableSection(s)).length;

        const response = await fetch(`${API_URL}/courses/${courseId}/finish`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({
                assignment_id: assignmentId,
                total_sections: scorableCount
            })
        });
        if (response.status === 401) {
            redirectToLogin('Сессия истекла. Войдите снова, чтобы продолжить курс.');
            return null;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        sessionStorage.removeItem(`course_resume_${assignmentId}`);
        emit('finished', data);
        return data;
    }

    function getReturnUrl() {
        return new URLSearchParams(window.location.search).get('returnUrl')
            || 'http://127.0.0.1:8000/instruction.html';
    }

    function exitCourse() {
        window.location.href = getReturnUrl();
    }

    return {
        init,
        on,
        completeSection,
        completeScreen,
        finishCourse,
        exitCourse,
        isSectionUnlocked,
        isSectionCompleted,
        isScorableSection,
        getSectionByScreen,
        getResumeScreen,
        getReturnUrl,
        get manifest() { return manifest; },
        get completedSections() { return completedSections; }
    };
})();
