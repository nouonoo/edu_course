import json

import os

from course_storage import get_course_base_path



PASS_THRESHOLD = 70

NON_SCORABLE_TYPES = frozenset({'splash', 'intro', 'conclusion'})

NON_SCORABLE_IDS = frozenset({'intro', 'conclusion'})





def is_scorable_section(section):

    if not section:

        return False

    if section.get('scorable') is False:

        return False

    if section.get('type') in NON_SCORABLE_TYPES:

        return False

    if section.get('id') in NON_SCORABLE_IDS:

        return False

    return True





def get_scorable_sections(sections):

    return [section for section in (sections or []) if is_scorable_section(section)]





def load_course_manifest(storage):

    base_path = get_course_base_path(storage)

    if not base_path:

        return None



    manifest_path = os.path.join(base_path, 'course.json')

    if not os.path.isfile(manifest_path):

        return None



    with open(manifest_path, 'r', encoding='utf-8') as file:

        data = json.load(file)



    sections = data.get('sections', [])

    if not sections:

        return None



    scorable_sections = get_scorable_sections(sections)

    scorable_count = len(scorable_sections) or len(sections)



    return {

        'title': data.get('title'),

        'course_type': data.get('course_type', 'native'),

        'sections': sections,

        'scorable_sections': scorable_sections,

        'section_count': len(sections),

        'scorable_count': scorable_count,

        'section_weight': 100.0 / scorable_count

    }


