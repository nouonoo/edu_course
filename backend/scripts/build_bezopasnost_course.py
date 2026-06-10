"""
Сборка курса «Безопасность» из txt-исходников Figma.
"""
import os
import re
import shutil

DESKTOP = os.path.join(os.path.expanduser('~'), 'OneDrive', 'Рабочий стол')
SOURCES = {
    'splash': os.path.join(DESKTOP, 'обложка.txt'),
    'navigation': os.path.join(DESKTOP, 'кодики', 'плеер.txt'),
    'intro': os.path.join(DESKTOP, 'кодики', 'введение.txt'),
    'section-1': os.path.join(DESKTOP, 'кодики', '1 раздел.txt'),
    'section-2': os.path.join(DESKTOP, 'кодики', '2 раздел.txt'),
    'section-3': os.path.join(DESKTOP, 'кодики', '3 раздел.txt'),
    'section-4': os.path.join(DESKTOP, 'кодики', '4 раздел.txt'),
    'section-5': os.path.join(DESKTOP, 'кодики', '5 раздел.txt'),
    'section-6': os.path.join(DESKTOP, 'кодики', '6 раздел.txt'),
    'conclusion': os.path.join(DESKTOP, 'кодики', 'заключение.txt'),
    'contents': os.path.join(DESKTOP, 'кодики', 'содержание.txt'),
}

COURSE_DIR = os.path.join(os.path.dirname(__file__), '..', 'courses', 'bezopasnost')
SECTIONS_DIR = os.path.join(COURSE_DIR, 'sections')
STYLES_DIR = os.path.join(COURSE_DIR, 'styles')
IMG_DIR = os.path.join(COURSE_DIR, 'assets', 'img')


def read_source(path):
    with open(path, 'r', encoding='utf-8') as file:
        return file.read()


def split_html_css(raw):
    html_part = raw
    css_part = ''
    match = re.search(r'</html>\s*', raw, re.IGNORECASE)
    if match:
        html_part = raw[:match.end()]
        css_part = raw[match.end():].strip()
    return html_part, css_part


def extract_body(html):
    body_match = re.search(r'<body[^>]*>(.*)</body>', html, re.DOTALL | re.IGNORECASE)
    if not body_match:
        return html.strip()
    return body_match.group(1).strip()


def fix_asset_paths(html):
    html = re.sub(r'src="img/', 'src="assets/img/', html)
    html = re.sub(r"url\(img/", "url(assets/img/", html)
    return html


def strip_embedded_menu(html):
    return re.sub(
        r'<div class="menu"[^>]*>.*?</div>\s*</div>\s*</div>',
        '',
        html,
        count=1,
        flags=re.DOTALL
    )


def scope_css(css, screen_id):
    if not css:
        return ''
    css = re.sub(r'@import[^;]+;', '', css)
    css = re.sub(r':root\s*\{', f'#screen-{screen_id} {{', css)
    lines = []
    for line in css.splitlines():
        stripped = line.strip()
        if not stripped:
            lines.append(line)
            continue
        if stripped.startswith('/*') or stripped.startswith('@font-face'):
            lines.append(line)
            continue
        if stripped in ('* {', 'html,', 'body {') or stripped.startswith('html,') or stripped == '* {':
            continue
        if stripped.startswith('html,') or stripped.startswith('body ') or stripped == 'body {':
            continue
        if stripped.startswith('* '):
            continue
        if line.startswith('.') or (',' in line and '{' in line):
            selector = line.split('{', 1)[0].strip()
            if selector and not selector.startswith(f'#screen-{screen_id}'):
                rest = line[len(selector):]
                scoped = ', '.join(
                    f'#screen-{screen_id} {part.strip()}'
                    for part in selector.split(',')
                )
                line = scoped + rest
        lines.append(line)
    return '\n'.join(lines)


def collect_image_names(html, css):
    names = set(re.findall(r'assets/img/([^"\')\s]+)', html))
    names.update(re.findall(r'assets/img/([^"\')\s]+)', css))
    return sorted(names)


def write_placeholder_image(path):
    name = os.path.basename(path)
    if name.endswith('.svg'):
        content = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">'
            '<rect width="120" height="80" fill="#e8e4dc" rx="8"/>'
            '<text x="60" y="44" text-anchor="middle" fill="#8a8478" font-size="11" font-family="Arial">img</text>'
            '</svg>'
        )
    else:
        content = (
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        )
        import base64
        with open(path, 'wb') as file:
            file.write(base64.b64decode(content))
        return
    with open(path, 'w', encoding='utf-8') as file:
        file.write(content)


def build_section(screen_id, source_path, strip_menu=False):
    raw = read_source(source_path)
    html_raw, css_raw = split_html_css(raw)
    body = extract_body(html_raw)
    if strip_menu:
        body = strip_embedded_menu(body)
    body = fix_asset_paths(body)
    css = scope_css(css_raw, screen_id)

    os.makedirs(SECTIONS_DIR, exist_ok=True)
    os.makedirs(STYLES_DIR, exist_ok=True)

    fragment_path = os.path.join(SECTIONS_DIR, f'{screen_id}.html')
    with open(fragment_path, 'w', encoding='utf-8') as file:
        file.write(body)

    style_path = os.path.join(STYLES_DIR, f'{screen_id}.css')
    with open(style_path, 'w', encoding='utf-8') as file:
        file.write(css)

    return body, css


SCREEN_ORDER = [
    'splash', 'navigation', 'intro',
    'section-1', 'section-2', 'section-3', 'section-4', 'section-5', 'section-6',
    'conclusion'
]


def generate_index():
    style_links = [
        'assets/globals.css',
        'assets/styleguide.css',
        'assets/course-shell.css',
        'styles/contents.css',
    ]
    for screen_id in SCREEN_ORDER:
        style_links.append(f'styles/{screen_id}.css')

    screens_html = []
    for screen_id in SCREEN_ORDER:
        fragment_path = os.path.join(SECTIONS_DIR, f'{screen_id}.html')
        with open(fragment_path, 'r', encoding='utf-8') as file:
            inner = file.read().strip()
        active = ' active' if screen_id == 'splash' else ''
        screens_html.append(
            f'        <section id="screen-{screen_id}" class="course-screen{active}" data-screen="{screen_id}">\n'
            f'            {inner}\n'
            f'        </section>'
        )

    with open(os.path.join(SECTIONS_DIR, 'contents.html'), 'r', encoding='utf-8') as file:
        contents_inner = file.read().strip()

    index_html = f'''<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Безопасность</title>
{chr(10).join(f'    <link rel="stylesheet" href="{href}">' for href in style_links)}
</head>
<body>
    <div id="course-app">
        <header id="course-header" class="course-header is-hidden">
            <button type="button" id="btn-contents" class="header-btn" title="Содержание">
                <span class="header-btn-icon">☰</span>
                <span>Содержание</span>
            </button>
            <div class="course-progress">
                <div class="course-progress-track">
                    <div id="course-progress-fill" class="course-progress-fill"></div>
                </div>
                <span id="course-progress-text" class="course-progress-text">0%</span>
            </div>
        </header>

        <main id="course-main">
{chr(10).join(screens_html)}
        </main>

        <div id="contents-overlay" class="course-overlay is-hidden" aria-hidden="true">
            <div class="course-overlay-panel">
                <button type="button" id="btn-close-contents" class="overlay-close" aria-label="Закрыть">×</button>
                <h2 class="overlay-title">Содержание</h2>
                <div id="contents-grid" class="contents-grid"></div>
            </div>
        </div>

        <div id="gate-hint" class="gate-hint is-hidden">Изучите все элементы на экране, чтобы продолжить</div>
    </div>

    <script src="lms-bridge.js"></script>
    <script src="course-interactions.js"></script>
    <script src="course-app.js"></script>
</body>
</html>
'''
    with open(os.path.join(COURSE_DIR, 'index.html'), 'w', encoding='utf-8') as file:
        file.write(index_html)


def main():
    if os.path.isdir(SECTIONS_DIR):
        shutil.rmtree(SECTIONS_DIR)
    if os.path.isdir(STYLES_DIR):
        shutil.rmtree(STYLES_DIR)
    os.makedirs(IMG_DIR, exist_ok=True)

    all_images = set()
    for screen_id, path in SOURCES.items():
        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        body, css = build_section(
            screen_id,
            path,
            strip_menu=screen_id not in ('splash', 'navigation', 'contents')
        )
        all_images.update(collect_image_names(body, css))

    for image_name in all_images:
        target = os.path.join(IMG_DIR, image_name.replace('/', os.sep))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        if not os.path.isfile(target):
            write_placeholder_image(target)

    generate_index()
    print(f'Built {len(SOURCES)} screens, {len(all_images)} image placeholders.')


if __name__ == '__main__':
    main()
