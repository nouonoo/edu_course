document.addEventListener('DOMContentLoaded', async () => {
    if (!(await requireRole('expert'))) return;
    initAppHeader('assignments');

    const assignmentsList = document.getElementById('assignments-list');
    const assignmentsError = document.getElementById('assignments-error');
    const assignModal = document.getElementById('assign-modal');
    const assignForm = document.getElementById('assign-form');
    const assignError = document.getElementById('assign-error');
    const closeAssignModal = document.getElementById('close-assign-modal');
    const assignEmployee = document.getElementById('assign-employee');
    const assignCourse = document.getElementById('assign-course');
    const schedulePanel = document.getElementById('assignments-schedule');
    const scheduleList = document.getElementById('assignments-schedule-list');

    let courses = [];
    let selectedCourseId = null;

    function formatDate(value) {
        if (!value) return '—';
        const parts = value.split('T')[0].split('-');
        if (parts.length !== 3) return value;
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function phaseLabel(phase) {
        const labels = {
            scheduled: 'Скоро начнётся',
            active: 'В процессе',
            overdue: 'Срок истёк',
            passed: 'Завершен',
            failed: 'Не пройден'
        };
        return labels[phase] || phase;
    }

    async function loadSchedule() {
        if (!schedulePanel || !scheduleList) return;
        try {
            const response = await apiFetch('/assignments/overview');
            if (!response.ok) return;
            const items = await response.json();
            if (!items.length) {
                schedulePanel.hidden = true;
                return;
            }
            schedulePanel.hidden = false;
            scheduleList.innerHTML = '';
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'schedule-item schedule-item-static';
                row.innerHTML = `
                    <div class="schedule-item-title">${item.employee_name}</div>
                    <div class="schedule-item-meta">${item.course_title}</div>
                    <div class="schedule-item-status">${formatDate(item.date_from)} — ${formatDate(item.date_to)} · ${phaseLabel(item.schedule_phase)} · ${item.progress_percent}%</div>
                `;
                scheduleList.appendChild(row);
            });
        } catch (error) {
            console.error(error);
        }
    }

    async function loadCourses() {
        try {
            const response = await apiFetch('/courses');
            if (!response.ok) {
                throw new Error('Не удалось загрузить курсы');
            }

            courses = await response.json();
            renderCourses();
            loadSchedule();
        } catch (error) {
            console.error(error);
            assignmentsError.textContent = 'Не удалось загрузить список курсов.';
            assignmentsList.innerHTML = '';
        }
    }

    function renderCourses() {
        assignmentsList.innerHTML = '';

        if (courses.length === 0) {
            assignmentsList.innerHTML = '<p class="subtitle">Курсы пока не добавлены.</p>';
            return;
        }

        courses.forEach((course, index) => {
            const card = document.createElement('div');
            card.className = 'assignment-card';
            card.innerHTML = `
                <div class="assignment-number">${index + 1}</div>
                <div class="assignment-info">
                    <h2>${course.title}</h2>
                    <div class="assignment-actions">
                        <button type="button" class="btn-secondary assign-btn" data-course-id="${course.course_id}">
                            Назначить курс
                        </button>
                        <button type="button" class="btn-secondary stats-btn" data-course-id="${course.course_id}">
                            Статистика прохождения
                        </button>
                    </div>
                </div>
            `;
            assignmentsList.appendChild(card);
        });

        assignmentsList.querySelectorAll('.assign-btn').forEach(button => {
            button.addEventListener('click', () => openAssignModal(button.dataset.courseId));
        });

        assignmentsList.querySelectorAll('.stats-btn').forEach(button => {
            button.addEventListener('click', () => {
                const courseId = button.dataset.courseId;
                window.location.href = `rating.html?report=1&course_id=${courseId}`;
            });
        });
    }

    async function loadAssignOptions(preselectedCourseId = null) {
        const [usersResponse, coursesResponse] = await Promise.all([
            apiFetch('/users'),
            apiFetch('/courses')
        ]);

        if (usersResponse.ok) {
            const users = await usersResponse.json();
            assignEmployee.innerHTML = '<option value="">Выберите из списка</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.user_id;
                option.textContent = user.full_name;
                assignEmployee.appendChild(option);
            });
        }

        if (coursesResponse.ok) {
            const courseList = await coursesResponse.json();
            assignCourse.innerHTML = '<option value="">Выберите из списка</option>';
            courseList.forEach(course => {
                const option = document.createElement('option');
                option.value = course.course_id;
                option.textContent = course.title;
                assignCourse.appendChild(option);
            });

            if (preselectedCourseId) {
                assignCourse.value = preselectedCourseId;
            }
        }
    }

    async function openAssignModal(courseId) {
        selectedCourseId = courseId;
        assignError.textContent = '';
        assignForm.reset();
        assignModal.style.display = 'flex';

        const today = new Date();
        const fromInput = document.getElementById('assign-date-from');
        const toInput = document.getElementById('assign-date-to');
        const fromDate = today.toISOString().split('T')[0];
        const toDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        fromInput.value = fromDate;
        toInput.value = toDate;

        try {
            await loadAssignOptions(courseId);
        } catch (error) {
            assignError.textContent = 'Не удалось загрузить данные для назначения.';
        }
    }

    closeAssignModal.addEventListener('click', () => {
        assignModal.style.display = 'none';
    });

    assignModal.addEventListener('click', (event) => {
        if (event.target === assignModal) {
            assignModal.style.display = 'none';
        }
    });

    assignForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        assignError.textContent = '';

        const employeeId = assignEmployee.value;
        const courseId = assignCourse.value;
        const dateFrom = document.getElementById('assign-date-from').value;
        const dateTo = document.getElementById('assign-date-to').value;

        if (!employeeId || !courseId || !dateFrom || !dateTo) {
            assignError.textContent = 'Заполните все поля формы.';
            return;
        }

        if (dateFrom > dateTo) {
            assignError.textContent = 'Дата начала не может быть позже даты окончания.';
            return;
        }

        try {
            const response = await apiFetch('/assignments', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: parseInt(employeeId, 10),
                    course_id: parseInt(courseId, 10),
                    date_from: dateFrom,
                    date_to: dateTo
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Ошибка назначения');
            assignModal.style.display = 'none';
            assignForm.reset();
            assignmentsError.textContent = '';
            await loadSchedule();
            alert('Курс успешно назначен. Сроки добавлены в расписание.');
        } catch (error) {
            assignError.textContent = error.message;
        }
    });

    loadCourses();
});
