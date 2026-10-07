"""Audit lineage; --adopt-reviewed-lineage preserves inherited MP3s with explicit proof.

Never sends text or creates audio. Adoption requires operator review of the lineage.
"""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

BASE = Path(__file__).resolve().parents[1]
REPO = BASE.parent
spec = importlib.util.spec_from_file_location('tts', BASE / 'generate_tts.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args])


def audit_legacy():
    source_commit = git('rev-parse', 'd9c212c').decode().strip()
    original_manifest = git('show', source_commit + ':audio/tts/manifest.json')
    original_map = json.loads(original_manifest)
    original_generator = git('show', source_commit + ':generate_tts.py')
    parsed = ast.parse(original_generator.decode('utf-8'))
    voices = [n.value.value for n in ast.walk(parsed) if isinstance(n, ast.Assign)
              and any(isinstance(t, ast.Name) and t.id == 'VOICE' for t in n.targets)
              and isinstance(n.value, ast.Constant)]
    calls = [n for n in ast.walk(parsed) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
             and isinstance(n.func.value, ast.Name) and n.func.value.id == 'edge_tts' and n.func.attr == 'Communicate']
    assert voices == [g.VOICE] and len(calls) == 1
    assert {k.arg: k.value.id for k in calls[0].keywords if isinstance(k.value, ast.Name)} == {'text': 'text', 'voice': 'VOICE'}
    manifest, _ = g.manifest_at(g.AUDIO_DIR)
    entries = []
    for text, filename in manifest.get('legacy_entries', {}).items():
        assert original_map.get(text) == filename, 'Original exact text map differs'
        assert filename.endswith('_' + hashlib.md5(text.encode('utf-8')).hexdigest()[:6] + '.mp3')
        current = (g.AUDIO_DIR / filename).read_bytes()
        original = git('show', source_commit + ':audio/tts/' + filename)
        assert current == original and g.valid_mp3(current), 'Original bytes differ'
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
            'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', str(g.AUDIO_DIR / filename)]))
        duration = float(probe['format']['duration'])
        assert duration > 0 and probe['streams'][0]['codec_name'] == 'mp3'
        key = g.request_key(text)
        entry = {'text': text, 'text_sha256': g.digest(text), 'request_sha256': key,
                 'file': filename, 'audio_sha256': g.digest(current), 'receipt': key + '.provenance.json'}
        proof = {k: v for k, v in entry.items() if k != 'receipt'}
        proof.update(schema_version=1, source_kind='repository_lineage', provider='edge-tts',
                     voice=g.VOICE, rate=g.RATE, volume=g.VOLUME, pitch=g.PITCH, reviewed_public=True,
                     source_commit=source_commit, source_generator_path='generate_tts.py',
                     generator_sha256=g.digest(original_generator), source_manifest_path='audio/tts/manifest.json',
                     source_manifest_sha256=g.digest(original_manifest), original_text=text, original_file=filename,
                     original_audio_sha256=g.digest(original), duration_seconds=duration,
                     sample_rate=probe['streams'][0]['sample_rate'], channels=probe['streams'][0]['channels'],
                     audited_at=datetime.now(timezone.utc).isoformat(),
                     voice_basis='Historical Edge generator configuration; not independent acoustic voice identification.',
                     utterance_verified_by_listening=False,
                     limitation='Exact inherited text mapping and identical source bytes; no historical per-request service receipt.')
        entries.append({'entry': entry, 'proof': proof})
    return {'source_commit': source_commit, 'count': len(entries), 'missing': 0,
            'zero_duration': 0, 'entries': entries}


def adopt(report):
    baseline = g.checked_remote()
    manifest, original = g.manifest_at(g.AUDIO_DIR)
    adopted = 0
    for item in report['entries']:
        entry, proof = item['entry'], item['proof']
        text = entry['text']
        existing = manifest['entries'].get(text)
        if existing:
            if not g.verify_entry(text, existing, g.AUDIO_DIR):
                raise ValueError('Existing entry needs review; not overwritten')
            continue
        proof_bytes = g.json_bytes(proof)
        entry['receipt_sha256'] = g.digest(proof_bytes)
        assert g.digest((g.AUDIO_DIR / entry['file']).read_bytes()) == entry['audio_sha256']
        path = g.AUDIO_DIR / entry['receipt']
        if path.exists():
            raise ValueError('Existing unindexed proof needs review; not overwritten')
        g.publish_new(path, proof_bytes)
        assert g.verify_entry(text, entry, g.AUDIO_DIR)
        manifest['entries'][text] = entry
        adopted += 1
    if g.checked_remote() != baseline:
        raise RuntimeError('Audio paths changed; notify main')
    if adopted:
        g.save_manifest(g.AUDIO_DIR, manifest, original)
    return adopted


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adopt-reviewed-lineage', action='store_true')
    args = parser.parse_args()
    report = audit_legacy()
    if args.adopt_reviewed_lineage:
        report['adopted'] = adopt(report)
    print(json.dumps(report, ensure_ascii=True))
