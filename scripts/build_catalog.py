# 将 考研单词-5920.xlsx（宽表：每课 4 列）转换为词间日和复刻版的 catalog.json
# 用法: python scripts/build_catalog.py <xlsx路径> <输出json路径>
import json
import re
import sys

import openpyxl

WORD_RE = re.compile(r"^[A-Za-z][A-Za-z'’\-. &/()]*$")
LESSON_RE = re.compile(r"^lesson\s+(\d+)", re.I)
LETTER_RE = re.compile(r"^([A-Z])\s+[a-z]\*?$")


def clean(value):
    if value is None:
        return ""
    text = " ".join(str(value).split())
    return text.strip()


def main(xlsx_path, out_path):
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    grid = [list(row) for row in ws.iter_rows(values_only=True)]
    header = grid[0]

    blocks = []  # (col_index, id, title, section)
    for ci, raw in enumerate(header):
        title = clean(raw)
        if not title:
            continue
        m = LESSON_RE.fullmatch(title)
        if m:
            n = int(m.group(1))
            blocks.append((ci, "lesson-%02d" % n, f"Lesson {n:02d}", "核心词" if n <= 40 else "基础词"))
            continue
        m = LETTER_RE.match(title)
        if m:
            blocks.append((ci, "ext-" + m.group(1).lower(), f"拓展词 · {title}", "拓展词"))

    words = []
    collections = []
    seen = {}
    themes = set()
    skipped = []
    next_id = 1

    for ci, collection_id, title, section in blocks:
        end = min(ci + 4, len(header))
        count_start = len(words)
        category = ""
        for row in grid[1:]:
            cells = (list(row) + [None] * end)[ci:end]
            word, m1, m2, m3 = (clean(cells[0]), clean(cells[1]) if len(cells) > 1 else "",
                                clean(cells[2]) if len(cells) > 2 else "",
                                clean(cells[3]) if len(cells) > 3 else "")
            if not word:
                if m1 and not m2 and not m3:  # 词根主题行
                    category = m1
                    themes.add(m1)
                continue
            if not WORD_RE.match(word) or len(word) > 40:
                skipped.append((title, word))
                continue
            meaning = " ".join(x for x in (m1, m2, m3) if x).strip()
            if not meaning:
                skipped.append((title, word + " <无释义>"))
                continue
            key = word.lower()
            if key in seen:
                continue  # 全局去重：保留更靠前的核心课
            seen[key] = True
            words.append({
                "id": next_id,
                "word": word,
                "meaning": meaning,
                "category": category or "综合",
                "collectionId": collection_id,
                "collectionTitle": title,
                "section": section,
            })
            next_id += 1
        collections.append({
            "id": collection_id,
            "title": title,
            "section": section,
            "sortOrder": len(collections),
            "wordCount": len(words) - count_start,
        })

    catalog = {
        "catalogIdVersion": 1,
        "source": "考研单词-5920.xlsx",
        "collections": collections,
        "words": words,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))

    print(f"blocks={len(collections)} words={len(words)} themes={len(themes)} skipped={len(skipped)}")
    for c in collections:
        print(f"  {c['id']:>10} {c['title']:<18} {c['wordCount']}")
    if skipped:
        print("skipped samples:", skipped[:10])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
