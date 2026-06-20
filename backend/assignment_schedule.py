from datetime import date, datetime

REMINDER_DAYS = 3


def _as_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return value


def today():
    return date.today()


def days_until(deadline):
    deadline = _as_date(deadline)
    if not deadline:
        return None
    return (deadline - today()).days


def is_before_start(date_from):
    date_from = _as_date(date_from)
    if not date_from:
        return False
    return today() < date_from


def is_past_deadline(date_to):
    date_to = _as_date(date_to)
    if not date_to:
        return False
    return today() > date_to


def get_schedule_phase(date_from, date_to, status):
    status = (status or 'active').lower()
    if status in ('passed', 'failed'):
        return status
    if is_before_start(date_from):
        return 'scheduled'
    if is_past_deadline(date_to):
        return 'overdue'
    return 'active'


def should_block_study(date_from, date_to, status):
    status = (status or 'active').lower()
    if status == 'passed':
        return False
    if status == 'failed':
        return True
    if is_before_start(date_from):
        return True
    if is_past_deadline(date_to):
        return True
    return False


def needs_reminder(date_to, status, progress_percent=0):
    if (status or '').lower() != 'active':
        return False
    if float(progress_percent or 0) >= 70:
        return False
    days_left = days_until(date_to)
    return days_left is not None and 0 <= days_left <= REMINDER_DAYS


def format_duration_seconds(total_seconds):
    if total_seconds is None or total_seconds < 0:
        return '—'
    total_seconds = int(total_seconds)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f'{hours:02d}:{minutes:02d}:{seconds:02d}'


def report_status_label(status, progress_percent):
    status = (status or '').lower()
    progress = float(progress_percent or 0)
    if status == 'passed' or progress >= 70:
        return 'Завершен'
    if status == 'failed':
        return 'Не пройден'
    if status == 'active':
        return 'В процессе'
    return 'Не пройден'
