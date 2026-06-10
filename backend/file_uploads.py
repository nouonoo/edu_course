import os
import time
from werkzeug.utils import secure_filename

ALLOWED_PHOTO_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_PHOTO_SIZE_BYTES = 50 * 1024 * 1024


def _allowed_photo(filename):
    if not filename or '.' not in filename:
        return False
    return filename.rsplit('.', 1)[1].lower() in ALLOWED_PHOTO_EXTENSIONS


def validate_photo_upload(file_storage):
    if not file_storage or not file_storage.filename:
        return False, 'Файл не выбран'

    if not _allowed_photo(file_storage.filename):
        return False, 'Допустимые форматы: PNG, JPG, JPEG, GIF, WEBP'

    file_storage.seek(0, os.SEEK_END)
    size = file_storage.tell()
    file_storage.seek(0)

    if size > MAX_PHOTO_SIZE_BYTES:
        return False, 'Размер файла не должен превышать 50 МБ'

    return True, None


def save_user_photo(file_storage, user_id, photos_root):
    valid, error = validate_photo_upload(file_storage)
    if not valid:
        return None, error

    os.makedirs(photos_root, exist_ok=True)

    ext = file_storage.filename.rsplit('.', 1)[1].lower()
    filename = secure_filename(f"user_{user_id}_{int(time.time())}.{ext}")
    path = os.path.join(photos_root, filename)

    file_storage.save(path)
    return filename, None


def delete_photo_file(photos_root, filename):
    if not filename:
        return
    path = os.path.join(photos_root, secure_filename(filename))
    if os.path.isfile(path):
        os.remove(path)


def photo_url(filename):
    if not filename:
        return None
    return f"/uploads/photos/{filename}"
