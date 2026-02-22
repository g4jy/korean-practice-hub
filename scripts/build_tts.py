"""
Build TTS audio for the Hub by:
1. Copying existing files from TTS-Central
2. Generating missing files with edge-tts
3. Writing manifest.json
"""

import asyncio
import edge_tts
import json
import os
import sys
import hashlib
import shutil
import time

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB_PATH = os.path.join(BASE_DIR, 'data', 'vocab.json')
SENTENCES_PATH = os.path.join(BASE_DIR, 'data', 'sentences.json')
AUDIO_DIR = os.path.join(BASE_DIR, 'audio', 'tts')
VOICE = 'ko-KR-SunHiNeural'

# TTS-Central paths
CENTRAL_DIR = os.path.join(BASE_DIR, '..', 'korean-learning-tools', 'tts-central')
CENTRAL_MANIFEST = os.path.join(CENTRAL_DIR, 'manifest.json')
CENTRAL_AUDIO = os.path.join(CENTRAL_DIR, 'audio')


def has_jongseong(char):
    code = ord(char)
    if code < 0xAC00 or code > 0xD7AF:
        return False
    return (code - 0xAC00) % 28 != 0


def extract_all_texts():
    """Extract all unique Korean texts from vocab.json + sentences.json."""
    texts = set()

    with open(VOCAB_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Action
    action = data.get('action', {})
    for s in action.get('subjects', []):
        texts.add(s['kr'])
    for t in action.get('times', []):
        texts.add(t['kr'])
    for p in action.get('places', []):
        texts.add(p['kr'])
        if 'formE' in p:
            texts.add(p['formE']['kr'])
        if 'formEseo' in p:
            texts.add(p['formEseo']['kr'])
    for o in action.get('objects', []):
        kr = o['kr']
        texts.add(kr)
        texts.add(kr + ('을' if has_jongseong(kr[-1]) else '를'))
    for v in action.get('verbs', []):
        for tense in ['past', 'present', 'future']:
            if tense in v:
                texts.add(v[tense])

    # Describe
    desc = data.get('describe', {})
    for s in desc.get('subjects', []):
        kr = s['kr']
        texts.add(kr)
        texts.add(kr + ('이' if has_jongseong(kr[-1]) else '가'))
    for a in desc.get('adjectives', []):
        texts.add(a['kr'])
    for adv in desc.get('adverbs', []):
        texts.add(adv['kr'])

    # Flashcards
    fc = data.get('flashcards', {})
    for cat in fc.get('categories', []):
        for card in cat.get('cards', []):
            texts.add(card['kr'])

    # Intro
    intro = data.get('intro', {})
    for t in intro.get('topics', []):
        texts.add(t['kr'])
    for n in intro.get('nouns', []):
        kr = n['kr']
        texts.add(kr)
        texts.add(kr + ('이에요' if has_jongseong(kr[-1]) else '예요'))

    # Quiz
    quiz = data.get('quiz', {})
    for s in quiz.get('situations', []):
        if 'correct' in s:
            texts.add(s['correct'])
        for opt in s.get('options', []):
            texts.add(opt)

    # Sentences
    if os.path.exists(SENTENCES_PATH):
        with open(SENTENCES_PATH, 'r', encoding='utf-8') as f:
            sdata = json.load(f)
        for ch in sdata.get('chapters', []):
            for s in ch.get('sentences', []):
                if 'kr' in s:
                    texts.add(s['kr'])

    texts.discard('')
    return sorted(texts)


def repo_filename(text, index):
    """Hub repo filename: sequential index + md5 hash."""
    h = hashlib.md5(text.encode('utf-8')).hexdigest()[:6]
    return f'{index:04d}_{h}.mp3'


async def generate_tts(text, filepath, sem, counter):
    """Generate a single TTS file."""
    async with sem:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        tts = edge_tts.Communicate(text=text, voice=VOICE)
        await tts.save(filepath)
        counter[0] += 1
        print(f'  Generated [{counter[0]}]: "{text}"')


async def main():
    start = time.time()
    texts = extract_all_texts()
    print(f'Total unique texts: {len(texts)}')

    # Load central manifest
    central_manifest = {}
    if os.path.exists(CENTRAL_MANIFEST):
        with open(CENTRAL_MANIFEST, 'r', encoding='utf-8') as f:
            central_manifest = json.load(f)
        print(f'TTS-Central: {len(central_manifest)} entries')

    os.makedirs(AUDIO_DIR, exist_ok=True)

    manifest = {}
    to_generate = []
    copied = 0

    for i, text in enumerate(texts):
        fname = repo_filename(text, i)
        fpath = os.path.join(AUDIO_DIR, fname)
        manifest[text] = fname

        # Try to copy from central
        if text in central_manifest:
            central_fname = central_manifest[text]
            central_path = os.path.join(CENTRAL_AUDIO, central_fname)
            if os.path.exists(central_path):
                shutil.copy2(central_path, fpath)
                copied += 1
                continue

        to_generate.append((text, fpath))

    print(f'Copied from central: {copied}')
    print(f'Need to generate: {len(to_generate)}')

    if to_generate:
        sem = asyncio.Semaphore(5)
        counter = [0]
        tasks = [generate_tts(text, fpath, sem, counter) for text, fpath in to_generate]
        await asyncio.gather(*tasks)

    # Write manifest
    mpath = os.path.join(AUDIO_DIR, 'manifest.json')
    with open(mpath, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    # Clean orphans
    valid = set(manifest.values())
    removed = 0
    for f in os.listdir(AUDIO_DIR):
        if f.endswith('.mp3') and f not in valid:
            os.remove(os.path.join(AUDIO_DIR, f))
            removed += 1

    elapsed = time.time() - start
    total_size = sum(
        os.path.getsize(os.path.join(AUDIO_DIR, f))
        for f in os.listdir(AUDIO_DIR) if f.endswith('.mp3')
    )
    print(f'\nDone! {len(texts)} files ({copied} copied, {len(to_generate)} generated)')
    print(f'Removed {removed} orphans')
    print(f'Total size: {total_size/1024/1024:.1f} MB, Time: {elapsed:.1f}s')


if __name__ == '__main__':
    asyncio.run(main())
