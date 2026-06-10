document.addEventListener('DOMContentLoaded', async () => {

    if (!(await requireRole('admin'))) return;

    initAppHeader('users');



    const usersList = document.getElementById('users-list');

    const userSearch = document.getElementById('user-search');

    const userModal = document.getElementById('user-modal');

    const deleteModal = document.getElementById('delete-user-modal');

    const userForm = document.getElementById('user-form');

    const userFormError = document.getElementById('user-form-error');

    const photoUpload = initPhotoUpload({

        zoneId: 'photo-field',

        inputId: 'user-photo',

        previewId: 'user-photo-preview',

        selectBtnId: 'photo-select-btn'

    });

    const userPhotoInput = photoUpload.getInput();

    const submitBtn = document.getElementById('user-submit-btn');

    let positions = [];

    let roles = [];

    let deleteUserId = null;



    function closeAllMenus() {

        document.querySelectorAll('.actions-menu.open').forEach(m => m.classList.remove('open'));

        document.querySelectorAll('.btn-actions.open').forEach(b => b.classList.remove('open'));

    }



    async function loadMeta() {

        const [posRes, rolesRes] = await Promise.all([

            apiFetch('/admin/positions'),

            apiFetch('/admin/roles')

        ]);

        positions = posRes.ok ? await posRes.json() : [];

        roles = rolesRes.ok ? await rolesRes.json() : [];



        const posSelect = document.getElementById('user-position');

        posSelect.innerHTML = '<option value="">—</option>';

        positions.forEach(p => {

            posSelect.innerHTML += `<option value="${p.position_id}">${p.name}</option>`;

        });



        const roleSelect = document.getElementById('user-role');

        roleSelect.innerHTML = '';

        roles.forEach(r => {

            roleSelect.innerHTML += `<option value="${r.role_id}">${r.role_name}</option>`;

        });

    }



    async function loadUsers(search = '') {

        const url = search ? `/admin/users?search=${encodeURIComponent(search)}` : '/admin/users';

        const response = await apiFetch(url);

        if (!response.ok) {

            usersList.innerHTML = '<p class="error-message">Ошибка загрузки</p>';

            return;

        }

        const users = await response.json();

        usersList.innerHTML = users.map(user => `

            <div class="admin-entry" data-id="${user.user_id}">

                <span class="admin-entry-name">${user.full_name}</span>

                <div class="admin-entry-actions">

                    <button type="button" class="btn-actions" data-menu="user-${user.user_id}">Действия</button>

                    <div class="actions-menu" id="menu-user-${user.user_id}">

                        <button type="button" class="edit-user" data-id="${user.user_id}">Редактировать пользователя</button>

                        <button type="button" class="danger delete-user" data-id="${user.user_id}">Удалить пользователя</button>

                    </div>

                </div>

            </div>

        `).join('') || '<p class="subtitle" style="padding:20px;">Пользователи не найдены</p>';



        usersList.querySelectorAll('.btn-actions').forEach(btn => {

            btn.addEventListener('click', (e) => {

                e.stopPropagation();

                const menu = document.getElementById(`menu-${btn.dataset.menu}`);

                const isOpen = menu.classList.contains('open');

                closeAllMenus();

                if (!isOpen) {

                    menu.classList.add('open');

                    btn.classList.add('open');

                }

            });

        });



        usersList.querySelectorAll('.edit-user').forEach(btn => {

            btn.addEventListener('click', () => {

                closeAllMenus();

                openEditUser(btn.dataset.id);

            });

        });

        usersList.querySelectorAll('.delete-user').forEach(btn => {

            btn.addEventListener('click', () => {

                closeAllMenus();

                deleteUserId = btn.dataset.id;

                deleteModal.style.display = 'flex';

            });

        });

    }



    document.addEventListener('click', closeAllMenus);



    function openAddUser() {

        document.getElementById('user-modal-title').textContent = 'Добавление сотрудника';

        submitBtn.textContent = 'добавить';

        submitBtn.classList.remove('save-btn');

        userForm.reset();

        document.getElementById('user-id').value = '';

        document.getElementById('user-password').required = true;

        photoUpload.reset();

        userModal.style.display = 'flex';

    }



    async function openEditUser(userId) {

        const response = await apiFetch(`/admin/users/${userId}`);

        if (!response.ok) return;

        const user = await response.json();

        document.getElementById('user-modal-title').textContent = 'Редактировать данные';

        submitBtn.textContent = 'Сохранить';

        submitBtn.classList.add('save-btn');

        document.getElementById('user-id').value = user.user_id;

        document.getElementById('user-surname').value = user.surname;

        document.getElementById('user-name').value = user.name;

        document.getElementById('user-patronymic').value = user.patronymic || '';

        document.getElementById('user-email').value = user.email;

        document.getElementById('user-birthday').value = user.birthday || '';

        document.getElementById('user-phone').value = user.phone || '';

        document.getElementById('user-position').value = user.position_id || '';

        document.getElementById('user-status').value = user.status || 'active';

        document.getElementById('user-password').required = false;

        const role = roles.find(r => r.role_name === user.role_name);

        if (role) document.getElementById('user-role').value = role.role_id;

        photoUpload.setPreview(user.photo_url);

        userModal.style.display = 'flex';

    }



    document.getElementById('add-user-btn').addEventListener('click', openAddUser);

    document.getElementById('close-user-modal').addEventListener('click', () => userModal.style.display = 'none');

    document.getElementById('cancel-delete-user').addEventListener('click', () => {

        deleteModal.style.display = 'none';

        deleteUserId = null;

    });



    document.getElementById('confirm-delete-user').addEventListener('click', async () => {

        if (!deleteUserId) return;

        const response = await apiFetch(`/admin/users/${deleteUserId}`, { method: 'DELETE' });

        const data = await response.json();

        deleteModal.style.display = 'none';

        if (!response.ok) alert(data.message);

        else loadUsers(userSearch.value);

        deleteUserId = null;

    });



    userSearch.addEventListener('input', () => loadUsers(userSearch.value));



    userForm.addEventListener('submit', async (e) => {

        e.preventDefault();

        userFormError.textContent = '';

        const userId = document.getElementById('user-id').value;

        const payload = {

            surname: document.getElementById('user-surname').value,

            name: document.getElementById('user-name').value,

            patronymic: document.getElementById('user-patronymic').value,

            email: document.getElementById('user-email').value,

            birthday: document.getElementById('user-birthday').value || null,

            phone: document.getElementById('user-phone').value,

            position_id: document.getElementById('user-position').value || null,

            status: document.getElementById('user-status').value,

            role_id: parseInt(document.getElementById('user-role').value, 10)

        };

        const password = document.getElementById('user-password').value;

        if (!userId && !password) {

            userFormError.textContent = 'Укажите пароль для нового сотрудника';

            return;

        }

        if (password) payload.password_hash = password;



        const response = userId

            ? await apiFetch(`/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) })

            : await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify({ ...payload, password_hash: password }) });



        const data = await response.json();

        if (!response.ok) {

            userFormError.textContent = data.message || 'Ошибка сохранения';

            return;

        }



        const savedUserId = userId || data.user_id;

        if (savedUserId && userPhotoInput.files[0]) {

            try {

                await uploadPhoto(`/admin/users/${savedUserId}/photo`, userPhotoInput);

            } catch (photoError) {

                userFormError.textContent = photoError.message;

                return;

            }

        }



        userModal.style.display = 'none';

        loadUsers(userSearch.value);

    });



    loadMeta().then(() => loadUsers());

});

