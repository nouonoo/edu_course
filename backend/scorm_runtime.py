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
            return max(0, min(100, round(float(scaled) * 100, 2)))
        except ValueError:
            pass
    raw = values.get('cmi.score.raw')
    if raw not in (None, ''):
        try:
            raw_value = float(raw)
            score_max = values.get('cmi.score.max')
            if score_max not in (None, ''):
                try:
                    max_value = float(score_max)
                    if max_value > 0:
                        return max(0, min(100, round(raw_value / max_value * 100, 2)))
                except ValueError:
                    pass
            return max(0, min(100, round(raw_value, 2)))
        except ValueError:
            pass
    return None


def compute_scorm_progress_percent(values):
    """Оценка процента прохождения SCORM-пакета по полям CMI."""
    if not values:
        return 0

    progress_measure = values.get('cmi.progress_measure')
    if progress_measure not in (None, ''):
        try:
            return max(0, min(100, round(float(progress_measure) * 100, 2)))
        except ValueError:
            pass

    scaled_score = _scaled_score(values)
    if scaled_score is not None:
        return scaled_score

    completion = (values.get('cmi.completion_status') or '').lower()
    success = (values.get('cmi.success_status') or '').lower()
    if completion == 'completed' or success in ('passed', 'failed'):
        if success == 'passed':
            return 100
        if success == 'failed':
            return max(0, PASS_THRESHOLD - 1)
        return 100

    return 0


def is_scorm_completed(values):
    completion = (values.get('cmi.completion_status') or '').lower()
    success = (values.get('cmi.success_status') or '').lower()
    return completion == 'completed' or success in ('passed', 'failed')


def _scorable_sections(manifest):
    sections = manifest.get('sections') or []
    scorable = [section for section in sections if is_scorable_section(section)]
    return scorable or sections


def _final_scorm_score(values):
    score = _scaled_score(values)
    if score is not None:
        return score
    success = (values.get('cmi.success_status') or '').lower()
    if success == 'passed':
        return 100
    if success == 'failed':
        return max(0, PASS_THRESHOLD - 1)
    return 100


def sync_scorm_partial_progress(db, assignment_id, manifest, values):
    progress_percent = compute_scorm_progress_percent(values)
    if progress_percent <= 0:
        return None

    scorable_sections = _scorable_sections(manifest)
    if not scorable_sections:
        return None

    section_weight = manifest.get('section_weight', 100.0 / len(scorable_sections))
    section_id = scorable_sections[0].get('id')
    if not section_id:
        return None

    section_score = min(section_weight, round(progress_percent * section_weight / 100.0, 2))
    total = db.upsert_scorm_section_progress(assignment_id, section_id, section_score)
    return {
        "total_score": total,
        "progress_percent": progress_percent,
        "passed": total >= PASS_THRESHOLD,
        "completed": False
    }


def sync_scorm_completion(db, user_id, course_id, assignment_id, manifest, values):
    scorable_sections = _scorable_sections(manifest)
    if not scorable_sections:
        return None

    final_score = _final_scorm_score(values)
    section_count = len(scorable_sections)
    section_scores = []
    distributed = 0.0
    for index, section in enumerate(scorable_sections):
        section_id = section.get('id')
        if not section_id:
            continue
        if index == section_count - 1:
            section_score = round(final_score - distributed, 2)
        else:
            section_score = round(final_score / section_count, 2)
            distributed += section_score
        section_scores.append((section_id, max(0, section_score)))

    for section_id, section_score in section_scores:
        db.upsert_scorm_section_progress(
            assignment_id,
            section_id,
            section_score,
            allow_decrease=True
        )

    finish_result, finish_error = db.finish_course(
        user_id,
        course_id,
        assignment_id,
        manifest.get('scorable_count', section_count)
    )
    if finish_error:
        total = db._recalculate_assignment_score(assignment_id)
        return {
            "total_score": total,
            "progress_percent": final_score,
            "passed": total >= PASS_THRESHOLD,
            "completed": False
        }
    if finish_result:
        finish_result["progress_percent"] = final_score
    return finish_result


def sync_scorm_progress(db, user_id, course_id, assignment_id, storage, values):
    manifest = load_course_manifest(storage)
    if not manifest or manifest.get('course_type') != 'scorm':
        return None

    if is_scorm_completed(values):
        return sync_scorm_completion(db, user_id, course_id, assignment_id, manifest, values)
    return sync_scorm_partial_progress(db, assignment_id, manifest, values)


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
