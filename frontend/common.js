const API_URL = 'http://127.0.0.1:5000/api';

const SERVER_URL = 'http://127.0.0.1:5000';



const ROLE_LABELS = {

    expert: 'Эксперт',

    admin: 'Администратор',

    student: 'Обучающийся'

};



const STUDENT_NAV = [

    { href: 'instruction.html', label: 'Моё обучение', page: 'instruction' },

    { href: 'rating.html', label: 'Рейтинг', page: 'rating' }

];



const EXPERT_NAV = [

    { href: 'rating.html', label: 'Рейтинг', page: 'rating' },

    { href: 'assignments.html', label: 'Назначения', page: 'assignments' },

    { href: 'instruction.html', label: 'Моё обучение', page: 'instruction' }

];



const ADMIN_NAV = [

    { href: 'users.html', label: 'Пользователи', page: 'users' },

    { href: 'admin-courses.html', label: 'Курсы', page: 'courses' }

];



const PAGE_ACCESS = {

    'users.html': ['admin'],

    'admin-courses.html': ['admin'],

    'assignments.html': ['expert'],

    'instruction.html': ['student', 'expert'],

    'rating.html': ['student', 'expert', 'admin'],

    'profile.html': ['student', 'expert', 'admin'],

    'glossary.html': ['student'],

    'my_learning.html': ['student', 'expert']

};



function getCurrentPage() {

    return window.location.pathname.split('/').pop() || 'index.html';

}



function getAuthToken() {

    return sessionStorage.getItem('authToken');

}



function getUserRole() {

    return sessionStorage.getItem('userRole') || 'student';

}



function getHomePage() {

    return sessionStorage.getItem('homePage') || getDefaultPageForRole(getUserRole());

}



function isExpert() {

    return getUserRole() === 'expert';

}



function isAdmin() {

    return getUserRole() === 'admin';

}



function isExpertOrAdmin() {

    const role = getUserRole();

    return role === 'expert' || role === 'admin';

}



function getDefaultPageForRole(role) {

    if (role === 'admin') return 'users.html';

    if (role === 'expert') return 'assignments.html';

    return 'instruction.html';

}



function getNavForRole() {

    const role = getUserRole();

    if (role === 'admin') return ADMIN_NAV;

    if (role === 'expert') return EXPERT_NAV;

    return STUDENT_NAV;

}



function saveAuthSession(data) {

    sessionStorage.setItem('authToken', data.token);

    sessionStorage.setItem('userRole', data.role);

    sessionStorage.setItem('userId', String(data.user_id || ''));

    sessionStorage.setItem('userName', data.full_name || '');

    sessionStorage.setItem('homePage', data.home_page || getDefaultPageForRole(data.role));

}



function clearAuthSession() {

    sessionStorage.removeItem('authToken');

    sessionStorage.removeItem('userRole');

    sessionStorage.removeItem('userId');

    sessionStorage.removeItem('userName');

    sessionStorage.removeItem('homePage');

}



async function ensureAuthSession() {

    if (!getAuthToken()) {

        return null;

    }



    try {

        const response = await fetch(`${API_URL}/auth/me`, {

            headers: { Authorization: `Bearer ${getAuthToken()}` }

        });



        if (!response.ok) {

            clearAuthSession();

            return null;

        }



        const session = await response.json();

        sessionStorage.setItem('userRole', session.role);

        sessionStorage.setItem('userId', String(session.user_id));

        sessionStorage.setItem('userName', session.full_name || '');

        sessionStorage.setItem('homePage', session.home_page || getDefaultPageForRole(session.role));

        return session;

    } catch (error) {

        console.error('Ошибка проверки сессии:', error);

        return null;

    }

}



async function bootstrapAuth() {

    const page = getCurrentPage();

    if (page === 'login.html') {

        return null;

    }



    const session = await ensureAuthSession();

    if (!session) {

        window.location.href = 'login.html';

        return null;

    }



    const allowedRoles = PAGE_ACCESS[page];

    if (allowedRoles && !allowedRoles.includes(session.role)) {

        window.location.href = session.home_page || getDefaultPageForRole(session.role);

        return null;

    }



    return session;

}



async function requireRole(...roles) {

    const session = await (window.authReady || bootstrapAuth());

    if (!session) {

        return null;

    }

    if (roles.length && !roles.includes(session.role)) {

        window.location.href = session.home_page || getDefaultPageForRole(session.role);

        return null;

    }

    return session;

}



function requireAuth() {

    if (!getAuthToken() && getCurrentPage() !== 'login.html') {

        window.location.href = 'login.html';

        return false;

    }

    return true;

}



function logout() {

    clearAuthSession();

    window.location.href = 'login.html';

}



function buildNavItems(activePage) {

    return getNavForRole().map(item => `

        <a href="${item.href}" class="nav-link${item.page === activePage ? ' active' : ''}">

            ${item.label}

        </a>

    `).join('');

}



function getAccountMenuHtml(role) {

    if (role === 'admin') {

        return `

            <a href="profile.html" class="account-link">Открыть профиль</a>

            <button type="button" class="account-link account-link-danger" id="logout-link">Выйти</button>

        `;

    }

    if (role === 'student') {

        return `

            <button type="button" class="account-link" id="feedback-link">Обратная связь</button>

            <a href="profile.html" class="account-link">Открыть профиль</a>

            <button type="button" class="account-link account-link-danger" id="logout-link">Выйти</button>

        `;

    }

    return `

        <a href="profile.html" class="account-link">Личный кабинет</a>

        <button type="button" class="account-link" id="feedback-link">Обратная связь</button>

        <a href="profile.html?edit=1" class="account-link">Редактировать профиль</a>

        <button type="button" class="account-link account-link-danger" id="logout-link">Выйти</button>

    `;

}



function initAppHeader(activePage) {

    const header = document.querySelector('.app-header');

    if (!header) return;



    const role = getUserRole();

    const nav = header.querySelector('nav');

    if (nav) nav.innerHTML = buildNavItems(activePage);



    let accountBtn = header.querySelector('.account-menu-btn');

    if (!accountBtn) {

        accountBtn = document.createElement('button');

        accountBtn.type = 'button';

        accountBtn.className = 'account-menu-btn';

        accountBtn.setAttribute('aria-label', 'Мой аккаунт');

        accountBtn.textContent = '☰';

        header.appendChild(accountBtn);

    }



    const oldHamburger = header.querySelector('.hamburger-menu');

    if (oldHamburger) oldHamburger.remove();



    let dropdown = document.getElementById('account-dropdown');

    if (!dropdown) {

        dropdown = document.createElement('div');

        dropdown.id = 'account-dropdown';

        dropdown.className = 'account-dropdown';

        document.body.appendChild(dropdown);

    }



    dropdown.innerHTML = `

        <div class="account-dropdown-header">

            <div id="account-role" class="account-role"></div>

            <div id="account-name" class="account-name"></div>

            <div id="account-position" class="account-position"></div>

        </div>

        <div class="account-dropdown-actions">

            ${getAccountMenuHtml(role)}

        </div>

    `;



    accountBtn.onclick = (event) => {

        event.stopPropagation();

        dropdown.classList.toggle('open');

        if (dropdown.classList.contains('open')) loadAccountPreview();

    };



    document.getElementById('logout-link').onclick = logout;



    const feedbackLink = document.getElementById('feedback-link');

    if (feedbackLink) {

        feedbackLink.onclick = () => {

            dropdown.classList.remove('open');

            window.location.href = 'profile.html?tab=feedback';

        };

    }



    document.addEventListener('click', (event) => {

        if (!dropdown.contains(event.target) && event.target !== accountBtn) {

            dropdown.classList.remove('open');

        }

    });



    loadAccountPreview();

}



async function loadAccountPreview() {

    const roleEl = document.getElementById('account-role');

    const nameEl = document.getElementById('account-name');

    const positionEl = document.getElementById('account-position');

    if (!roleEl || !nameEl || !positionEl || !getAuthToken()) return;



    const cachedName = sessionStorage.getItem('userName');

    roleEl.textContent = ROLE_LABELS[getUserRole()] || 'Пользователь';

    nameEl.textContent = cachedName || 'Пользователь';

    positionEl.textContent = '';



    try {

        const response = await fetch(`${API_URL}/auth/me`, {

            headers: { Authorization: `Bearer ${getAuthToken()}` }

        });

        if (!response.ok) throw new Error('auth');

        const session = await response.json();

        roleEl.textContent = session.role_name || ROLE_LABELS[session.role];

        nameEl.textContent = session.full_name || cachedName || 'Пользователь';

        if (session.role === 'admin') {

            positionEl.textContent = `Логин: ${session.email}`;

        } else {

            const profileResponse = await fetch(`${API_URL}/profile`, {

                headers: { Authorization: `Bearer ${getAuthToken()}` }

            });

            if (profileResponse.ok) {

                const profile = await profileResponse.json();

                positionEl.textContent = profile.position_name || '';

            }

        }

    } catch (error) {

        roleEl.textContent = ROLE_LABELS[getUserRole()] || 'Пользователь';

    }

}



async function apiFetch(path, options = {}) {

    const headers = {

        ...(options.headers || {}),

        Authorization: `Bearer ${getAuthToken()}`

    };

    if (options.body && !headers['Content-Type']) {

        headers['Content-Type'] = 'application/json';

    }

    return fetch(`${API_URL}${path}`, { ...options, headers });

}



function buildPhotoUrl(photoUrl) {

    if (!photoUrl) return null;

    if (photoUrl.startsWith('http')) return photoUrl;

    return `${SERVER_URL}${photoUrl}`;

}



async function uploadPhoto(endpoint, fileInput) {

    const file = fileInput.files[0];

    if (!file) return null;

    const formData = new FormData();

    formData.append('photo', file);

    const response = await fetch(`${API_URL}${endpoint}`, {

        method: 'POST',

        headers: { Authorization: `Bearer ${getAuthToken()}` },

        body: formData

    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.message || 'Ошибка загрузки фото');

    return data;

}



function initPhotoUpload({ zoneId, inputId, previewId, selectBtnId }) {

    const zoneEl = document.getElementById(zoneId);

    const inputEl = document.getElementById(inputId);

    const previewEl = document.getElementById(previewId);

    const wrapEl = zoneEl?.querySelector('.photo-upload-preview-wrap');

    const btnEl = selectBtnId ? document.getElementById(selectBtnId) : null;



    if (!zoneEl || !inputEl || !previewEl || !wrapEl) {

        return { setPreview() {}, reset() {}, getInput() { return null; } };

    }



    function openPicker() {

        inputEl.click();

    }



    function setPreview(url) {

        if (!url) {

            previewEl.hidden = true;

            previewEl.removeAttribute('src');

            wrapEl.classList.remove('has-image');

            return;

        }

        const src = (url.startsWith('blob:') || url.startsWith('http'))

            ? url

            : buildPhotoUrl(url);

        previewEl.src = src;

        previewEl.hidden = false;

        wrapEl.classList.add('has-image');

    }



    function reset() {

        setPreview(null);

        inputEl.value = '';

    }



    if (btnEl) {

        btnEl.addEventListener('click', (e) => {

            e.stopPropagation();

            openPicker();

        });

    }



    zoneEl.addEventListener('click', () => openPicker());



    zoneEl.addEventListener('dragover', (e) => {

        e.preventDefault();

        zoneEl.classList.add('dragover');

    });



    zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('dragover'));



    zoneEl.addEventListener('drop', (e) => {

        e.preventDefault();

        zoneEl.classList.remove('dragover');

        const file = e.dataTransfer.files[0];

        if (!file || !file.type.startsWith('image/')) return;

        const dt = new DataTransfer();

        dt.items.add(file);

        inputEl.files = dt.files;

        inputEl.dispatchEvent(new Event('change'));

    });



    inputEl.addEventListener('change', () => {

        const file = inputEl.files[0];

        if (!file) {

            setPreview(null);

            return;

        }

        setPreview(URL.createObjectURL(file));

    });



    return { setPreview, reset, getInput: () => inputEl, openPicker };

}



function formatBirthday(isoDate) {

    if (!isoDate) return 'не указан';

    const date = new Date(isoDate);

    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

    return `${date.getDate()} ${months[date.getMonth()]}`;

}

