document.addEventListener('DOMContentLoaded', async () => {
    if (!(await requireRole('student', 'expert', 'admin'))) return;

    const role = getUserRole();
    const activePage = role === 'admin' ? 'users' : (role === 'expert' ? 'assignments' : 'instruction');
    initAppHeader(activePage);

    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'feedback') {
        window.location.replace('profile.html');
        return;
    }
    const isEdit = params.get('edit') === '1';
    const isAdmin = role === 'admin';

    let viewPhotoUpload = null;
    let editPhotoUpload = null;
    let savedPhotoUrl = null;

    document.getElementById('profile-back').addEventListener('click', () => {
        window.location.href = getDefaultPageForRole(role);
    });

    if (isAdmin) {
        document.getElementById('profile-edit')?.remove();
        document.getElementById('profile-photo-block')?.remove();
    } else if (isEdit) {
        document.getElementById('profile-view').style.display = 'none';
        document.getElementById('profile-edit').style.display = 'block';
    }

    if (!isAdmin) {
        if (!isEdit) {
            viewPhotoUpload = initPhotoUpload({
                zoneId: 'profile-photo-field',
                inputId: 'profile-photo-input',
                previewId: 'profile-photo-preview',
                selectBtnId: 'profile-photo-select-btn'
            });

            const viewPhotoInput = viewPhotoUpload.getInput();
            const viewPhotoStatus = document.getElementById('profile-photo-status');

            viewPhotoInput?.addEventListener('change', async () => {
                if (!viewPhotoInput.files[0]) return;

                viewPhotoStatus.style.color = '#888';
                viewPhotoStatus.textContent = 'Загрузка...';

                try {
                    const data = await uploadPhoto('/profile/photo', viewPhotoInput);
                    savedPhotoUrl = data.photo_url;
                    viewPhotoUpload.setPreview(savedPhotoUrl);
                    viewPhotoStatus.style.color = 'green';
                    viewPhotoStatus.textContent = data.message || 'Фото обновлено';
                    viewPhotoInput.value = '';
                } catch (error) {
                    viewPhotoStatus.style.color = 'red';
                    viewPhotoStatus.textContent = error.message;
                    viewPhotoUpload.setPreview(savedPhotoUrl);
                    viewPhotoInput.value = '';
                }
            });
        }

        editPhotoUpload = initPhotoUpload({
            zoneId: 'edit-photo-field',
            inputId: 'edit-photo',
            previewId: 'edit-photo-preview',
            selectBtnId: 'edit-photo-select-btn'
        });

        document.getElementById('edit-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = document.getElementById('edit-status');
            const editPhotoInput = editPhotoUpload.getInput();
            const payload = {
                surname: document.getElementById('edit-surname').value,
                name: document.getElementById('edit-name').value,
                patronymic: document.getElementById('edit-patronymic').value,
                phone: document.getElementById('edit-phone').value,
                birthday: document.getElementById('edit-birthday').value || null
            };
            const response = await apiFetch('/profile', { method: 'PUT', body: JSON.stringify(payload) });
            const data = await response.json();
            if (!response.ok) {
                status.style.color = 'red';
                status.textContent = data.message;
                return;
            }
            if (editPhotoInput?.files[0]) {
                try {
                    await uploadPhoto('/profile/photo', editPhotoInput);
                } catch (photoError) {
                    status.style.color = 'red';
                    status.textContent = photoError.message;
                    return;
                }
            }
            status.style.color = 'green';
            status.textContent = data.message;
        });
    }

    try {
        if (isAdmin) {
            const response = await apiFetch('/auth/me');
            if (!response.ok) throw new Error('profile');
            const session = await response.json();
            document.getElementById('profile-role').textContent = session.role_name;
            document.getElementById('profile-full-name').textContent = session.full_name;
            document.getElementById('profile-position').textContent = `Логин: ${session.email}`;
            document.getElementById('profile-birthday').textContent = '';
            document.getElementById('profile-progress').textContent = '';
            return;
        }

        const response = await apiFetch('/profile');
        if (!response.ok) throw new Error('profile');
        const profile = await response.json();

        if (viewPhotoUpload) {
            savedPhotoUrl = profile.photo_url;
            viewPhotoUpload.setPreview(profile.photo_url);
        }

        document.getElementById('profile-role').textContent = profile.role_name;
        document.getElementById('profile-full-name').textContent = profile.full_name;
        document.getElementById('profile-position').textContent = profile.position_name || '';
        document.getElementById('profile-birthday').textContent =
            `День рождения: ${formatBirthday(profile.birthday)}`;
        document.getElementById('profile-progress').textContent =
            `${String(profile.completed_sections).padStart(2, '0')}/${String(profile.total_sections).padStart(2, '0')} Пройдено разделов`;

        const managersEl = document.getElementById('profile-managers');
        if (profile.managers && profile.managers.length) {
            managersEl.innerHTML = '<h3>Руководитель</h3>' + profile.managers.map(m =>
                `<p>${m.full_name}</p>`).join('');
        }

        if (document.getElementById('edit-surname')) {
            document.getElementById('edit-surname').value = profile.surname;
            document.getElementById('edit-name').value = profile.name;
            document.getElementById('edit-patronymic').value = profile.patronymic || '';
            document.getElementById('edit-phone').value = profile.phone || '';
            document.getElementById('edit-birthday').value = profile.birthday || '';
            if (editPhotoUpload) {
                editPhotoUpload.setPreview(profile.photo_url);
            }
        }
    } catch (error) {
        document.getElementById('profile-full-name').textContent = 'Ошибка загрузки профиля';
    }
});
