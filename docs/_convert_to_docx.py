"""Batch convert Markdown docs to DOCX via pypandoc."""
import os
import pypandoc

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "docx")
os.makedirs(OUT, exist_ok=True)

FILES = [
    "Глава_2_Разработка.md",
    "Глава_3_Организация_безопасности_АИС.md",
    "Глава_4_Тестирование_и_проверка_работоспособности.md",
    "Глава_5_Аппаратные_и_программные_средства_для_функционирования.md",
    "Руководство_пользователя.md",
    "Тест-кейсы.md",
    "Техническое_описание_курса_Безопасность.md",
]
APP_DIR = os.path.join(ROOT, "проектная_документация")
for name in sorted(os.listdir(APP_DIR)):
    if name.endswith(".md"):
        FILES.append(os.path.join("проектная_документация", name))

created = []
for rel in FILES:
    src = os.path.join(ROOT, rel)
    if not os.path.isfile(src):
        print(f"SKIP (missing): {rel}")
        continue
    base = os.path.splitext(os.path.basename(rel))[0] + ".docx"
    dst = os.path.join(OUT, base)
    try:
        pypandoc.convert_file(
            src,
            "docx",
            outputfile=dst,
            extra_args=["--from=markdown", "--standalone"],
        )
        created.append(dst)
        print(f"OK: {base}")
    except Exception as e:
        print(f"FAIL: {rel} -> {e}")

print(f"\nCreated {len(created)} files in {OUT}")
