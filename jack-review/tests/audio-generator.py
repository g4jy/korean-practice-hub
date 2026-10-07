"""Offline tests. All audio is fake, confined to temporary directories."""
import asyncio
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('tts', Path(__file__).resolve().parents[1] / 'generate_tts.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
TEXT = '\uD559\uAD50'
DATA = {'flashcards': {'categories': [{'cards': [{'id': 'ko:%ED%95%99%EA%B5%90', 'kr': TEXT, 'polite': '\uAC00\uC694', 'exampleKr': 'PRIVATE EXAMPLE', 'evidence': [{'kr': 'PRIVATE EVIDENCE'}]}]}]}}
BLOB = b'ID3' + b'fake audio for tests only' * 20
calls = []


class FakeClient:
    def __init__(self, **kwargs):
        calls.append(kwargs)

    async def stream(self):
        yield {'type': 'audio', 'data': BLOB}


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.backup = tempfile.TemporaryDirectory()
        self.addCleanup(self.backup.cleanup)
        self.vocab = g.json_bytes(DATA)
        self.approval = {'reviewed_public': True, 'vocab_sha256': g.digest(self.vocab), 'texts': [TEXT]}
        calls.clear()
        self.addCleanup(patch.stopall)
        patch.dict(sys.modules, {'edge_tts': types.SimpleNamespace(Communicate=FakeClient)}).start()
        patch.object(g.importlib.metadata, 'version', return_value='test-only').start()
        patch.object(g, 'BACKUP_DIR', Path(self.backup.name)).start()

    def run_generation(self, approval=None, remote=lambda: 'same'):
        return asyncio.run(g.generate_approved(DATA, self.directory, approval or self.approval,
                                               remote_check=remote, vocab_bytes=self.vocab))

    def test_incremental_exact_evidence(self):
        self.assertEqual(self.run_generation()['generated'], 1)
        before = {p.name: p.read_bytes() for p in self.directory.iterdir()}
        self.assertEqual(self.run_generation()['reused'], 1)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.directory.iterdir()})
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['text'], TEXT)
        manifest, _ = g.manifest_at(self.directory)
        self.assertTrue(g.verify_entry(TEXT, manifest['entries'][TEXT], self.directory))
        self.assertFalse(g.verify_entry(TEXT + ' ', manifest['entries'][TEXT], self.directory))

    def test_legacy_not_regenerated_or_certified(self):
        (self.directory / 'legacy.mp3').write_bytes(BLOB)
        raw = g.json_bytes({TEXT: 'legacy.mp3'})
        (self.directory / 'manifest.json').write_bytes(raw)
        self.assertEqual(self.run_generation()['blocked_unverified'], 1)
        self.assertFalse(calls)
        self.assertEqual((self.directory / 'manifest.json').read_bytes(), raw)

    def test_tamper_and_missing_audio_blocked(self):
        self.run_generation()
        manifest, _ = g.manifest_at(self.directory)
        entry = manifest['entries'][TEXT]
        path = self.directory / entry['file']
        path.write_bytes(b'corrupt')
        self.assertFalse(g.verify_entry(TEXT, entry, self.directory))
        self.assertEqual(self.run_generation()['blocked_unverified'], 1)
        path.unlink()
        self.assertFalse(g.verify_entry(TEXT, entry, self.directory))
        self.assertEqual(len(calls), 1)

    def test_approval_hash_and_private_exclusion(self):
        static = g.text_groups(DATA)['static']
        self.assertIn('\uAC00\uC694', static)
        self.assertNotIn('PRIVATE EXAMPLE', static)
        self.assertNotIn('PRIVATE EVIDENCE', static)
        for updates in ({'reviewed_public': False}, {'vocab_sha256': 'wrong'}, {'texts': ['PRIVATE EXAMPLE']}):
            approval = dict(self.approval, **updates)
            with self.assertRaises(ValueError):
                self.run_generation(approval)
        self.assertFalse(calls)

    def test_failed_stream_no_manifest(self):
        async def fail(_):
            yield {'type': 'audio', 'data': b'bad'}
        with patch.object(FakeClient, 'stream', fail):
            with self.assertRaises(ValueError):
                self.run_generation()
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_remote_advance_discards_generated_bytes(self):
        checks = iter(['same', 'same', 'changed'])
        with self.assertRaises(RuntimeError):
            self.run_generation(remote=lambda: next(checks))
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_manifest_preserves_legacy_on_new_generation(self):
        raw = g.json_bytes({'old': 'old.mp3'})
        (self.directory / 'manifest.json').write_bytes(raw)
        self.run_generation()
        manifest, _ = g.manifest_at(self.directory)
        self.assertEqual(manifest['legacy_entries'], {'old': 'old.mp3'})
        self.assertEqual((Path(self.backup.name) / ('manifest-' + g.digest(raw) + '.snapshot.json')).read_bytes(), raw)
        self.assertEqual(list(self.directory.glob('*.snapshot.json')), [])

    def test_builder_coverage_includes_whole_sentences(self):
        data = {'action': {'subjects': [{'kr': '\uC800\uB294'}], 'times': [], 'places': [],
                'objects': [{'kr': '\uBB3C', 'category': 'drink'}],
                'verbs': [{'present': '\uB9C8\uC154\uC694', 'objectTypes': ['drink']}]},
                'describe': {'subjects': [{'kr': '\uC9D1', 'category': 'place'}],
                'adjectives': [{'kr': '\uCEE4\uC694', 'compatibleSubjects': ['place']}], 'adverbs': []}}
        groups = g.text_groups(data)
        self.assertIn('\uC800\uB294 \uBB3C\uC744 \uB9C8\uC154\uC694', groups['action_sentences'])
        self.assertIn('\uC800\uB294 \uBB34\uC5C7\uC744 \uB9C8\uC154\uC694?', groups['action_sentences'])
        self.assertIn('\uC9D1\uC774 \uCEE4\uC694', groups['describe_sentences'])


if __name__ == '__main__':
    unittest.main()
