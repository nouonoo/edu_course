import unittest

from course_manifest import get_scorable_sections, is_scorable_section, load_course_manifest
from course_progress import (
    MAX_COURSE_SCORE,
    calculate_section_score,
    cap_course_score,
    merge_section_score,
)


class CourseProgressTests(unittest.TestCase):
    def test_cap_course_score(self):
        self.assertEqual(cap_course_score(120), MAX_COURSE_SCORE)
        self.assertEqual(cap_course_score(-5), 0)
        self.assertEqual(cap_course_score(37.5), 37.5)

    def test_merge_section_score_keeps_best(self):
        score, failed = merge_section_score(6.25, 12.5, 12.5)
        self.assertEqual(score, 12.5)
        self.assertFalse(failed)

        score, failed = merge_section_score(12.5, 6.25, 12.5)
        self.assertEqual(score, 12.5)
        self.assertFalse(failed)

    def test_practical_half_points(self):
        score, failed = calculate_section_score(12.5, True, False)
        self.assertEqual(score, 6.25)
        self.assertTrue(failed)

    def test_scorable_sections_exclude_intro_and_conclusion(self):
        sections = [
            {"id": "splash", "type": "splash"},
            {"id": "navigation", "type": "content"},
            {"id": "intro", "type": "intro"},
            {"id": "basics", "type": "content"},
            {"id": "ending", "type": "conclusion"},
        ]
        scorable = get_scorable_sections(sections)
        self.assertEqual([section["id"] for section in scorable], ["basics"])
        self.assertEqual(100.0 / len(scorable), 100.0)

    def test_bezopasnost_course_manifest_scoring(self):
        manifest = load_course_manifest("bezopasnost")
        self.assertIsNotNone(manifest)
        self.assertEqual(manifest["title"], "Безопасность")
        self.assertEqual(manifest["scorable_count"], 6)
        self.assertAlmostEqual(manifest["section_weight"], 100 / 6)
        scorable_ids = [s["id"] for s in manifest["sections"] if is_scorable_section(s)]
        self.assertEqual(scorable_ids, [
            "section-1", "section-2", "section-3", "section-4", "section-5", "section-6"
        ])


if __name__ == '__main__':
    unittest.main()
