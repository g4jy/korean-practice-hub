# Alice Korean Review

A dedicated review app using sanitized educational content from the complete available lesson archive. Private transcripts, source links, lesson dates, and learner assessments are not published.

## Content and practice

- 655 vocabulary/expression sense entries become 662 individually playable word/form cards
- 161 pattern and usage cards, including grammar, contrasts, and practical usage notes; these are not claimed to be 161 distinct grammar rules
- 156 additional example-sentence cards, for 818 review cards in total
- Three sets of 20 Korean speaking-review questions
- Vocabulary, Study, Quiz, Flashcards, and Word Memorizer share one local progress store
- Action and Describe builders use a focused, curriculum-backed set of words. Action practice has direct subject, verb, place, and object selectors, with 2–3 noun choices for each transitive verb; the complete vocabulary remains available in My Vocabulary
- Dictionary and polite-form playback are separate where needed. Notation alternatives have individual audio buttons rather than slash speech
- Romanization is an optional reading aid where reviewed data is available; pronunciation is provided by Edge recordings

## Audio boundary

Only exact, verified Edge TTS recordings are played. JSON storage packs preserve the original MP3 and provenance bytes; pack and individual file SHA-256 values are checked before playback. A small schema-3 manifest index loads six metadata parts, checking each part checksum and the complete reconstructed entry set before enabling playback. The requested voice is `ko-KR-SunHiNeural` with default rate, volume, and pitch. No device speech or word-spliced sentence fallback exists. Every selectable built-in word, form, question, example, and builder sentence is enumerated by the tests. Added private words remain local and require an exact recording before they can be played.

## Local privacy and submissions

The app has its own `alice-review` localStorage keys and `alice-review-korean` IndexedDB database. Progress is kept on the current device. Other learner apps are not read or changed.

Submit creates a durable pending local copy. Teacher delivery is not connected. The CSV download is the manual sharing route; downloading does not send anything. The configuration intentionally has no receiver URL. Repeated Submit clicks do not duplicate an unchanged result.

## Lesson updates and backup

Use **Lesson updates & backup** to preview and import a reviewed private lesson package on each study device. No lesson file, history, or observation is uploaded. Packages must use:

- `schema`: `korean-lesson-update/v1`
- `app`: `alice-review-korean`
- `learnerId`: `alice-b`
- A stable `lessonId`, positive integer `revision`, timezone-qualified `documentedAt`
- `vocabulary`: objects with `id`, `kr`, `en`, and optional `rom`, `polite`, `category`
- `observations`: stable `id`, `observedForm`, explicit `status` (`unsure` or `dont_know`), `observedAt`, and optional exact `wordId`

An unresolved form never changes a word by inferred meaning. Newer study answers are protected from older observations. Same-revision conflicts, another learner's package, and incompatible word identities are rejected. Backups merge without deleting newer progress. Reset clears active ratings but preserves history and imported lesson markers.

Do not publish real lesson packages, learner performance, backups, private source URLs, credentials, or receiver configuration in this public repository.

## Verification

Run from this folder:

- `node tests/run.cjs`: syntax, content, isolation, exhaustive builder states, lesson ingestion, chronology, submissions, CSV and vocabulary states
- `node tests/audio-coverage.cjs`: exact built-in audio coverage, SHA-256 integrity and Edge provenance
- `node tests/vocabulary-browser.cjs`: synthetic responsive UI, progress, repeated clicks and navigation checks when a supported Chromium browser is available

The audio-coverage check requires the complete audio directory. A passing offline test suite does not substitute for browser/audio verification.

## Run the downloaded copy

Extract the ZIP. This app loads JSON and audio with browser fetch, so opening an HTML file directly with a double-click is not a supported way to run it.

With Python 3 installed, open a terminal in the folder that contains `alice-review` and run:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/alice-review/` in a browser. Leave that terminal running while you study. The app needs no build step or account. Local progress belongs to that browser and origin; use Lesson updates & backup before moving to another device or host.

For hosting, serve the complete `alice-review` folder, including all files in `audio/tts`, from a static HTTPS web server. Preserve file names and bytes, especially the audio packs and manifest. The ZIP is a private downloadable copy; creating it does not publish a website. Public deployment is a separate step.
