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

    async function loadCourses() {
        try {
            const response = await apiFetch('/my-courses');
            if (!response.ok) throw new Error('Не удалось загрузить курсы');
            courses = await response.json();
            renderCourseList();
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
        courseTitle.textContent = course.title;
        courseDescription.textContent = course.description || 'Описание курса пока не добавлено.';
        courseDates.textContent = `${formatCourseDate(course.date_from)} — ${formatCourseDate(course.date_to)}`;
        courseFormat.textContent = formatCourseType(course.course_type);
        courseProgressFill.style.width = `${Math.min(progress, 100)}%`;
        courseProgressText.textContent = `${progress}%`;

        if (!course.has_storage) {
            courseCard.classList.add('course-card-warning');
            setBadge('Нет файлов', 'warning');
            courseStatus.textContent = 'Файлы курса не найдены. Обратитесь к администратору.';
            if (courseStub) courseStub.style.display = '';
            return;
        }

        if (!course.assignment_id) {
            courseCard.classList.add('course-card-warning');
            setBadge('Не назначен', 'warning');
            courseStatus.textContent = 'Курс ещё не назначен экспертом. Обратитесь к руководителю.';
            if (courseStub) courseStub.style.display = 'none';
            return;
        }

        if (courseStub) courseStub.style.display = 'none';
        setBadge(progress >= 70 ? 'Пройден' : 'Доступен', progress >= 70 ? 'success' : 'success');
        courseStatus.textContent = progress >= 70
            ? 'Курс пройден. Вы можете открыть материалы повторно.'
            : 'Нажмите «Начать курс», чтобы открыть выбранный курс.';
        startCourseBtn.disabled = false;
    }

    async function launchCourse(course) {
        if (!course || !course.assignment_id) return;
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
