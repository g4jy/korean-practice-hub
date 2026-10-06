# Jack Korean Review

Faithful copy of g4jy/korean-practice-miyahh at d778c1928736947766b1559aed8f243a1cb6c07d, with Jack’s reviewed Chapter 3–4 content and teacher-requested activity vocabulary.

- 117 words and 5 particle-pattern cards; present-polite forms supplied by the reviewed lesson
- Original flashcard, vocabulary, study, quiz, sentence-builder, audio fallback, export/import and local progress behavior retained
- All localStorage and IndexedDB names isolated for Jack
- Sentence builders use only studied vocabulary, present tense and 오늘. No new past/future or degree-adverb content is introduced
- Teacher response sync is disabled pending verification of the collector; local response history and export remain available
- No other learner records, lesson backup, private source links or credentials are included
- Romanization is a reading aid, generated/reviewed separately from source lesson wording

## Lesson updates (local-only)

Open **Lesson updates & backup** and select a reviewed lesson JSON file. The preview shows new cards, explicit review-status changes, protected newer study answers, and forms needing teacher clarification. Apply once on each study device. No file, observation or progress is uploaded. Automatic delivery across devices is not connected.

Words, Study, Quiz, Flashcards, Word Memorizer and the standalone Quiz now use one card pool and one versioned local progress store. Existing Jack local data is migrated without deleting legacy storage or response history. The backup exports both study history and consumed lesson revisions. Older backups do not replace newer ratings. Reset keeps history, lesson markers and added cards while clearing active ratings.

### Reviewed package contract

The JSON object accepts only these fields:

- `schema`: `korean-lesson-update/v1`
- `app`: `jack-review-korean`
- `learnerId`: `jack`
- `lessonId`: stable opaque string; do not include a transcript or private document URL
- `revision`: positive integer, increased when documented content changes
- `documentedAt`: ISO timestamp with time zone
- `vocabulary`: objects with `id`, `kr`, `en`, and optional `rom`, `polite`, `category`
- `observations`: objects with stable `id`, `observedForm`, `status` (`unsure` or `dont_know`), `observedAt`, and an optional exact `wordId`

Base card IDs are `ko:` plus the URL-encoded, NFC-normalized Korean form. An explicit unique sense ID can represent a homograph; matching is by ID, never by inferred conjugation or English meaning. Omit `wordId` when the meaning is unclear. A later revision can resolve that observation with its original ID and timestamp. Already resolved observations cannot be retargeted, and a new classroom observation needs a new ID. An unassessed or unknown producer field is not evidence of poor recall and must not be converted to a weak status.

Re-importing an identical revision is a no-op. An older revision is skipped; different contents under an already applied revision are rejected. A newer revision never replays an unchanged observation. An older observation does not override a later study answer, later lesson observation or progress reset. All overrides preserve response counters and record the previous rating in local history.

### Publication boundary

Only reviewed educational vocabulary and application code belong in this public repository. Do not commit real lesson packages, learner performance, transcripts, document links, progress exports, credentials or collector URLs. A documentation producer should create the reviewed package in private storage after its successful completion gate. Automatic private delivery requires a separately verified destination and authorization; this app does not claim to provide that connection.

### Checks

Run `node tests/lesson-updates.cjs` from this directory for synthetic ingestion, chronology, migration, and backup tests. Tests do not contain a real learner observation. Browser QA should cover repeated import, Cancel, Back, delayed responses, homographs, and all study modes.

## Subject selection

Action Sentences provides an explicit subject selector for eleven already-studied pronouns and people nouns, alongside block cycling. The What question toggle produces the bounded subject + 무엇을 + present-verb question; optional time/place selections return when leaving question mode. It is disabled for verbs without a compatible object. Describe Sentences lists the nouns compatible with the selected adjective and applies 이/가. Run `node tests/builders.cjs` for selection, particles, example-question, and phrase-audio request checks.
