(function () {
    const API = window.API_1484_11 = {};
    const cache = {};
    let initialized = false;
    let terminated = false;
    let lastError = '0';

    function params() {
        return new URLSearchParams(window.location.search);
    }

    function apiUrl(path) {
        const origin = window.location.origin;
        const base = origin.includes(':5000') ? `${origin}/api` : 'http://127.0.0.1:5000/api';
        return `${base}${path}`;
    }

    function authHeaders() {
        const token = params().get('authToken') || sessionStorage.getItem('authToken');
        return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    }

    function courseId() {
        const match = window.location.pathname.match(/course-content\/(\d+)/);
        return match ? match[1] : null;
    }

    function assignmentId() {
        return params().get('assignment_id');
    }

    function setError(code) {
        lastError = String(code);
        return 'false';
    }

    function applyState(data) {
        if (!data || !data.values) return;
        Object.assign(cache, data.values);
    }

    async function loadState() {
        const cid = courseId();
        const aid = assignmentId();
        if (!cid || !aid) return;
        try {
            const response = await fetch(
                `${apiUrl(`/scorm/${cid}/state`)}?assignment_id=${encodeURIComponent(aid)}`,
                { headers: authHeaders() }
            );
            if (response.ok) {
                applyState(await response.json());
            }
        } catch (error) {
            console.warn('SCORM state load failed', error);
        }
    }

    async function persistState() {
        const cid = courseId();
        const aid = assignmentId();
        if (!cid || !aid) return;
        try {
            await fetch(`${apiUrl(`/scorm/${cid}/state`)}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ assignment_id: Number(aid), values: { ...cache } })
            });
        } catch (error) {
            console.warn('SCORM state save failed', error);
        }
    }

    API.Initialize = function () {
        if (initialized || terminated) return setError('103');
        initialized = true;
        lastError = '0';
        return 'true';
    };

    API.Terminate = function () {
        if (!initialized) return setError('112');
        if (terminated) return setError('113');
        API.Commit('');
        terminated = true;
        const returnUrl = params().get('returnUrl');
        if (returnUrl) {
            setTimeout(() => { window.location.href = returnUrl; }, 300);
        }
        return 'true';
    };

    API.GetValue = function (element) {
        if (!initialized || terminated) {
            setError('122');
            return '';
        }
        if (!(element in cache)) {
            if (element === 'cmi.completion_status') return 'unknown';
            if (element === 'cmi.success_status') return 'unknown';
            if (element === 'cmi.entry') return 'ab-initio';
            if (element === 'cmi.mode') return 'normal';
            if (element === 'cmi.credit') return 'credit';
            if (element === 'cmi.learner_id') return 'learner';
            if (element === 'cmi.learner_name') return 'Learner';
            if (element === 'cmi.location') return '';
            if (element === 'cmi.suspend_data') return '';
            if (element === 'cmi.progress_measure') return '';
            if (element === 'cmi.score.raw') return '';
            if (element === 'cmi.score.scaled') return '';
            if (element === 'cmi.score.min') return '0';
            if (element === 'cmi.score.max') return '100';
            setError('401');
            return '';
        }
        lastError = '0';
        return String(cache[element]);
    };

    API.SetValue = function (element, value) {
        if (!initialized || terminated) return setError('122');
        cache[element] = String(value);
        lastError = '0';
        return 'true';
    };

    API.Commit = function () {
        if (!initialized) return setError('122');
        persistState();
        lastError = '0';
        return 'true';
    };

    API.GetLastError = function () {
        return lastError;
    };

    API.GetErrorString = function () {
        return '';
    };

    API.GetDiagnostic = function () {
        return '';
    };

    window.addEventListener('DOMContentLoaded', () => {
        loadState().then(() => {
            const frame = document.getElementById('scorm-frame');
            const launch = document.body.dataset.launchHref;
            if (frame && launch) {
                frame.src = launch;
            }
        });
    });
})();
