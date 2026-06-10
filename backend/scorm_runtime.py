import json
import os

from course_manifest import is_scorable_section, load_course_manifest
from course_progress import PASS_THRESHOLD
from course_storage import get_course_base_path

SCORM_STATE_DIR = os.path.join(os.path.dirname(__file__), 'uploads', 'scorm_state')


def _state_path(assignment_id):
    os.makedirs(SCORM_STATE_DIR, exist_ok=True)
    return os.path.join(SCORM_STATE_DIR, f'{assignment_id}.json')


def load_scorm_state(assignment_id):
    path = _state_path(assignment_id)
    if not os.path.isfile(path):
        return {'values': {}}
    with open(path, 'r', encoding='utf-8') as file:
        return json.load(file)


def save_scorm_state(assignment_id, values):
    path = _state_path(assignment_id)
    payload = {'values': values or {}}
    with open(path, 'w', encoding='utf-8') as file:
        json.dump(payload, file, ensure_ascii=False)
    return payload


def delete_scorm_state(assignment_id):
    path = _state_path(assignment_id)
    if os.path.isfile(path):
        os.remove(path)


def _scaled_score(values):
    scaled = values.get('cmi.score.scaled')
    if scaled not in (None, ''):
        try:
            return max(0, min(100, round(float(scaled) * 100)))
        except ValueError:
            pass
    raw = values.get('cmi.score.raw')
    if raw not in (None, ''):
        try:
            return max(0, min(100, round(float(raw))))
        except ValueError:
            pass
    return None


def is_scorm_completed(values):
    completion = (values.get('cmi.completion_status') or '').lower()
    success = (values.get('cmi.success_status') or '').lower()
    return completion == 'completed' or success in ('passed', 'failed')


def sync_scorm_progress(db, user_id, course_id, assignment_id, storage, values):
    if not is_scorm_completed(values):
        return None

    manifest = load_course_manifest(storage)
    if not manifest or manifest.get('course_type') != 'scorm':
        return None

    sections = manifest.get('sections') or []
    if not sections:
        return None

    score = _scaled_score(values)
    if score is None:
        success = (values.get('cmi.success_status') or '').lower()
        score = 100 if success == 'passed' else PASS_THRESHOLD

    scorable_sections = [
        section for section in sections if is_scorable_section(section)
    ] or sections
    section_weight = manifest.get('section_weight', 100.0 / len(scorable_sections))
    completed_ids = {
        item['section_id']
        for item in db.get_assignment_sections_progress(assignment_id)
        if item.get('score', 0) > 0
    }

    result = None
    for section in scorable_sections:
        section_id = section.get('id')
        if not section_id or section_id in completed_ids:
            continue
        result, error = db.complete_section(
            user_id, course_id, assignment_id, section_id,
            bool(section.get('type') == 'practical'),
            True,
            section_weight
        )
        if error:
            break

    finish_result, finish_error = db.finish_course(
        user_id, course_id, assignment_id, manifest.get('scorable_count', len(scorable_sections))
    )
    if finish_error:
        return result
    return finish_result or result


def write_scorm_player(course_dir, launch_href, scorm_version='2004'):
    template_path = os.path.join(os.path.dirname(__file__), 'scorm', 'player.html')
    with open(template_path, 'r', encoding='utf-8') as file:
        content = file.read()
    content = content.replace('{{LAUNCH_HREF}}', launch_href)
    with open(os.path.join(course_dir, 'player.html'), 'w', encoding='utf-8') as file:
        file.write(content)

    meta_path = os.path.join(course_dir, 'scorm_meta.json')
    if os.path.isfile(meta_path):
        with open(meta_path, 'r', encoding='utf-8') as file:
            meta = json.load(file)
    else:
        meta = {}
    meta.update({
        'type': 'scorm',
        'version': scorm_version,
        'launch_href': launch_href,
        'player_href': 'player.html'
    })
    with open(meta_path, 'w', encoding='utf-8') as file:
        json.dump(meta, file, ensure_ascii=False, indent=2)

    stale_index = os.path.join(course_dir, 'index.html')
    if os.path.isfile(stale_index):
        os.remove(stale_index)
