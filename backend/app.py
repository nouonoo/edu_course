import os
import io
import shutil
from datetime import timedelta
import pandas as pd
from flask import Flask, jsonify, request, send_file, after_this_request
from flask_cors import CORS
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, JWTManager
from werkzeug.utils import secure_filename
from database import Database
from course_storage import (
    get_course_entry_relative_path, resolve_course_file, get_course_base_path,
    resolve_course_storage, course_has_files, sync_course_manifest_metadata
)
from course_archive import build_course_archive
from course_manifest import load_course_manifest
from course_progress import PASS_THRESHOLD
from config import JWT_SECRET_KEY, COURSES_ROOT, PHOTOS_ROOT, IMG_ROOT
from file_uploads import save_user_photo, delete_photo_file, photo_url
from scorm_importer import import_course_archive
from scorm_runtime import load_scorm_state, save_scorm_state, sync_scorm_progress

SCORM_STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scorm')

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config["JWT_SECRET_KEY"] = JWT_SECRET_KEY
app.config["JWT_VERIFY_SUB"] = False
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=12)
jwt = JWTManager(app)
db = Database()
db.ensure_schema()


def has_report_access(role):
    return role in ('expert', 'admin')


def is_admin(role):
    return role == 'admin'


def is_expert(role):
    return role == 'expert'


def create_excel_report(data_rows):
    if data_rows is None:
        return None
    data = [
        {
            "ФИО": f"{row.surname} {row.name} {row.patronymic if row.patronymic else ''}".strip(),
            "Статус прохождения": 'Успешно' if row.result >= PASS_THRESHOLD else 'Неуспешно',
            "Дата прохождения": row.date.strftime('%Y-%m-%d') if row.date else None
        }
        for row in data_rows
    ]
    if not data:
        return None
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Report')
    output.seek(0)
    return output


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    login_val = data.get('login')
    password = data.get('password')
    if not login_val or not password:
        return jsonify({"message": "Не указан логин (email) или пароль"}), 400
    user_id = db.authenticate_user(login_val, password)
    if user_id is None:
        return jsonify({"message": "Неверный логин или пароль"}), 401

    session = db.get_auth_session(user_id)
    if not session:
        return jsonify({"message": "Пользователь не найден"}), 404

    access_token = create_access_token(
        identity={"user_id": session["user_id"], "role": session["role"]}
    )
    return jsonify({
        "token": access_token,
        "role": session["role"],
        "role_name": session["role_name"],
        "user_id": session["user_id"],
        "full_name": session["full_name"],
        "email": session["email"],
        "home_page": session["home_page"]
    })


@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def auth_me():
    identity = get_jwt_identity()
    user_id = identity.get('user_id')
    session = db.get_auth_session(user_id)
    if not session:
        return jsonify({"message": "Пользователь не найден"}), 404

    token_role = identity.get('role')
    if token_role != session['role']:
        session['role'] = token_role

    return jsonify(session)


@app.route('/api/profile', methods=['GET'])
@jwt_required()
def get_profile():
    user_id = get_jwt_identity().get('user_id')
    profile = db.get_user_profile(user_id)
    if not profile:
        return jsonify({"message": "Пользователь не найден"}), 404
    return jsonify(profile)


@app.route('/api/profile/photo', methods=['POST'])
@jwt_required()
def upload_profile_photo():
    user_id = get_jwt_identity().get('user_id')
    file = request.files.get('photo')
    filename, error = save_user_photo(file, user_id, PHOTOS_ROOT)
    if error:
        return jsonify({"message": error}), 400

    old_photo = db.get_user_photo_filename(user_id)
    if not db.update_user_photo(user_id, filename):
        delete_photo_file(PHOTOS_ROOT, filename)
        return jsonify({"message": "Ошибка сохранения фото"}), 500

    delete_photo_file(PHOTOS_ROOT, old_photo)
    return jsonify({"message": "Фото обновлено", "photo": filename, "photo_url": photo_url(filename)})


@app.route('/api/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    identity = get_jwt_identity()
    if is_expert(identity.get('role')):
        return jsonify({"message": "Редактирование профиля недоступно для эксперта"}), 403
    user_id = identity.get('user_id')
    data = request.get_json() or {}
    if not db.update_user_profile(user_id, data):
        return jsonify({"message": "Ошибка обновления профиля"}), 500
    return jsonify({"message": "Профиль обновлён"})


@app.route('/api/rating', methods=['GET'])
@jwt_required()
def get_rating():
    return jsonify(db.get_rating())


@app.route('/api/users', methods=['GET'])
@jwt_required()
def get_users():
    role = get_jwt_identity().get('role')
    if not has_report_access(role):
        return jsonify({"message": "Доступ запрещен"}), 403
    search = request.args.get('search')
    return jsonify(db.get_all_users(search))


@app.route('/api/courses', methods=['GET'])
@jwt_required()
def get_courses():
    role = get_jwt_identity().get('role')
    search = request.args.get('search')
    if is_admin(role):
        courses = db.get_all_courses(search)
    elif has_report_access(role):
        courses = db.get_all_courses(search)
    else:
        return jsonify({"message": "Доступ запрещен"}), 403

    for course in courses:
        manifest = load_course_manifest(course.get('storage'))
        if manifest:
            course['course_type'] = manifest.get('course_type', 'native')
    return jsonify(courses)


@app.route('/api/assignments', methods=['POST'])
@jwt_required()
def create_assignment():
    identity = get_jwt_identity()
    if identity.get('role') not in ('expert', 'admin'):
        return jsonify({"message": "Доступ запрещен"}), 403

    data = request.get_json() or {}
    user_id = data.get('user_id')
    course_id = data.get('course_id')
    date_from = data.get('date_from')
    date_to = data.get('date_to')

    if not all([user_id, course_id, date_from, date_to]):
        return jsonify({"message": "Заполните все поля"}), 400

    assignment_id, error = db.create_assignment(
        int(user_id), int(course_id), identity.get('user_id'), date_from, date_to
    )
    if error:
        return jsonify({"message": error}), 400
    return jsonify({"message": "Курс назначен", "assignment_id": assignment_id})


@app.route('/api/my-courses', methods=['GET'])
@jwt_required()
def get_my_courses():
    user_id = get_jwt_identity().get('user_id')
    return jsonify(db.get_courses_for_user(user_id))


@app.route('/api/courses/<int:course_id>', methods=['GET'])
@jwt_required()
def get_course(course_id):
    course = db.get_course_by_id(course_id)
    if not course:
        return jsonify({"message": "Курс не найден"}), 404

    identity = get_jwt_identity()
    user_id = identity.get('user_id')
    assignment_id = request.args.get('assignment_id')

    assignment = None
    if assignment_id:
        assignment = db.get_assignment_by_id(int(assignment_id))
    else:
        assignment = db.get_active_assignment(user_id, course_id)

    if identity.get('role') == 'student':
        if not assignment or assignment.status != 'active':
            return jsonify({"message": "Курс не назначен или недоступен для прохождения"}), 403

    storage = resolve_course_storage(course.storage, course.course_id, course.title)
    manifest = load_course_manifest(storage)
    entry_path = get_course_entry_relative_path(storage)
    launch_url = None
    if entry_path and assignment:
        launch_url = f"/course-content/{course_id}/{entry_path}?assignment_id={assignment.assignment_id}"

    progress = None
    if assignment:
        progress = db.get_course_progress(user_id, course_id, assignment.assignment_id)

    return jsonify({
        "course_id": course.course_id,
        "title": course.title,
        "description": course.description,
        "storage": storage,
        "course_type": manifest.get('course_type', 'native') if manifest else 'native',
        "assignment_id": assignment.assignment_id if assignment else None,
        "launch_url": launch_url,
        "is_available": course_has_files(storage, course.course_id, course.title) and assignment is not None,
        "manifest": manifest,
        "progress": progress,
        "pass_threshold": PASS_THRESHOLD
    })


@app.route('/scorm-static/<path:filename>')
def serve_scorm_static(filename):
    safe_dir = os.path.normpath(SCORM_STATIC_DIR)
    file_path = os.path.normpath(os.path.join(safe_dir, filename))
    if not file_path.startswith(safe_dir) or not os.path.isfile(file_path):
        return jsonify({"message": "Файл не найден"}), 404
    return send_file(file_path)


@app.route('/api/scorm/<int:course_id>/state', methods=['GET', 'POST'])
@jwt_required()
def scorm_state(course_id):
    identity = get_jwt_identity()
    user_id = identity.get('user_id')
    assignment_id = request.args.get('assignment_id') if request.method == 'GET' else (request.get_json() or {}).get('assignment_id')

    if not assignment_id:
        return jsonify({"message": "Не указано назначение"}), 400

    assignment = db.get_assignment_by_id(int(assignment_id))
    if not assignment or assignment.user_id != user_id or assignment.course_id != course_id:
        return jsonify({"message": "Назначение не найдено"}), 403

    if request.method == 'GET':
        return jsonify(load_scorm_state(int(assignment_id)))

    data = request.get_json() or {}
    values = data.get('values') or {}
    payload = save_scorm_state(int(assignment_id), values)

    course = db.get_course_by_id(course_id)
    storage = resolve_course_storage(course.storage, course.course_id, course.title) if course else None
    progress = sync_scorm_progress(db, user_id, course_id, int(assignment_id), storage, values) if storage else None

    response = {"values": payload.get('values', {})}
    if progress:
        response["progress"] = progress
    return jsonify(response)


@app.route('/api/courses/<int:course_id>/sections/<section_id>/complete', methods=['POST'])
@jwt_required()
def complete_section(course_id, section_id):
    identity = get_jwt_identity()
    user_id = identity.get('user_id')
    data = request.get_json() or {}

    assignment_id = data.get('assignment_id')
    is_practical = bool(data.get('is_practical', False))
    passed_first_try = bool(data.get('passed_first_try', True))
    section_weight = float(data.get('section_weight', 0))

    if not assignment_id:
        return jsonify({"message": "Не указано назначение"}), 400

    result, error = db.complete_section(
        user_id, course_id, int(assignment_id), section_id,
        is_practical, passed_first_try, section_weight
    )
    if error:
        return jsonify({"message": error}), 400
    return jsonify(result)


@app.route('/api/courses/<int:course_id>/finish', methods=['POST'])
@jwt_required()
def finish_course(course_id):
    identity = get_jwt_identity()
    data = request.get_json() or {}
    assignment_id = data.get('assignment_id')
    total_sections = int(data.get('total_sections', 0))

    if not assignment_id:
        return jsonify({"message": "Не указано назначение"}), 400

    result, error = db.finish_course(
        identity.get('user_id'), course_id, int(assignment_id), total_sections
    )
    if error:
        return jsonify({"message": error}), 400
    return jsonify(result)


@app.route('/uploads/photos/<path:filename>')
def serve_user_photo(filename):
    safe_name = secure_filename(filename)
    file_path = os.path.join(PHOTOS_ROOT, safe_name)
    if not os.path.isfile(file_path):
        return jsonify({"message": "Файл не найден"}), 404
    return send_file(file_path)


@app.route('/img/<path:filename>')
def serve_rating_image(filename):
    safe_name = secure_filename(filename)
    file_path = os.path.join(IMG_ROOT, safe_name)
    if not os.path.isfile(file_path):
        return jsonify({"message": "Файл не найден"}), 404
    return send_file(file_path)


@app.route('/course-content/<int:course_id>/')
@app.route('/course-content/<int:course_id>/<path:filename>')
def serve_course_content(course_id, filename=''):
    course = db.get_course_by_id(course_id)
    if not course or not course.storage:
        return jsonify({"message": "Курс не найден"}), 404
    file_path = resolve_course_file(course.storage, filename)
    if not file_path:
        return jsonify({"message": "Файл не найден"}), 404
    return send_file(file_path)


@app.route('/api/report', methods=['GET'])
@jwt_required()
def get_report():
    role = get_jwt_identity().get('role')
    if not has_report_access(role):
        return jsonify({"message": "Доступ запрещен"}), 403

    user_id = request.args.get('user_id')
    course_id = request.args.get('course_id')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    if not any([user_id, course_id, date_from, date_to]):
        return jsonify({"message": "Необходимо задать хотя бы один параметр"}), 400

    report_rows = db.get_report_data(
        int(user_id) if user_id else None,
        int(course_id) if course_id else None,
        date_from, date_to
    )
    if report_rows is None:
        return jsonify({"message": "Ошибка БД"}), 500
    if not report_rows:
        return jsonify({"message": "Нет данных"}), 404

    excel_file = create_excel_report(report_rows)
    if not excel_file:
        return jsonify({"message": "Нет данных"}), 404
    return send_file(excel_file, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name='course_report.xlsx')


@app.route('/api/admin/positions', methods=['GET'])
@jwt_required()
def admin_positions():
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    return jsonify(db.get_positions())


@app.route('/api/admin/roles', methods=['GET'])
@jwt_required()
def admin_roles():
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    return jsonify(db.get_roles())


@app.route('/api/admin/users', methods=['GET'])
@jwt_required()
def admin_list_users():
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    return jsonify(db.get_all_users(request.args.get('search')))


@app.route('/api/admin/users/<int:user_id>', methods=['GET'])
@jwt_required()
def admin_get_user(user_id):
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    user = db.get_admin_user(user_id)
    if not user:
        return jsonify({"message": "Не найден"}), 404
    return jsonify(user)


@app.route('/api/admin/users', methods=['POST'])
@jwt_required()
def admin_create_user():
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    data = request.get_json() or {}
    required = ['name', 'surname', 'email', 'password_hash', 'role_id']
    if not all(data.get(f) for f in required):
        return jsonify({"message": "Заполните обязательные поля"}), 400
    user_id = db.create_user(data)
    if not user_id:
        return jsonify({"message": "Ошибка создания"}), 500
    return jsonify({"message": "Пользователь создан", "user_id": user_id})


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@jwt_required()
def admin_update_user(user_id):
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    if not db.update_admin_user(user_id, request.get_json() or {}):
        return jsonify({"message": "Ошибка обновления"}), 500
    return jsonify({"message": "Пользователь обновлён"})


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
def admin_delete_user(user_id):
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    if not db.delete_user(user_id):
        return jsonify({"message": "Ошибка удаления"}), 500
    return jsonify({"message": "Пользователь удалён"})


@app.route('/api/admin/courses', methods=['POST'])
@jwt_required()
def admin_create_course():
    identity = get_jwt_identity()
    if not is_admin(identity.get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403

    title = request.form.get('title')
    description = request.form.get('description', '')
    storage_name = secure_filename(request.form.get('storage', title or 'course'))

    if not title:
        return jsonify({"message": "Укажите название курса"}), 400

    if not storage_name:
        storage_name = secure_filename(title)

    course_dir = os.path.join(COURSES_ROOT, storage_name)
    if os.path.exists(course_dir):
        return jsonify({"message": "Папка курса уже существует"}), 400

    uploaded = request.files.get('file')
    import_info = {'course_type': 'native'}

    if uploaded and uploaded.filename:
        if not uploaded.filename.lower().endswith('.zip'):
            return jsonify({"message": "Поддерживается только ZIP-архив"}), 400
        import_info, error = import_course_archive(uploaded, course_dir, title)
        if error:
            return jsonify({"message": error}), 400
    else:
        os.makedirs(course_dir, exist_ok=True)
        with open(os.path.join(course_dir, 'course.json'), 'w', encoding='utf-8') as file:
            file.write('{"title":"' + title.replace('"', '\\"') + '","sections":[]}')

    course_id = db.create_course(title, description, identity.get('user_id'), storage_name)
    if not course_id:
        shutil.rmtree(course_dir, ignore_errors=True)
        return jsonify({"message": "Ошибка создания курса"}), 500
    return jsonify({
        "message": "Курс загружен",
        "course_id": course_id,
        "import": import_info
    })


@app.route('/api/admin/users/<int:user_id>/photo', methods=['POST'])
@jwt_required()
def admin_upload_user_photo(user_id):
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    if not db.get_admin_user(user_id):
        return jsonify({"message": "Пользователь не найден"}), 404

    file = request.files.get('photo')
    filename, error = save_user_photo(file, user_id, PHOTOS_ROOT)
    if error:
        return jsonify({"message": error}), 400

    old_photo = db.get_user_photo_filename(user_id)
    if not db.update_user_photo(user_id, filename):
        delete_photo_file(PHOTOS_ROOT, filename)
        return jsonify({"message": "Ошибка сохранения фото"}), 500

    delete_photo_file(PHOTOS_ROOT, old_photo)
    return jsonify({"message": "Фото обновлено", "photo_url": photo_url(filename)})


@app.route('/api/admin/courses/<int:course_id>', methods=['PUT'])
@jwt_required()
def admin_update_course(course_id):
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403

    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({"message": "Укажите название курса"}), 400

    description = (data.get('description') or '').strip()
    course = db.get_course_by_id(course_id)
    if not course:
        return jsonify({"message": "Курс не найден"}), 404

    if not db.update_course(course_id, title, description):
        return jsonify({"message": "Ошибка обновления курса"}), 500

    if course.storage:
        sync_course_manifest_metadata(course.storage, title=title, description=description)

    return jsonify({
        "message": "Курс обновлён",
        "course": {
            "course_id": course_id,
            "title": title,
            "description": description,
            "storage": course.storage
        }
    })


@app.route('/api/admin/courses/<int:course_id>/download', methods=['GET'])
@jwt_required()
def admin_download_course(course_id):
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403

    course = db.get_course_by_id(course_id)
    if not course:
        return jsonify({"message": "Курс не найден"}), 404

    archive_format = (request.args.get('format') or 'zip').lower()
    archive_path, error = build_course_archive(course.storage, archive_format)
    if error:
        status = 503 if archive_format == 'rar' else 400
        return jsonify({"message": error}), status

    download_name = secure_filename(course.storage or course.title or f'course_{course_id}')
    download_name = f'{download_name}.{archive_format}'

    @after_this_request
    def cleanup_archive(response):
        try:
            os.remove(archive_path)
        except OSError:
            pass
        return response

    mimetype = 'application/zip' if archive_format == 'zip' else 'application/x-rar-compressed'
    return send_file(
        archive_path,
        mimetype=mimetype,
        as_attachment=True,
        download_name=download_name
    )


@app.route('/api/admin/courses/<int:course_id>', methods=['DELETE'])
@jwt_required()
def admin_delete_course(course_id):
    if not is_admin(get_jwt_identity().get('role')):
        return jsonify({"message": "Доступ запрещен"}), 403
    course = db.get_course_by_id(course_id)
    if not course:
        return jsonify({"message": "Не найден"}), 404
    if course.storage:
        base = get_course_base_path(course.storage)
        if base and os.path.isdir(base):
            shutil.rmtree(base, ignore_errors=True)
    if not db.delete_course(course_id):
        return jsonify({"message": "Ошибка удаления"}), 500
    return jsonify({"message": "Курс удалён"})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
