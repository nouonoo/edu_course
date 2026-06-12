import os
import shutil
import subprocess
import tempfile
import zipfile

from course_storage import get_course_base_path


def _find_rar_executable():
    for name in ('rar', 'Rar.exe', 'WinRAR.exe'):
        path = shutil.which(name)
        if path:
            return path

    for candidate in (
        r'C:\Program Files\WinRAR\Rar.exe',
        r'C:\Program Files (x86)\WinRAR\Rar.exe',
    ):
        if os.path.isfile(candidate):
            return candidate
    return None


def create_course_zip(course_dir):
    tmp = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
    tmp.close()

    with zipfile.ZipFile(tmp.name, 'w', zipfile.ZIP_DEFLATED) as archive:
        for root, _, files in os.walk(course_dir):
            for filename in files:
                full_path = os.path.join(root, filename)
                archive.write(full_path, os.path.relpath(full_path, course_dir))

    return tmp.name


def create_course_rar(course_dir):
    rar_exe = _find_rar_executable()
    if not rar_exe:
        return None, 'На сервере не найден WinRAR/rar. Используйте скачивание в ZIP.'

    fd, archive_path = tempfile.mkstemp(suffix='.rar')
    os.close(fd)
    try:
        os.remove(archive_path)
    except OSError:
        pass

    result = subprocess.run(
        [rar_exe, 'a', '-r', '-ep1', '-y', archive_path, '*'],
        cwd=course_dir,
        capture_output=True,
    )
    if result.returncode != 0 or not os.path.isfile(archive_path) or os.path.getsize(archive_path) == 0:
        try:
            os.remove(archive_path)
        except OSError:
            pass
        details = (result.stderr or result.stdout or b'').decode('utf-8', errors='replace').strip()
        message = details or 'Не удалось создать RAR-архив'
        return None, message

    return archive_path, None


def build_course_archive(storage, archive_format):
    course_dir = get_course_base_path(storage)
    if not course_dir or not os.path.isdir(course_dir):
        return None, 'Файлы курса не найдены'

    archive_format = (archive_format or 'zip').lower()
    if archive_format == 'zip':
        return create_course_zip(course_dir), None
    if archive_format == 'rar':
        return create_course_rar(course_dir)

    return None, 'Поддерживаются только ZIP и RAR'
