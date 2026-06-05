# Chen Reading #1

This previous hub copy redirects to Chen's dedicated repository.

## Student URL

Use the dedicated GitHub Pages URL:

`https://g4jy.github.io/korean-practice-chen/`

Previous hub URL:

`https://g4jy.github.io/korean-practice-hub/chen-reading-1/`

## Local Progress

The dedicated app ships with initial word statuses in `data/app_data.js`:

- Known: 163
- Unknown: 51
- Unchecked: 416
- All: 630

When Chen marks words as Known or Unknown, the app saves those changes in the student's browser localStorage. No server-side progress database is required.

Progress stays on the same device/browser/origin. It can reset if the student clears browser storage, uses a different device/browser, uses private browsing, or the app changes its storage key/card IDs.

## Update Rule

Future GitHub updates are safe for local progress as long as:

- the deployed URL origin stays the same,
- `storageKey` in `app.js` stays the same,
- existing card IDs stay stable,
- updates add features/audio/data without replacing the stored progress schema.
