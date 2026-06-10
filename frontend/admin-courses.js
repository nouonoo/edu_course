document.addEventListener('DOMContentLoaded', async () => {

    if (!(await requireRole('admin'))) return;

    initAppHeader('courses');



    const coursesList = document.getElementById('courses-list');

    const courseSearch = document.getElementById('course-search');

    const uploadModal = document.getElementById('upload-modal');

    const deleteModal = document.getElementById('delete-course-modal');

    const uploadForm = document.getElementById('upload-form');

    const uploadError = document.getElementById('upload-error');

    const uploadFileInput = document.getElementById('upload-file');

    const uploadDropzone = document.getElementById('upload-dropzone');

    let deleteCourseId = null;

    let pendingUpload = false;



    function closeAllMenus() {

        document.querySelectorAll('.actions-menu.open').forEach(m => m.classList.remove('open'));

        document.querySelectorAll('.btn-actions.open').forEach(b => b.classList.remove('open'));

    }



    async function loadCourses(search = '') {

        const url = search ? `/courses?search=${encodeURIComponent(search)}` : '/courses';

        const response = await apiFetch(url);

        if (!response.ok) {

            coursesList.innerHTML = '<p class="error-message">Ошибка загрузки</p>';

            return;

        }

        const courses = await response.json();

        coursesList.innerHTML = courses.map((course, i) => `

            <div class="admin-entry">

                <div class="admin-entry-course">

                    <span class="admin-entry-number">${i + 1}</span>

                    <span class="admin-entry-name">${course.title}</span>

                </div>

                <div class="admin-entry-actions">

                    <button type="button" class="btn-actions" data-menu="course-${course.course_id}">Действия</button>

                    <div class="actions-menu" id="menu-course-${course.course_id}">

                        <button type="button" class="danger delete-course" data-id="${course.course_id}">Удалить курс</button>

                    </div>

                </div>

            </div>

        `).join('') || '<p class="subtitle" style="padding:20px;">Курсы не найдены</p>';



        coursesList.querySelectorAll('.btn-actions').forEach(btn => {

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



        coursesList.querySelectorAll('.delete-course').forEach(btn => {

            btn.addEventListener('click', () => {

                closeAllMenus();

                deleteCourseId = btn.dataset.id;

                deleteModal.style.display = 'flex';

            });

        });

    }



    document.addEventListener('click', closeAllMenus);



    function slugFromFilename(name) {

        return name.replace(/\.[^/.]+$/, '')

            .toLowerCase()

            .replace(/[^a-z0-9а-яё]+/gi, '_')

            .replace(/^_+|_+$/g, '') || 'course';

    }



    function setUploadFile(file) {

        if (!file) return;

        const lower = file.name.toLowerCase();

        if (!lower.endsWith('.zip')) {

            uploadError.textContent = 'Выберите ZIP-архив (SCORM)';

            return;

        }

        uploadError.textContent = '';

        const dataTransfer = new DataTransfer();

        dataTransfer.items.add(file);

        uploadFileInput.files = dataTransfer.files;



        const baseName = file.name.replace(/\.zip$/i, '');

        document.getElementById('upload-title').value = baseName;

        document.getElementById('upload-description').value = '';

        document.getElementById('upload-storage').value = slugFromFilename(file.name);



        uploadDropzone.textContent = `Файл выбран: ${file.name}. Отпустите для загрузки или нажмите ещё раз.`;

        uploadDropzone.classList.add('has-file');

    }



    async function submitUpload() {

        const file = uploadFileInput.files[0];

        if (!file) {

            uploadError.textContent = 'Выберите SCORM-файл';

            return;

        }

        if (pendingUpload) return;

        pendingUpload = true;

        uploadError.textContent = 'Загрузка...';



        const formData = new FormData();

        formData.append('title', document.getElementById('upload-title').value || file.name);

        formData.append('description', document.getElementById('upload-description').value);

        formData.append('storage', document.getElementById('upload-storage').value);

        formData.append('file', file);



        try {

            const response = await fetch(`${API_URL}/admin/courses`, {

                method: 'POST',

                headers: { Authorization: `Bearer ${getAuthToken()}` },

                body: formData

            });

            const data = await response.json();

            if (!response.ok) {

                uploadError.textContent = data.message || 'Ошибка загрузки';

                return;

            }

            uploadModal.style.display = 'none';

            uploadForm.reset();

            uploadDropzone.textContent = 'Загрузите с компьютера или перетащите SCORM файл, чтобы загрузить курс.';

            uploadDropzone.classList.remove('has-file');

            loadCourses();

        } catch (err) {

            uploadError.textContent = 'Ошибка сети при загрузке';

        } finally {

            pendingUpload = false;

        }

    }



    uploadDropzone.addEventListener('click', () => uploadFileInput.click());



    uploadDropzone.addEventListener('dragover', (e) => {

        e.preventDefault();

        uploadDropzone.classList.add('dragover');

    });



    uploadDropzone.addEventListener('dragleave', () => uploadDropzone.classList.remove('dragover'));



    uploadDropzone.addEventListener('drop', (e) => {

        e.preventDefault();

        uploadDropzone.classList.remove('dragover');

        setUploadFile(e.dataTransfer.files[0]);

        submitUpload();

    });



    uploadFileInput.addEventListener('change', () => {

        setUploadFile(uploadFileInput.files[0]);

        submitUpload();

    });



    document.getElementById('upload-course-btn').addEventListener('click', () => {

        uploadForm.reset();

        uploadError.textContent = '';

        uploadDropzone.textContent = 'Загрузите с компьютера или перетащите SCORM файл, чтобы загрузить курс.';

        uploadDropzone.classList.remove('has-file');

        uploadModal.style.display = 'flex';

    });



    document.getElementById('close-upload-modal').addEventListener('click', () => uploadModal.style.display = 'none');



    document.getElementById('cancel-delete-course').addEventListener('click', () => {

        deleteModal.style.display = 'none';

        deleteCourseId = null;

    });



    document.getElementById('confirm-delete-course').addEventListener('click', async () => {

        if (!deleteCourseId) return;

        const res = await apiFetch(`/admin/courses/${deleteCourseId}`, { method: 'DELETE' });

        const data = await res.json();

        deleteModal.style.display = 'none';

        if (!res.ok) alert(data.message);

        else loadCourses(courseSearch.value);

        deleteCourseId = null;

    });



    courseSearch.addEventListener('input', () => loadCourses(courseSearch.value));

    loadCourses();

});

