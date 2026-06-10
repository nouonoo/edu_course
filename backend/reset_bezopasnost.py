"""Однократный сброс курса «Безопасность» (course_id=2)."""
from database import Database

COURSE_ID = 2
STORAGE = 'bezopasnost'
TITLE = 'Безопасность'
DESCRIPTION = 'Курс по информационной безопасности'


def main():
    db = Database()
    db.ensure_schema()
    db.reset_course_shell(COURSE_ID, STORAGE, TITLE, DESCRIPTION)
    print(f'Курс «{TITLE}» сброшен: storage={STORAGE}, записи прохождения удалены.')


if __name__ == '__main__':
    main()
