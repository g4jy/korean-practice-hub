"""Offline final verification; optional report writes only outside the repository."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('tts', BASE / 'generate_tts.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


def verify(legacy_baseline=None):
    manifest, manifest_bytes = g.manifest_at(g.AUDIO_DIR)
    data = g.read_json(g.VOCAB_PATH)
    report = g.audit(data, g.AUDIO_DIR)
    files, seen, sources = [], {}, {'edge_generation': 0, 'repository_lineage': 0}
    invalid, zero, decode_errors, duplicate_files, boundary_mismatches = [], [], [], [], []
    for text, entry in manifest['entries'].items():
        if not g.verify_entry(text, entry, g.AUDIO_DIR):
            invalid.append(text)
            continue
        proof = g.read_json(g.AUDIO_DIR / entry['receipt'])
        sources[proof['source_kind']] += 1
        if proof['source_kind'] == 'edge_generation' and ''.join(b.get('text', '') for b in proof.get('boundaries', [])) != text:
            boundary_mismatches.append(text)
        file = g.AUDIO_DIR / entry['file']
        if entry['file'] in seen:
            duplicate_files.append({'text': text, 'other_text': seen[entry['file']]})
        seen[entry['file']] = text
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
            'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', str(file)],
            capture_output=True, encoding='utf-8', timeout=30)
        if probe.returncode:
            decode_errors.append({'file': entry['file'], 'error': probe.stderr})
            continue
        info = json.loads(probe.stdout)
        duration = float(info['format'].get('duration', 0))
        if duration <= 0:
            zero.append(entry['file'])
        decode = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(file), '-f', 'null', '-'],
                                capture_output=True, encoding='utf-8', timeout=30)
        if decode.returncode or decode.stderr:
            decode_errors.append({'file': entry['file'], 'error': decode.stderr})
        files.append({'text': text, 'file': entry['file'], 'source_kind': proof['source_kind'],
                      'sha256': entry['audio_sha256'], 'duration_seconds': duration,
                      'codec': info['streams'][0]['codec_name']})
    original_unchanged = None
    if legacy_baseline:
        baseline = g.read_json(legacy_baseline)
        original_unchanged = all(g.digest((g.AUDIO_DIR / item['entry']['file']).read_bytes()) == item['entry']['audio_sha256']
                                 for item in baseline['entries'])
    required = g.required_card_texts(data)
    reused_required = sum(text in required and g.read_json(g.AUDIO_DIR / entry['receipt']).get('source_kind') == 'repository_lineage'
                          for text, entry in manifest['entries'].items())
    report.update(checked_at=datetime.now(timezone.utc).isoformat(),
                  manifest_sha256=g.digest(manifest_bytes), vocab_sha256=g.digest(g.VOCAB_PATH.read_bytes()),
                  newly_generated_count=sources['edge_generation'], reused_count=sources['repository_lineage'],
                  reused_required_count=reused_required, duration_zero_count=len(zero), duration_zero_files=zero,
                  invalid_entries=invalid, decode_errors=decode_errors, duplicate_file_references=duplicate_files,
                  boundary_text_mismatches=boundary_mismatches,
                  original_96_bytes_unchanged=original_unchanged, files=files,
                  missing_required_count=len(report['missing_required_words']),
                  generation_data_scope='Approved public card kr/polite only; no examples, learner history or evidence sent.',
                  dynamic_generation=False, voice='ko-KR-SunHiNeural',
                  source_distinction='repository_lineage is inherited mapping/blob evidence, not newly observed Edge generation or acoustic identity verification.')
    report['passed'] = not (invalid or zero or decode_errors or duplicate_files or boundary_mismatches or report['missing_required_words']) and original_unchanged is not False
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--legacy-baseline', type=Path)
    parser.add_argument('--private-report', type=Path)
    args = parser.parse_args()
    report = verify(args.legacy_baseline)
    if args.private_report:
        target = args.private_report.resolve()
        if target.is_relative_to(BASE.parent.resolve()):
            raise ValueError('Verification report must remain outside public repository')
        with target.open('xb') as stream:
            stream.write(g.json_bytes(report))
    summary = {k: report[k] for k in ('passed', 'newly_generated_count', 'reused_count', 'reused_required_count',
        'required_cards_polite', 'missing_required_count', 'duration_zero_count', 'original_96_bytes_unchanged', 'coverage')}
    print(json.dumps(summary, ensure_ascii=True, indent=2))
    raise SystemExit(0 if report['passed'] else 1)
