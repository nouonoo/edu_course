document.addEventListener('DOMContentLoaded', async () => {
    if (!(await requireRole('student', 'expert', 'admin'))) return;
    initAppHeader('rating');
    const ratingListContainer = document.getElementById('rating-list');
    const ratingSummary = document.getElementById('rating-summary');
    const showReportButton = document.getElementById('show-report-modal');
    const reportModal = document.getElementById('report-modal');
    const closeModalButton = document.getElementById('close-modal');
    const reportForm = document.getElementById('report-form');
    const reportError = document.getElementById('report-error');
    const cancelConfirmModal = document.getElementById('cancel-confirm-modal');
    const confirmCancelYes = document.getElementById('confirm-cancel-yes');
    const confirmCancelNo = document.getElementById('confirm-cancel-no');

    if (isExpertOrAdmin()) {
        showReportButton.style.display = 'block';
    }

    async function fetchRating() {
        try {
            const response = await apiFetch('/rating');

            if (!response.ok) {
                throw new Error('Не удалось загрузить рейтинг');
            }

            const ratingData = await response.json();
            displayRating(ratingData);

        } catch (error) {
            console.error('Ошибка загрузки рейтинга:', error);
            ratingListContainer.innerHTML = `<p class="error-message">Не удалось загрузить рейтинг.</p>`;
        }
    }


    const TOP_AVATARS = [
        `${SERVER_URL}/img/free-icon-lion-490125.png`,
        `${SERVER_URL}/img/free-icon-anteater-4958760.png`,
        `${SERVER_URL}/img/free-icon-cat-14464962.png`
    ];

    function getInitials(user) {
        const surname = (user.surname || '').trim();
        const name = (user.name || '').trim();
        const letters = `${surname.charAt(0)}${name.charAt(0)}`.toUpperCase();
        return letters || '?';
    }

    function createAvatarPlaceholder(user) {
        const placeholder = document.createElement('div');
        placeholder.className = 'avatar avatar-placeholder';
        placeholder.setAttribute('aria-label', 'Фото не загружено');
        placeholder.textContent = getInitials(user);
        return placeholder;
    }

    function createRatingAvatar(user, place) {
        if (place <= 3) {
            const img = document.createElement('img');
            img.src = TOP_AVATARS[place - 1];
            img.alt = 'avatar';
            img.className = 'avatar avatar-top';
            return img;
        }

        const photoSrc = buildPhotoUrl(user.photo_url);
        if (photoSrc) {
            const img = document.createElement('img');
            img.src = photoSrc;
            img.alt = 'avatar';
            img.className = 'avatar avatar-profile';
            img.addEventListener('error', () => {
                img.replaceWith(createAvatarPlaceholder(user));
            });
            return img;
        }

        return createAvatarPlaceholder(user);
    }

    function buildCoursesList(courses) {
        const list = document.createElement('div');
        list.className = 'rating-courses';

        const label = document.createElement('div');
        label.className = 'rating-courses-label';
        label.textContent = 'По курсам';
        list.appendChild(label);

        if (!courses || courses.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'rating-course-item';
            empty.textContent = 'Нет начисленных баллов';
            list.appendChild(empty);
            return list;
        }

        courses.forEach(course => {
            const item = document.createElement('div');
            item.className = 'rating-course-item';

            const title = document.createElement('span');
            title.className = 'rating-course-title';
            title.textContent = course.title;
            title.title = course.title;

            const score = document.createElement('span');
            score.className = 'rating-course-score';
            score.textContent = `${Math.round(course.score)}`;

            item.appendChild(title);
            item.appendChild(score);
            list.appendChild(item);
        });

        return list;
    }

    function displayRatingSummary(ratingData) {
        if (!ratingSummary) return;

        const currentUserId = Number(sessionStorage.getItem('userId') || 0);
        const currentUser = ratingData.find(user => Number(user.user_id) === currentUserId);

        if (!currentUser) {
            ratingSummary.hidden = true;
            ratingSummary.innerHTML = '';
            return;
        }

        const place = ratingData.findIndex(user => Number(user.user_id) === currentUserId) + 1;
        ratingSummary.hidden = false;
        ratingSummary.innerHTML = `
            <div class="rating-summary-title">Ваш общий рейтинг</div>
            <div class="rating-summary-score">${Math.round(currentUser.total_score)} <span style="font-size:1.1rem;font-weight:500;">баллов</span></div>
            <div class="rating-summary-place">${place} место в рейтинге · сумма баллов по ${(currentUser.courses || []).length} курсам</div>
        `;
    }

    function displayRating(ratingData) {
        ratingListContainer.innerHTML = '';
        displayRatingSummary(ratingData);

        if (ratingData.length === 0) {
            ratingListContainer.innerHTML = `<p style="text-align:center;">Пока в рейтинге никого нет.</p>`;
            return;
        }

        ratingData.forEach((user, index) => {
            const card = document.createElement('div');
            card.className = 'rating-card';

            const place = index + 1;

            const info = document.createElement('div');
            info.className = 'rating-info';
            info.innerHTML = `
                <div class="place-label">${place} МЕСТО</div>
                <div class="user-name">${user.surname} ${user.name}</div>
            `;
            info.appendChild(buildCoursesList(user.courses));

            const scoreBlock = document.createElement('div');
            scoreBlock.className = 'rating-score-block';

            const totalScore = document.createElement('div');
            totalScore.className = 'rating-total-score';

            const score = document.createElement('div');
            score.className = 'score-number';
            score.textContent = Math.round(user.total_score);

            const scoreLabel = document.createElement('div');
            scoreLabel.className = 'score-label';
            scoreLabel.textContent = 'баллов';

            totalScore.appendChild(score);
            totalScore.appendChild(scoreLabel);
            scoreBlock.appendChild(totalScore);
            scoreBlock.appendChild(createRatingAvatar(user, place));

            card.appendChild(info);
            card.appendChild(scoreBlock);
            ratingListContainer.appendChild(card);
        });
    }


    // Загрузка списков сотрудников и курсов
    async function loadReportOptions(preselectedCourseId = null) {
        try {
            const usersResponse = await apiFetch('/users');
            
            if (usersResponse.ok) {
                const users = await usersResponse.json();
                const employeeSelect = document.getElementById('employee');
                employeeSelect.innerHTML = '<option value="">Выберите из списка</option>';
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.user_id;
                    option.textContent = user.full_name;
                    employeeSelect.appendChild(option);
                });
            }
            
            // Загружаем курсы
            const coursesResponse = await apiFetch('/courses');
            
            if (coursesResponse.ok) {
                const courses = await coursesResponse.json();
                const courseSelect = document.getElementById('course');
                courseSelect.innerHTML = '<option value="">Выберите из списка</option>';
                courses.forEach(course => {
                    const option = document.createElement('option');
                    option.value = course.course_id;
                    option.textContent = course.title;
                    courseSelect.appendChild(option);
                });

                if (preselectedCourseId) {
                    courseSelect.value = preselectedCourseId;
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки опций отчета:', error);
        }
    }

    showReportButton.addEventListener('click', () => {
        reportModal.style.display = 'flex';
        loadReportOptions();
    });

    // При нажатии "Отмена" показываем модальное окно подтверждения
    closeModalButton.addEventListener('click', () => {
        cancelConfirmModal.style.display = 'flex';
    });

    // Если пользователь подтверждает отмену ("Да")
    confirmCancelYes.addEventListener('click', () => {
        cancelConfirmModal.style.display = 'none';
        reportModal.style.display = 'none';
        // Очищаем форму
        reportForm.reset();
        reportError.textContent = '';
    });

    // Если пользователь отменяет отмену ("Нет")
    confirmCancelNo.addEventListener('click', () => {
        cancelConfirmModal.style.display = 'none';
        // Остаемся в форме настроек отчета (модальное окно report-modal остается открытым)
    });

 
    // При клике на фон модального окна настроек отчета - показываем подтверждение
    reportModal.addEventListener('click', (event) => {
        if (event.target === reportModal) {
            cancelConfirmModal.style.display = 'flex';
        }
    });

    // При клике на фон модального окна подтверждения - закрываем его
    cancelConfirmModal.addEventListener('click', (event) => {
        if (event.target === cancelConfirmModal) {
            cancelConfirmModal.style.display = 'none';
        }
    });

 
    reportForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        reportError.textContent = '';

        const employeeId = document.getElementById('employee').value;
        const courseId = document.getElementById('course').value;
        const dateFrom = document.getElementById('date-from').value;
        const dateTo = document.getElementById('date-to').value;

        // Валидация: хотя бы один параметр должен быть задан
        if (!employeeId && !courseId && !dateFrom && !dateTo) {
            reportError.textContent = 'Необходимо задать хотя бы один параметр фильтрации';
            return;
        }

        const params = new URLSearchParams();
        if (employeeId) {
            params.append('user_id', employeeId);
        }
        if (courseId) {
            params.append('course_id', courseId);
        }
        if (dateFrom) {
            params.append('date_from', dateFrom);
        }
        if (dateTo) {
            params.append('date_to', dateTo);
        }

        try {
            const response = await apiFetch(`/report?${params.toString()}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Ошибка формирования отчета');
            }

            const blob = await response.blob(); 
       
            const downloadUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', 'report.xlsx'); 
            
            document.body.appendChild(link);
            link.click(); 
            
            link.parentNode.removeChild(link); 
            window.URL.revokeObjectURL(downloadUrl); 

            reportModal.style.display = 'none';
            reportForm.reset();

        } catch (error) {
            console.error('Ошибка отчета:', error);
            reportError.textContent = error.message;
        }
    });

    fetchRating();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('report') === '1' && isExpertOrAdmin()) {
        reportModal.style.display = 'flex';
        loadReportOptions(urlParams.get('course_id'));
    }
});
