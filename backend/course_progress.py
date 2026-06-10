PASS_THRESHOLD = 70

MAX_COURSE_SCORE = 100





def calculate_section_score(section_weight, is_practical, passed_first_try):

    if is_practical and not passed_first_try:

        return section_weight / 2, True

    return section_weight, False





def merge_section_score(existing_score, new_score, section_weight):

    best = max(float(existing_score or 0), float(new_score or 0))

    full_score = float(section_weight)

    first_failed = best < full_score - 0.01

    return best, first_failed





def cap_course_score(total_score):

    return min(MAX_COURSE_SCORE, max(0, float(total_score or 0)))





def is_course_passed(total_score):

    return total_score >= PASS_THRESHOLD





def assignment_status_from_score(total_score, all_sections_completed):

    if not all_sections_completed:

        return 'active'

    if is_course_passed(total_score):

        return 'passed'

    return 'failed'


