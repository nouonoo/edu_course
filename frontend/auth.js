document.addEventListener('DOMContentLoaded', async () => {

    const loginForm = document.getElementById('login-form');

    const loginInput = document.getElementById('login');

    const passwordInput = document.getElementById('password');

    const errorMessage = document.getElementById('error-message');

    const redirectMessage = sessionStorage.getItem('authRedirectMessage');
    if (redirectMessage) {
        errorMessage.textContent = redirectMessage;
        sessionStorage.removeItem('authRedirectMessage');
    }

    if (getAuthToken()) {

        const session = await ensureAuthSession();

        if (session) {

            window.location.href = session.home_page || getDefaultPageForRole(session.role);

        }

        return;

    }



    loginForm.addEventListener('submit', async (event) => {

        event.preventDefault();



        const login = loginInput.value.trim();

        const password = passwordInput.value;

        errorMessage.textContent = '';



        if (!login || !password) {

            errorMessage.textContent = 'Введите логин и пароль';

            return;

        }



        try {

            const response = await fetch(`${API_URL}/login`, {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({ login, password })

            });



            const data = await response.json();



            if (!response.ok) {

                errorMessage.textContent = data.message || 'Ошибка авторизации. Проверьте логин и пароль.';

                return;

            }



            saveAuthSession(data);

            window.location.href = data.home_page || getDefaultPageForRole(data.role);

        } catch (error) {

            console.error('Ошибка сети:', error);

            errorMessage.textContent = 'Не удалось подключиться к серверу. Запустите backend: python app.py';

        }

    });

});

