import unittest

from scorm_runtime import (
    compute_scorm_progress_percent,
    is_scorm_completed,
    _final_scorm_score,
)


class ScormRuntimeTests(unittest.TestCase):
    def test_progress_from_progress_measure(self):
        values = {'cmi.progress_measure': '0.45'}
        self.assertEqual(compute_scorm_progress_percent(values), 45.0)

    def test_progress_from_scaled_score(self):
        values = {'cmi.score.scaled': '0.82'}
        self.assertEqual(compute_scorm_progress_percent(values), 82.0)

    def test_progress_from_raw_score_with_max(self):
        values = {
            'cmi.score.raw': '35',
            'cmi.score.max': '50',
        }
        self.assertEqual(compute_scorm_progress_percent(values), 70.0)

    def test_completed_without_score_returns_full_progress(self):
        values = {'cmi.completion_status': 'completed'}
        self.assertEqual(compute_scorm_progress_percent(values), 100.0)
        self.assertTrue(is_scorm_completed(values))

    def test_failed_success_status(self):
        values = {'cmi.success_status': 'failed'}
        self.assertEqual(_final_scorm_score(values), 69)
        self.assertTrue(is_scorm_completed(values))

    def test_partial_state_not_completed(self):
        values = {'cmi.progress_measure': '0.2', 'cmi.completion_status': 'incomplete'}
        self.assertEqual(compute_scorm_progress_percent(values), 20.0)
        self.assertFalse(is_scorm_completed(values))


if __name__ == '__main__':
    unittest.main()
