import json
import os
import shutil
import xml.etree.ElementTree as ET
import zipfile


SCORM_ENTRY_CANDIDATES = (
    'index_lms.html',
    'index.html',
    'story.html',
    'launch.html',
    'start.html',
    'default.html',
    'shared/launchpage.html',
)


def _strip_ns(tag):
    return tag.split('}')[-1] if '}' in tag else tag


def _child_text(element, name):
    for child in element:
        if _strip_ns(child.tag) == name:
            return (child.text or '').strip()
    return ''


def _safe_extract_zip(zip_file, target_dir):
    target_dir = os.path.normpath(target_dir)
    with zipfile.ZipFile(zip_file) as zf:
        for member in zf.infolist():
            member_path = os.path.normpath(os.path.join(target_dir, member.filename))
            if not member_path.startswith(target_dir):
                raise ValueError('Небезопасный путь внутри ZIP-архива')
            zf.extract(member, target_dir)


def find_manifest(course_dir):
    for dirpath, _, files in os.walk(course_dir):
        if 'imsmanifest.xml' in files:
            return os.path.join(dirpath, 'imsmanifest.xml')
    return None


def _parse_resources(manifest_root):
    resources = {}
    for element in manifest_root.iter():
        if _strip_ns(element.tag) != 'resource':
            continue
        identifier = element.get('identifier')
        href = element.get('href')
        scormtype = element.get('{http://www.adlnet.org/xsd/adlcp_v1p3}scormtype', '')
        if not scormtype:
            scormtype = element.get('adlcp:scormtype', '')
        if identifier and href:
            resources[identifier] = {
                'href': href.replace('\\', '/'),
                'scormtype': scormtype.lower()
            }
    return resources


def _find_launch_file(manifest_dir, resources):
    for name in SCORM_ENTRY_CANDIDATES:
        candidate = os.path.join(manifest_dir, name)
        if os.path.isfile(candidate):
            return candidate

    for resource in resources.values():
        if resource.get('href'):
            candidate = os.path.join(manifest_dir, resource['href'])
            if os.path.isfile(candidate):
                return candidate
    return None


def _collect_items(item_element, resources, manifest_dir, course_dir, sections, counter):
    title = _child_text(item_element, 'title')
    identifierref = item_element.get('identifierref')
    child_items = [c for c in item_element if _strip_ns(c.tag) == 'item']

    if child_items:
        for child in child_items:
            counter = _collect_items(child, resources, manifest_dir, course_dir, sections, counter)
        return counter

    if identifierref and identifierref in resources:
        href = resources[identifierref]['href']
        absolute = os.path.normpath(os.path.join(manifest_dir, href))
        if os.path.isfile(absolute):
            relative = os.path.relpath(absolute, course_dir).replace('\\', '/')
            counter += 1
            sections.append({
                'id': f'sco_{counter}',
                'title': title or f'Раздел {counter}',
                'type': 'content',
                'file': relative,
                'scorm': True
            })
    return counter


def _detect_scorm_version(manifest_root):
    for element in manifest_root.iter():
        if _strip_ns(element.tag) == 'schemaversion':
            text = (element.text or '').strip().lower()
            if '2004' in text or 'cam 1.3' in text:
                return '2004'
            if '1.2' in text:
                return '1.2'
    for value in manifest_root.attrib.values():
        if '1.2' in str(value):
            return '1.2'
    return '2004'


def import_scorm_package(zip_file, course_dir, title):
    os.makedirs(course_dir, exist_ok=True)
    _safe_extract_zip(zip_file, course_dir)

    manifest_path = find_manifest(course_dir)
    if not manifest_path:
        return None, 'В архиве не найден imsmanifest.xml'

    manifest_root = ET.parse(manifest_path).getroot()
    resources = _parse_resources(manifest_root)
    manifest_dir = os.path.dirname(manifest_path)
    root_course_dir = course_dir

    organizations = [e for e in manifest_root.iter() if _strip_ns(e.tag) == 'organization']
    if not organizations:
        return None, 'В манифесте SCORM не найдена организация курса'

    sections = []
    counter = 0
    for item in organizations[0]:
        if _strip_ns(item.tag) == 'item':
            counter = _collect_items(item, resources, manifest_dir, root_course_dir, sections, counter)

    if not sections:
        launch_file = _find_launch_file(manifest_dir, resources)
        if not launch_file:
            return None, 'Не удалось определить стартовый файл SCORM'
        rel_launch = os.path.relpath(launch_file, root_course_dir).replace('\\', '/')
        sections = [{
            'id': 'sco_1',
            'title': title or 'SCORM курс',
            'type': 'content',
            'file': rel_launch,
            'scorm': True
        }]

    course_json = {
        'title': title,
        'course_type': 'scorm',
        'sections': sections
    }

    with open(os.path.join(root_course_dir, 'course.json'), 'w', encoding='utf-8') as file:
        json.dump(course_json, file, ensure_ascii=False, indent=2)

    scorm_meta = {
        'type': 'scorm',
        'version': _detect_scorm_version(manifest_root),
        'manifest': os.path.relpath(manifest_path, root_course_dir).replace('\\', '/'),
        'launch_href': sections[0]['file'],
        'section_count': len(sections)
    }

    with open(os.path.join(root_course_dir, 'scorm_meta.json'), 'w', encoding='utf-8') as file:
        json.dump(scorm_meta, file, ensure_ascii=False, indent=2)

    from scorm_runtime import write_scorm_player
    write_scorm_player(root_course_dir, sections[0]['file'], scorm_meta['version'])

    return {
        'course_type': 'scorm',
        'section_count': len(sections),
        'launch_href': sections[0]['file'],
        'scorm_version': scorm_meta['version']
    }, None


def _write_player_files(course_dir):
    if os.path.isfile(os.path.join(course_dir, 'scorm_meta.json')):
        return
    template_dir = os.path.join(os.path.dirname(__file__), 'courses', '_native_stub')
    stub_index = os.path.join(template_dir, 'index.html')
    dst_index = os.path.join(course_dir, 'index.html')
    if os.path.isfile(stub_index) and not os.path.isfile(dst_index):
        shutil.copy2(stub_index, dst_index)


def import_course_archive(zip_file, course_dir, title):
    try:
        if os.path.exists(course_dir):
            shutil.rmtree(course_dir)
        os.makedirs(course_dir, exist_ok=True)

        probe_dir = course_dir + '_probe'
        os.makedirs(probe_dir, exist_ok=True)
        _safe_extract_zip(zip_file, probe_dir)
        is_scorm = find_manifest(probe_dir) is not None
        shutil.rmtree(probe_dir, ignore_errors=True)

        zip_file.seek(0)

        if is_scorm:
            return import_scorm_package(zip_file, course_dir, title)

        _safe_extract_zip(zip_file, course_dir)
        if os.path.isfile(os.path.join(course_dir, 'course.json')):
            _write_player_files(course_dir)
            return {'course_type': 'native'}, None
        return None, 'Архив должен содержать course.json или SCORM imsmanifest.xml'
    except ValueError as error:
        shutil.rmtree(course_dir, ignore_errors=True)
        return None, str(error)
    except zipfile.BadZipFile:
        shutil.rmtree(course_dir, ignore_errors=True)
        return None, 'Повреждённый ZIP-архив'
