"""
Merge vocabulary from all korean-practice-* student repos into a single Hub vocab.json.
Fetches data/vocab.json from each repo via GitHub API, deduplicates, and outputs to data/vocab.json.
"""

import json
import os
import sys
import urllib.request
import urllib.error

sys.stdout.reconfigure(encoding='utf-8')

GITHUB_USER = 'g4jy'
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(BASE_DIR, 'data', 'vocab.json')

STUDENT_REPOS = [
    'korean-practice-agata',
    'korean-practice-charline',
    'korean-practice-chasity',
    'korean-practice-clayton',
    'korean-practice-corine',
    'korean-practice-ignacio',
    'korean-practice-inessa',
    'korean-practice-jaida',
    'korean-practice-jowita',
    'korean-practice-kath',
    'korean-practice-madia',
    'korean-practice-maimuna',
    'korean-practice-noelle',
    'korean-practice-nora',
    'korean-practice-rahayu',
    'korean-practice-samantha',
    'korean-practice-violeta',
    'korean-practice-woraphun',
    'korean-practice-yannis',
]


def fetch_vocab(repo):
    """Fetch data/vocab.json from a GitHub repo."""
    for branch in ['master', 'main']:
        url = f'https://raw.githubusercontent.com/{GITHUB_USER}/{repo}/{branch}/data/vocab.json'
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError:
            continue
        except Exception as e:
            print(f'  Error fetching {repo}/{branch}: {e}')
            continue
    return None


def dedup_by_kr(items):
    """Deduplicate a list of dicts by 'kr' field, keeping first occurrence."""
    seen = set()
    result = []
    for item in items:
        kr = item.get('kr', '')
        if kr and kr not in seen:
            seen.add(kr)
            result.append(item)
    return result


def merge_verbs(all_verbs):
    """Deduplicate verbs by 'id', merging objectTypes and compatibleObjects."""
    by_id = {}
    for v in all_verbs:
        vid = v.get('id', v.get('present', ''))
        if not vid:
            continue
        if vid not in by_id:
            by_id[vid] = dict(v)
            # Ensure sets for merging
            by_id[vid]['_objectTypes'] = set(v.get('objectTypes', []))
            by_id[vid]['_compatibleObjects'] = set(v.get('compatibleObjects', []))
        else:
            existing = by_id[vid]
            existing['_objectTypes'].update(v.get('objectTypes', []))
            existing['_compatibleObjects'].update(v.get('compatibleObjects', []))

    result = []
    for vid, v in by_id.items():
        v['objectTypes'] = sorted(v.pop('_objectTypes'))
        v['compatibleObjects'] = sorted(v.pop('_compatibleObjects'))
        result.append(v)
    return result


def merge_flashcard_categories(all_categories):
    """Merge flashcard categories, deduplicating cards within each category."""
    by_name = {}
    for cat in all_categories:
        name = cat.get('name', 'Other')
        if name not in by_name:
            by_name[name] = {'name': name, 'cards': []}
        by_name[name]['cards'].extend(cat.get('cards', []))

    result = []
    for name, cat in sorted(by_name.items()):
        cat['cards'] = dedup_by_kr(cat['cards'])
        result.append(cat)
    return result


def merge_intro_topics(all_topics):
    """Deduplicate intro topics by kr, merging compatibleNounTypes."""
    by_kr = {}
    for t in all_topics:
        kr = t.get('kr', '')
        if not kr:
            continue
        if kr not in by_kr:
            by_kr[kr] = dict(t)
            by_kr[kr]['_types'] = set(t.get('compatibleNounTypes', []))
        else:
            by_kr[kr]['_types'].update(t.get('compatibleNounTypes', []))
    result = []
    for kr, t in by_kr.items():
        if t['_types']:
            t['compatibleNounTypes'] = sorted(t.pop('_types'))
        else:
            t.pop('_types', None)
        result.append(t)
    return result


def merge_quiz_situations(all_situations):
    """Deduplicate quiz situations by the 'situation' text field."""
    seen = set()
    result = []
    for s in all_situations:
        key = s.get('situation', '')
        if key and key not in seen:
            seen.add(key)
            result.append(s)
    return result


def main():
    print(f'Fetching vocab from {len(STUDENT_REPOS)} student repos...\n')

    # Accumulators
    all_subjects = []
    all_times = []
    all_places = []
    all_objects = []
    all_verbs = []

    all_desc_subjects = []
    all_adjectives = []
    all_adverbs = []

    all_fc_categories = []

    all_intro_topics = []
    all_intro_nouns = []

    all_quiz_situations = []

    fetched = 0
    for repo in STUDENT_REPOS:
        data = fetch_vocab(repo)
        if not data:
            print(f'  SKIP: {repo} (no vocab.json)')
            continue
        fetched += 1
        student = data.get('student', repo.replace('korean-practice-', ''))
        print(f'  OK: {repo} ({student})')

        # Action
        action = data.get('action', {})
        all_subjects.extend(action.get('subjects', []))
        all_times.extend(action.get('times', []))
        all_places.extend(action.get('places', []))
        all_objects.extend(action.get('objects', []))
        all_verbs.extend(action.get('verbs', []))

        # Describe
        desc = data.get('describe', {})
        all_desc_subjects.extend(desc.get('subjects', []))
        all_adjectives.extend(desc.get('adjectives', []))
        all_adverbs.extend(desc.get('adverbs', []))

        # Flashcards
        fc = data.get('flashcards', {})
        all_fc_categories.extend(fc.get('categories', []))

        # Intro (Clayton-style)
        intro = data.get('intro', {})
        all_intro_topics.extend(intro.get('topics', []))
        all_intro_nouns.extend(intro.get('nouns', []))

        # Quiz (Yannis-style)
        quiz = data.get('quiz', {})
        all_quiz_situations.extend(quiz.get('situations', []))

    print(f'\nFetched {fetched}/{len(STUDENT_REPOS)} repos')

    # Build merged vocab
    merged = {
        'student': 'Hub',
        'action': {
            'subjects': dedup_by_kr(all_subjects),
            'times': dedup_by_kr(all_times),
            'places': dedup_by_kr(all_places),
            'objects': dedup_by_kr(all_objects),
            'verbs': merge_verbs(all_verbs),
        },
        'describe': {
            'subjects': dedup_by_kr(all_desc_subjects),
            'adjectives': dedup_by_kr(all_adjectives),
            'adverbs': dedup_by_kr(all_adverbs),
        },
        'flashcards': {
            'categories': merge_flashcard_categories(all_fc_categories),
        },
    }

    # Add intro if any topics found
    if all_intro_topics:
        merged['intro'] = {
            'topics': merge_intro_topics(all_intro_topics),
            'nouns': dedup_by_kr(all_intro_nouns),
        }

    # Add quiz if any situations found
    if all_quiz_situations:
        merged['quiz'] = {
            'situations': merge_quiz_situations(all_quiz_situations),
        }

    # Stats
    print(f'\n--- Merged Stats ---')
    print(f'Action: {len(merged["action"]["subjects"])} subjects, '
          f'{len(merged["action"]["times"])} times, '
          f'{len(merged["action"]["places"])} places, '
          f'{len(merged["action"]["objects"])} objects, '
          f'{len(merged["action"]["verbs"])} verbs')
    print(f'Describe: {len(merged["describe"]["subjects"])} subjects, '
          f'{len(merged["describe"]["adjectives"])} adjectives, '
          f'{len(merged["describe"]["adverbs"])} adverbs')
    fc_total = sum(len(c['cards']) for c in merged['flashcards']['categories'])
    print(f'Flashcards: {len(merged["flashcards"]["categories"])} categories, {fc_total} cards')
    if 'intro' in merged:
        print(f'Intro: {len(merged["intro"]["topics"])} topics, {len(merged["intro"]["nouns"])} nouns')
    if 'quiz' in merged:
        print(f'Quiz: {len(merged["quiz"]["situations"])} situations')

    # Write output
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    size = os.path.getsize(OUTPUT_PATH)
    print(f'\nWrote {OUTPUT_PATH} ({size:,} bytes)')


if __name__ == '__main__':
    main()
