# Jack Korean Review

Faithful copy of g4jy/korean-practice-miyahh at d778c1928736947766b1559aed8f243a1cb6c07d, with Jack’s reviewed Chapter 3–4 content and teacher-requested activity vocabulary.

- 117 words and 5 particle-pattern cards; present-polite forms supplied by the reviewed lesson
- Original flashcard, vocabulary, study, quiz, sentence-builder, audio fallback, export/import and local progress behavior retained
- All localStorage and IndexedDB names isolated for Jack
- Sentence builders use only studied vocabulary, present tense and 오늘. No new past/future or degree-adverb content is introduced
- Explicit Submit, durable pending copies, and results CSV are available in all five study entry pages; network delivery is disabled until the teacher receiver is restored and tested
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


## Teacher submissions

Submit on Home, My Vocabulary, Flashcards, Word Memorizer, and Quiz saves new learner-reviewed results into the Jack-only local progress database. This currently **does not send to the teacher**: the existing shared receiver requires access, so `js/submission-config.js` has `enabled: false` and no endpoint. Download results CSV is the available manual delivery route. No other learner app or receiver permissions were changed.

The payload is an allowlist of the latest actual learner answer for each reviewed card: stable card/response ID, status (`known`, `unknown`, or `unsure`), review time, study mode, Korean, and English. Teacher lesson observations, raw history, backup data, private source URLs, device identifiers, and user-agent data are excluded. This app does not assess both recall directions separately, so it never claims bidirectional mastery. Existing local study progress remains unchanged.

Repeated clicks/reloads reuse durable queue records; new responses create delta batches of up to 40 rows. A readable response confirms receipt only when `ok`, `submissionId`, and `rowCount` match. Opaque responses, timeouts, or network failures remain unconfirmed with the original IDs and contents. Retry is exposed only after the receiver is separately verified to support idempotency. Merely supplying an endpoint cannot guarantee server-side deduplication. The existing receiver must gain verified deduplication before enabling that option. There is no automatic background upload.

To activate: verify the teacher owns the receiver and private destination, restore the approved deployment access, run a clearly synthetic QA submission, verify the exact ID/row in the private teacher sheet, then configure the working HTTPS `/exec` URL. Keep private spreadsheet links and real learner results out of this repository. Do not treat a `no-cors` response as a receipt.

Checks: `node tests/submissions.cjs` covers queue persistence, delta deduplication, request races, privacy allowlists, offline and uncertain delivery, receipt validation, and safe CSV. A real end-to-end receipt has not been tested because the receiver denies access.
