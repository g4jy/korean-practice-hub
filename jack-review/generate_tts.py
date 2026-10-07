"""Exact-text Edge TTS: offline audit by default; generation is explicitly allowlisted.

--generate --approved-texts PATH requires {"reviewed_public": true,
"vocab_sha256": "...", "texts": ["exact public vocabulary", ...]}.
Explicit "scope": "static" also allows reviewed static builder blocks, never sentences.
Never supply learner exports, private examples, evidence or history.
Existing legacy files are preserved, not certified by this generator's existence.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import itertools
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

BASE_DIR = Path(__file__).resolve().parent
VOCAB_PATH = BASE_DIR / "data" / "vocab.json"
AUDIO_DIR = BASE_DIR / "audio" / "tts"
BACKUP_DIR = Path(os.environ.get('KOREAN_TTS_BACKUP_DIR', Path.home() / '.codex' / 'backups' / 'jack-audio-manifests'))
VOICE, RATE, VOLUME, PITCH = "ko-KR-SunHiNeural", "+0%", "+0%", "+0Hz"


def digest(value):
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def request_key(text):
    return digest(json.dumps(["edge-tts", VOICE, RATE, VOLUME, PITCH, text],
                             ensure_ascii=False, separators=(",", ":")))


def particle(word, final, open_):
    code = ord(word[-1]) if word else 0
    return final if 0xAC00 <= code <= 0xD7A3 and (code - 0xAC00) % 28 else open_


def text_groups(data):
    """Mirror builder outputs for coverage only; enumeration is not send approval."""
    groups = {"static": set(), "action_sentences": set(), "describe_sentences": set()}
    static = groups["static"]

    def walk(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in ("kr", "polite", "present", "past", "future") and isinstance(item, str) and item:
                    static.add(item)
                elif key not in ("examples", "evidence", "history") and isinstance(item, (dict, list)):
                    walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    for section in ("action", "describe", "flashcards", "intro"):
        walk(data.get(section, {}))
    action = data.get("action", {})
    times = [None] + action.get("times", [])
    for verb in action.get("verbs", []):
        compat = [o for o in action.get("objects", []) if
                  (o["kr"] + particle(o["kr"], "\uC744", "\uB97C") in verb["compatibleObjects"]
                   if verb.get("compatibleObjects") else o.get("category") in verb.get("objectTypes", []))]
        objects = [""] + [o["kr"] + particle(o["kr"], "\uC744", "\uB97C") for o in compat]
        place_key = "formE" if verb.get("placeParticle") == "e" else "formEseo"
        places = [""] + [p[place_key]["kr"] for p in action.get("places", []) if p.get(place_key)]
        static.update(objects[1:])
        for subject, time, place, obj in itertools.product(action.get("subjects", []), times, places, objects):
            ending = verb.get((time.get("tense") or "present") if time else "present")
            if ending:
                groups["action_sentences"].add(" ".join(x for x in
                    [subject["kr"], time["kr"] if time else "", place, obj, ending] if x))
        # Question mode hides time/place but keeps the selected tense.
        if compat:
            static.add("\uBB34\uC5C7\uC744")
            for subject, time in itertools.product(action.get("subjects", []), times):
                ending = verb.get((time.get("tense") or "present") if time else "present")
                if ending:
                    groups["action_sentences"].add(subject["kr"] + " \uBB34\uC5C7\uC744 " + ending + "?")
    desc = data.get("describe", {})
    for adj in desc.get("adjectives", []):
        for subject in desc.get("subjects", []):
            if subject.get("category") not in adj.get("compatibleSubjects", []):
                continue
            full_subject = subject["kr"] + particle(subject["kr"], "\uC774", "\uAC00")
            static.add(full_subject)
            for adv in [""] + [a["kr"] for a in desc.get("adverbs", [])]:
                groups["describe_sentences"].add(" ".join(x for x in [full_subject, adv, adj["kr"]] if x))
    return groups


def extract_all_texts(data):
    return sorted(set().union(*text_groups(data).values()))


def required_card_texts(data):
    return {card[key] for category in data.get('flashcards', {}).get('categories', [])
            for card in category.get('cards', []) for key in ('kr', 'polite') if card.get(key)}


def manifest_at(directory):
    path = directory / "manifest.json"
    raw = path.read_bytes() if path.exists() else None
    value = json.loads(raw.decode("utf-8-sig")) if raw else {}
    if value.get("schema_version") == 2:
        if not isinstance(value.get("entries"), dict) or not isinstance(value.get("legacy_entries", {}), dict):
            raise ValueError("Invalid manifest")
        return value, raw
    if any(not isinstance(v, str) for v in value.values()):
        raise ValueError("Unknown manifest schema; refusing migration")
    return {"schema_version": 2, "entries": {}, "legacy_entries": value}, raw


def valid_mp3(data):
    return len(data) > 128 and (data[:3] == b"ID3" or (data[0] == 0xFF and data[1] & 0xE0 == 0xE0))


def verify_entry(text, entry, directory):
    try:
        key = request_key(text)
        expected = {"text": text, "text_sha256": digest(text), "request_sha256": key,
                    "receipt": key + ".provenance.json"}
        if any(entry.get(k) != v for k, v in expected.items()):
            return False
        if not re.fullmatch(r'[a-zA-Z0-9_-]+\.mp3', entry.get('file', '')):
            return False
        proof_bytes = (directory / entry["receipt"]).read_bytes()
        if digest(proof_bytes) != entry["receipt_sha256"]:
            return False
        proof = json.loads(proof_bytes)
        if any(proof.get(k) != entry[k] for k in ("text", "text_sha256", "request_sha256", "file", "audio_sha256")):
            return False
        required = {"schema_version": 1, "provider": "edge-tts", "voice": VOICE, "rate": RATE,
                    "volume": VOLUME, "pitch": PITCH, "reviewed_public": True}
        if any(proof.get(k) != v for k, v in required.items()):
            return False
        if not re.fullmatch("[a-f0-9]{64}", proof.get("generator_sha256", "")):
            return False
        if proof.get('source_kind') == 'repository_lineage':
            if (not re.fullmatch('[a-f0-9]{40}', proof.get('source_commit', ''))
                    or proof.get('original_audio_sha256') != entry['audio_sha256']
                    or proof.get('original_text') != text or proof.get('original_file') != entry['file']
                    or not re.fullmatch('[a-f0-9]{64}', proof.get('source_manifest_sha256', ''))
                    or not proof.get('duration_seconds', 0) > 0):
                return False
        elif (proof.get('source_kind') != 'edge_generation' or entry['file'] != key + '.mp3'
              or not proof.get('client_version') or not proof.get('generated_at')):
            return False
        audio = (directory / entry["file"]).read_bytes()
        return valid_mp3(audio) and digest(audio) == entry["audio_sha256"]
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False


def audit(data, directory):
    manifest, _ = manifest_at(directory)
    groups = text_groups(data)
    verified = {t for t, e in manifest["entries"].items() if verify_entry(t, e, directory)}
    coverage = {name: {"total": len(texts), "verified": len(texts & verified),
                       "unavailable": len(texts - verified)} for name, texts in groups.items()}
    all_texts = set().union(*groups.values())
    required = required_card_texts(data)
    legacy = []
    for text, name in manifest.get("legacy_entries", {}).items():
        safe = isinstance(name, str) and bool(re.fullmatch(r"[a-zA-Z0-9_-]+\.mp3", name))
        path = directory / name if safe else None
        blob = path.read_bytes() if path and path.is_file() else b""
        legacy.append({"text_sha256": digest(text), "file": name, "exists": bool(blob),
                       "audio_sha256": digest(blob) if blob else None, "mp3_signature": valid_mp3(blob),
                       "filename_text_hint_matches": safe and name.endswith("_" + hashlib.md5(text.encode("utf-8")).hexdigest()[:6] + ".mp3"),
                       "legacy_snapshot_evidence": "text_filename_mapping_only",
                       "current_entry_verified": text in verified,
                       "provenance": read_json(directory / manifest['entries'][text]['receipt'])['source_kind'] if text in verified else "unverified"})
    return {"coverage": coverage, "all_unique_texts": len(all_texts),
            "verified_exact_texts": len(all_texts & verified),
            "required_cards_polite": len(required), "missing_required_words": sorted(required - verified),
            "invalid_manifest_entries": sorted(digest(t) for t in manifest["entries"] if t not in verified),
            "legacy_files": legacy,
            "dynamic_policy": "Exact whole sentence or explicit unavailable; never word splicing.",
            "user_words": "Local user words are never uploaded; exact missing audio is unavailable.",
            "provenance_limit": "Receipts record observed generation and hashes, not provider-signed attestation."}


_remote_baseline = None
_remote_revision = None


def checked_remote():
    """Pin owned paths, so unrelated remote commits do not interrupt audio work."""
    global _remote_baseline, _remote_revision
    def git(*args):
        return subprocess.check_output(["git", "-C", str(BASE_DIR), *args], encoding='utf-8', timeout=30).strip()
    paths = ['jack-review/js/common.js', 'jack-review/generate_tts.py', 'jack-review/audio/tts',
             'jack-review/tests/audio-generator.py', 'jack-review/tests/audio-playback.cjs']
    # ls-tree must run from the repository root for repository-relative paths.
    repo = git('rev-parse', '--show-toplevel')
    def fingerprint(revision):
        return digest(subprocess.check_output(['git', '-C', repo, 'ls-tree', revision, '--', *paths]))
    if _remote_baseline is None:
        _remote_baseline = fingerprint('HEAD')
    remote = git("ls-remote", "origin", "refs/heads/main").split()[0]
    if remote != _remote_revision:
        try:
            candidate = fingerprint(remote)
        except subprocess.CalledProcessError:
            git('fetch', '--no-tags', 'origin', 'main')
            candidate = fingerprint(remote)
        if candidate != _remote_baseline:
            raise RuntimeError(f'Remote audio paths changed at {remote}; notify main')
        _remote_revision = remote
    return _remote_baseline


def publish_new(path, content):
    # Exclusive creation preserves evidence even if another task races this process.
    with path.open("xb") as stream:
        stream.write(content)


def save_manifest(directory, manifest, original):
    path = directory / "manifest.json"
    if (path.read_bytes() if path.exists() else None) != original:
        raise RuntimeError("Manifest changed concurrently; notify main")
    if original is not None and json.loads(original.decode('utf-8-sig')).get('schema_version') != 2:
        backup = BACKUP_DIR.resolve()
        if backup.is_relative_to(BASE_DIR.parent.resolve()):
            raise ValueError('Manifest backups must remain outside the public repository')
        backup.mkdir(parents=True, exist_ok=True)
        snapshot = backup / ("manifest-" + digest(original) + ".snapshot.json")
        if not snapshot.exists():
            publish_new(snapshot, original)
    content = json_bytes(manifest)
    with tempfile.NamedTemporaryFile(dir=directory, delete=False, suffix=".tmp") as stream:
        stream.write(content)
        temp = Path(stream.name)
    try:
        if (path.read_bytes() if path.exists() else None) != original:
            raise RuntimeError("Manifest changed concurrently; notify main")
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)
    return content


async def generate_approved(data, directory, approval, remote_check=checked_remote, vocab_bytes=None):
    if approval.get("reviewed_public") is not True or not isinstance(approval.get("texts"), list):
        raise ValueError("An explicit reviewed-public text allowlist is required")
    if vocab_bytes is None:
        vocab_bytes = VOCAB_PATH.read_bytes()
    if approval.get("vocab_sha256") != digest(vocab_bytes):
        raise ValueError("Vocabulary changed since approval; notify main")
    texts = approval["texts"]
    if any(not isinstance(t, str) or not t for t in texts):
        raise ValueError("Approval must contain nonempty exact strings")
    # Generation is intentionally bounded to generic vocabulary, not examples or combinations.
    scope = approval.get('scope', 'cards')
    if scope not in ('cards', 'static'):
        raise ValueError('Only cards or explicitly reviewed static scope is permitted')
    allowed = text_groups(data)['static'] if scope == 'static' else required_card_texts(data)
    if not set(texts) <= allowed:
        raise ValueError("Approval contains text outside public vocabulary")
    baseline = remote_check()
    directory.mkdir(parents=True, exist_ok=True)
    lock = directory / ".generation.lock"
    with lock.open("x") as stream:
        stream.write(str(os.getpid()))
    try:
        manifest, original = manifest_at(directory)
        result = {"generated": 0, "reused": 0, "blocked_unverified": 0}
        for text in sorted(set(texts)):
            key = request_key(text)
            existing = manifest["entries"].get(text)
            if existing and verify_entry(text, existing, directory):
                result["reused"] += 1
                continue
            if existing or text in manifest.get("legacy_entries", {}) or (directory / (key + ".mp3")).exists() or (directory / (key + ".provenance.json")).exists():
                result["blocked_unverified"] += 1
                continue
            if remote_check() != baseline:
                raise RuntimeError("Remote audio paths advanced during generation; notify main")
            import edge_tts
            audio = bytearray()
            boundaries = []
            client = edge_tts.Communicate(text=text, voice=VOICE, rate=RATE, volume=VOLUME, pitch=PITCH)
            async for chunk in client.stream():
                if chunk["type"] == "audio":
                    audio.extend(chunk["data"])
                elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                    boundaries.append(chunk)
            if not valid_mp3(audio):
                raise ValueError("Edge returned no valid MP3; no manifest entry written")
            if remote_check() != baseline:
                raise RuntimeError("Remote advanced; generated bytes discarded, notify main")
            entry = {"text": text, "text_sha256": digest(text), "request_sha256": key,
                     "file": key + ".mp3", "audio_sha256": digest(audio), "receipt": key + ".provenance.json"}
            proof = {k: v for k, v in entry.items() if k != "receipt"}
            proof.update(schema_version=1, source_kind='edge_generation', provider="edge-tts", voice=VOICE, rate=RATE, volume=VOLUME,
                         pitch=PITCH, reviewed_public=True, client_version=importlib.metadata.version("edge-tts"),
                         generated_at=datetime.now(timezone.utc).isoformat(), generator_sha256=digest(Path(__file__).read_bytes()),
                         vocab_sha256=approval["vocab_sha256"], approval_scope=scope, boundaries=boundaries)
            proof_bytes = json_bytes(proof)
            entry["receipt_sha256"] = digest(proof_bytes)
            publish_new(directory / entry["file"], audio)
            publish_new(directory / entry["receipt"], proof_bytes)
            manifest["entries"][text] = entry
            original = save_manifest(directory, manifest, original)
            result["generated"] += 1
        return result
    finally:
        lock.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate", action="store_true")
    parser.add_argument("--approved-texts", type=Path)
    args = parser.parse_args()
    vocab_bytes = VOCAB_PATH.read_bytes()
    data = json.loads(vocab_bytes.decode("utf-8-sig"))
    if args.generate:
        if not args.approved_texts:
            parser.error("--generate requires --approved-texts reviewed by main")
        print(json.dumps(asyncio.run(generate_approved(data, AUDIO_DIR, read_json(args.approved_texts),
                                                       vocab_bytes=vocab_bytes)), indent=2))
    print(json.dumps(audit(data, AUDIO_DIR), ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()

