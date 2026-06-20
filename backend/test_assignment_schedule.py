import unittest
from datetime import date, timedelta

from assignment_schedule import (
    days_until,
    format_duration_seconds,
    get_schedule_phase,
    is_before_start,
    is_past_deadline,
    needs_reminder,
    report_status_label,
    should_block_study,
)


class AssignmentScheduleTests(unittest.TestCase):
    def test_schedule_phase_active(self):
        today = date.today()
        phase = get_schedule_phase(today - timedelta(days=1), today + timedelta(days=5), 'active')
        self.assertEqual(phase, 'active')

    def test_schedule_phase_scheduled(self):
        today = date.today()
        phase = get_schedule_phase(today + timedelta(days=2), today + timedelta(days=10), 'active')
        self.assertEqual(phase, 'scheduled')

    def test_schedule_phase_overdue(self):
        today = date.today()
        phase = get_schedule_phase(today - timedelta(days=10), today - timedelta(days=1), 'active')
        self.assertEqual(phase, 'overdue')

    def test_should_block_study_after_deadline(self):
        today = date.today()
        self.assertTrue(
            should_block_study(today - timedelta(days=10), today - timedelta(days=1), 'active')
        )

    def test_should_not_block_passed_course(self):
        today = date.today()
        self.assertFalse(
            should_block_study(today - timedelta(days=10), today - timedelta(days=1), 'passed')
        )

    def test_reminder_within_three_days(self):
        today = date.today()
        self.assertTrue(needs_reminder(today + timedelta(days=2), 'active', 10))

    def test_no_reminder_when_passed(self):
        today = date.today()
        self.assertFalse(needs_reminder(today + timedelta(days=2), 'passed', 80))

    def test_report_status_label(self):
        self.assertEqual(report_status_label('passed', 80), 'Завершен')
        self.assertEqual(report_status_label('failed', 20), 'Не пройден')
        self.assertEqual(report_status_label('active', 10), 'В процессе')

    def test_format_duration_seconds(self):
        self.assertEqual(format_duration_seconds(925), '00:15:25')


if __name__ == '__main__':
    unittest.main()
