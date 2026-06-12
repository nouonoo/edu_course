import json
import os
from config import COURSES_ROOT

ENTRY_FILES = ('index.html', 'start.html', 'story.html', 'launch.html', 'index_lms.html')


def _normalize_storage_path(storage):
    if not storage:
        return None

    storage = storage.replace('\\', '/').strip('/')
    full_path = os.path.normpath(os.path.join(COURSES_ROOT, storage))
    courses_root = os.path.normpath(COURSES_ROOT)

    if not full_path.startswith(courses_root):
        return None

    return full_path


def resolve_course_storage(storage, course_id=None, title=None):
    """Возвращает рабочий storage: из БД или по папке курса на диске."""
    if storage and get_course_base_path(storage):
        return storage

    candidates = []
    if course_id == 2:
        candidates.append('bezopasnost')
    if title:
        slug = title.strip().lower().replace(' ', '_')
        candidates.extend([slug, 'bezopasnost' if 'безопас' in title.lower() else None])
    candidates = [c for c in candidates if c]

    for candidate in candidates:
        if get_course_base_path(candidate):
            return candidate

    if not os.path.isdir(COURSES_ROOT):
        return storage

    for name in os.listdir(COURSES_ROOT):
        folder = os.path.join(COURSES_ROOT, name)
        if not os.path.isdir(folder):
            continue
        if not get_course_entry_relative_path(name):
            continue
        if not title:
            return name
        manifest_path = os.path.join(folder, 'course.json')
        if os.path.isfile(manifest_path):
            with open(manifest_path, 'r', encoding='utf-8') as file:
                manifest = json.load(file)
            if manifest.get('title', '').strip().lower() == title.strip().lower():
                return name
    return storage


def course_has_files(storage, course_id=None, title=None):
    resolved = resolve_course_storage(storage, course_id, title)
    return get_course_entry_relative_path(resolved) is not None


def sync_course_manifest_metadata(storage, title=None, description=None):
    base = get_course_base_path(storage)
    if not base:
        return

    manifest_path = os.path.join(base, 'course.json')
    if not os.path.isfile(manifest_path):
        return

    try:
        with open(manifest_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
        if title is not None:
            data['title'] = title
        if description is not None:
            if description:
                data['description'] = description
            else:
                data.pop('description', None)
        with open(manifest_path, 'w', encoding='utf-8') as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write('\n')
    except (OSError, json.JSONDecodeError, TypeError):
        return


def get_course_base_path(storage):
    """
    Возвращает базовую папку курса по значению storage из БД.
    storage может быть папкой ('bezopasnost') или файлом ('bezopasnost/index.html').
    """
    full_path = _normalize_storage_path(storage)
    if not full_path:
        return None

    if os.path.isfile(full_path):
        return os.path.dirname(full_path)

    if os.path.isdir(full_path):
        return full_path

    return None


def get_course_entry_relative_path(storage):
    """
    Возвращает относительный путь к стартовому файлу курса внутри папки storage.
    """
    full_path = _normalize_storage_path(storage)
    if not full_path:
        return None

    if os.path.isfile(full_path):
        base_path = get_course_base_path(storage)
        if not base_path:
            return None
        return os.path.relpath(full_path, base_path).replace('\\', '/')

    if os.path.isdir(full_path):
        scorm_meta_path = os.path.join(full_path, 'scorm_meta.json')
        if os.path.isfile(scorm_meta_path):
            with open(scorm_meta_path, 'r', encoding='utf-8') as file:
                scorm_meta = json.load(file)
            player_href = scorm_meta.get('player_href', 'player.html')
            player_path = os.path.join(full_path, player_href.replace('/', os.sep))
            if os.path.isfile(player_path):
                return player_href.replace('\\', '/')

            launch_href = scorm_meta.get('launch_href')
            if launch_href and os.path.isfile(os.path.join(full_path, launch_href.replace('/', os.sep))):
                return launch_href.replace('\\', '/')

        for entry_name in ENTRY_FILES:
            entry_path = os.path.join(full_path, entry_name)
            if os.path.isfile(entry_path):
                return entry_name

    return None


def resolve_course_file(storage, relative_path=''):
    """
    Безопасно разрешает путь к файлу курса внутри папки storage.
    """
    base_path = get_course_base_path(storage)
    if not base_path:
        return None

    if not relative_path:
        entry = get_course_entry_relative_path(storage)
        if not entry:
            return None
        relative_path = entry

    relative_path = relative_path.replace('\\', '/').lstrip('/')
    full_path = os.path.normpath(os.path.join(base_path, relative_path))

    if not full_path.startswith(base_path):
        return None

    if not os.path.isfile(full_path):
        return None

    return full_path
