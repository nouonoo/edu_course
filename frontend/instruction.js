document.addEventListener('DOMContentLoaded', async () => {
    if (!(await requireRole('student', 'expert'))) return;
    initAppHeader('instruction');

    const courseTitle = document.getElementById('course-title');
    const courseDescription = document.getElementById('course-description');
    const courseStatus = document.getElementById('course-status');
    const courseBadge = document.getElementById('course-badge');
    const courseDates = document.getElementById('course-dates');
    const courseFormat = document.getElementById('course-format');
    const courseProgressFill = document.getElementById('course-progress-fill');
    const courseProgressText = document.getElementById('course-progress-text');
    const courseCard = document.getElementById('course-card');
    const courseSelect = document.getElementById('course-select');
    const startCourseBtn = document.getElementById('start-course-btn');
    const errorMessage = document.getElementById('course-error');
    const courseStub = document.getElementById('course-stub');
    const schedulePanel = document.getElementById('schedule-panel');
    const scheduleList = document.getElementById('schedule-list');
    const scheduleReminders = document.getElementById('schedule-reminders');

    let courses = [];
    let selectedCourse = null;

    function formatCourseDate(value) {
        if (!value) return '—';
        const parts = value.split('T')[0].split('-');
        if (parts.length !== 3) return value;
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function formatCourseType(type) {
        if (type === 'scorm') return 'SCORM 2004';
        if (type === 'native') return 'Электронный курс';
        return 'Курс';
    }

    function setBadge(text, type = 'default') {
        courseBadge.textContent = text;
        courseBadge.className = `course-status-badge badge-${type}`;
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

    function phaseBadgeType(phase) {
        if (phase === 'passed') return 'success';
        if (phase === 'active') return 'success';
        if (phase === 'scheduled') return 'muted';
        return 'warning';
    }

    function renderSchedule() {
        if (!schedulePanel || !scheduleList) return;

        if (!courses.length) {
            schedulePanel.hidden = true;
            return;
        }

        schedulePanel.hidden = false;
        scheduleList.innerHTML = '';
        scheduleReminders.innerHTML = '';

        const reminders = courses.filter(course => course.needs_reminder);
        if (reminders.length) {
            reminders.forEach(course => {
                const item = document.createElement('div');
                item.className = 'schedule-reminder';
                item.textContent = `Напоминание: курс «${course.title}» нужно завершить до ${formatCourseDate(course.date_to)} (осталось ${course.days_left} дн.).`;
                scheduleReminders.appendChild(item);
            });
        }

        courses.forEach(course => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'schedule-item';
            item.innerHTML = `
                <div class="schedule-item-title">${course.title}</div>
                <div class="schedule-item-meta">${formatCourseDate(course.date_from)} — ${formatCourseDate(course.date_to)}</div>
                <div class="schedule-item-status">${phaseLabel(course.schedule_phase)} · ${Math.round(course.progress_percent || 0)}%</div>
            `;
            item.addEventListener('click', () => {
                courseSelect.value = String(course.course_id);
                selectCourse(course);
            });
            scheduleList.appendChild(item);
        });
    }

    async function loadCourses() {
        try {
            const response = await apiFetch('/my-courses');
            if (!response.ok) throw new Error('Не удалось загрузить курсы');
            courses = await response.json();
            renderCourseList();
            renderSchedule();
        } catch (error) {
            errorMessage.textContent = 'Не удалось загрузить курсы. Убедитесь, что вам назначен курс.';
            courseTitle.textContent = 'Нет назначенных курсов';
            courseCard.classList.add('course-card-empty');
            startCourseBtn.disabled = true;
        }
    }

    function renderCourseList() {
        courseSelect.innerHTML = '';
        if (courses.length === 0) {
            courseSelect.innerHTML = '<option value="">Нет назначенных курсов</option>';
            updateCourseInfo(null);
            return;
        }

        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = String(course.course_id);
            option.textContent = course.title;
            courseSelect.appendChild(option);
        });

        courseSelect.onchange = () => {
            const course = courses.find(c => String(c.course_id) === courseSelect.value);
            selectCourse(course || null);
        };

        const savedId = sessionStorage.getItem('selected_course_id');
        const initial = courses.find(c => String(c.course_id) === savedId) || courses[0];
        courseSelect.value = String(initial.course_id);
        selectCourse(initial);
    }

    function selectCourse(course) {
        selectedCourse = course;
        if (course) {
            sessionStorage.setItem('selected_course_id', String(course.course_id));
        }
        updateCourseInfo(course);
    }

    function updateCourseInfo(course) {
        errorMessage.textContent = '';
        courseCard.classList.remove('course-card-empty', 'course-card-warning');
        startCourseBtn.disabled = true;

        if (!course) {
            courseTitle.textContent = 'Курсы не назначены';
            courseDescription.textContent = 'Обратитесь к эксперту для назначения курса.';
            courseStatus.textContent = '';
            courseDates.textContent = '—';
            courseFormat.textContent = '—';
            courseProgressFill.style.width = '0%';
            courseProgressText.textContent = '0%';
            setBadge('Нет курса', 'muted');
            if (courseStub) courseStub.style.display = 'none';
            return;
        }

        const progress = Math.round(course.progress_percent || 0);
        const phase = course.schedule_phase || 'active';
        courseTitle.textContent = course.title;
        courseDescription.textContent = course.description || 'Описание курса пока не добавлено.';
        courseDates.textContent = `${formatCourseDate(course.date_from)} — ${formatCourseDate(course.date_to)}`;
        courseFormat.textContent = formatCourseType(course.course_type);
        courseProgressFill.style.width = `${Math.min(progress, 100)}%`;
        courseProgressText.textContent = `${progress}%`;
        setBadge(phaseLabel(phase), phaseBadgeType(phase));

        if (!course.has_storage) {
            courseCard.classList.add('course-card-warning');
            courseStatus.textContent = 'Файлы курса не найдены. Обратитесь к администратору.';
            if (courseStub) courseStub.style.display = '';
            return;
        }

        if (!course.assignment_id) {
            courseCard.classList.add('course-card-warning');
            courseStatus.textContent = 'Курс ещё не назначен экспертом. Обратитесь к руководителю.';
            if (courseStub) courseStub.style.display = 'none';
            return;
        }

        if (courseStub) courseStub.style.display = 'none';

        if (phase === 'scheduled') {
            courseCard.classList.add('course-card-warning');
            courseStatus.textContent = `Курс откроется ${formatCourseDate(course.date_from)}. До начала обучения прохождение недоступно.`;
            return;
        }

        if (phase === 'overdue' || phase === 'failed') {
            courseCard.classList.add('course-card-warning');
            courseStatus.textContent = 'Срок прохождения истёк. Курс недоступен. Обратитесь к эксперту для повторного назначения.';
            return;
        }

        if (phase === 'passed' || progress >= 70) {
            courseStatus.textContent = 'Курс пройден. Вы можете открыть материалы повторно.';
            startCourseBtn.disabled = false;
            return;
        }

        if (course.needs_reminder) {
            courseStatus.textContent = `До окончания срока осталось ${course.days_left} дн. Завершите курс до ${formatCourseDate(course.date_to)}.`;
        } else {
            courseStatus.textContent = 'Нажмите «Начать курс», чтобы открыть выбранный курс.';
        }

        if (course.can_start) {
            startCourseBtn.disabled = false;
        }
    }

    async function launchCourse(course) {
        if (!course || !course.assignment_id) return;
        if (!course.can_start && course.schedule_phase !== 'passed') {
            errorMessage.textContent = 'Курс недоступен для прохождения в выбранные сроки.';
            return;
        }

        errorMessage.textContent = '';
        startCourseBtn.disabled = true;

        try {
            const response = await apiFetch(
                `/courses/${course.course_id}?assignment_id=${course.assignment_id}`
            );
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Не удалось открыть курс');
            }

            const courseData = await response.json();
            if (!courseData.is_available || !courseData.launch_url) {
                throw new Error('Курс недоступен для прохождения');
            }

            if (Number(courseData.course_id) !== Number(course.course_id)) {
                throw new Error('Получен неверный курс. Попробуйте ещё раз.');
            }

            const launchUrl = new URL(`${SERVER_URL}${courseData.launch_url}`);
            launchUrl.searchParams.set('authToken', getAuthToken());
            launchUrl.searchParams.set('returnUrl', window.location.href);
            window.location.href = launchUrl.toString();
        } catch (error) {
            errorMessage.textContent = error.message;
            startCourseBtn.disabled = false;
        }
    }

    startCourseBtn.addEventListener('click', () => {
        if (!selectedCourse) return;
        launchCourse(selectedCourse);
    });

    loadCourses();
});
