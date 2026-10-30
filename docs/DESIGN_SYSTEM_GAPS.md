# CleepDesktop design system gaps (POC)

After copying Cleep’s Angular `config-*` / `cl-icon` framework into Desktop and migrating pages that fit, these items remain Desktop-specific or incomplete.

## No framework equivalent (stay custom)

| Area | Why |
|------|-----|
| Left shell (`index.html`) | Nav toolbar, devices list, bus status — Desktop chrome, not a config page |
| Device webview host | Embeds remote device UI; not a form/list layout |
| Monitoring event feed | Streaming message log UX |
| Flash / install live log (`taskspanel`) | Streaming progress outside `config-progress` |
| Device sign-in card | Distinctive centered auth card; `config-*` row layout would break the branded form |
| Vault recovery-codes one-shot UI | Large monospace textarea + “shown once” flow kept as custom markup (also in preferences) |
| Device-error illustration | Hero image has no `config-*` media pattern (framework’s `cl-app-img` was not copied) |
| Device-details board tab image | Board photo gallery; no framework media component |
| Help screenshots | Inline panel screenshots inside section bodies |
| Changelog dialog | Markdown/HTML viewer for app changelog |

Picker dialogs (ISO / drive / wifi) use `config-section` / `config-button` / `config-select` / `config-text` / `config-note` for chrome; selection UX is still “pick a row / fill fields,” not a dedicated picker widget.

## Intentional forks

- **`clIcon`**: Desktop uses `md-svg-icon` + `fonts/mdi.svg` instead of Cleep’s MDI webfont. Same `cl-icon` attribute API; rendering differs.
- **Not copied from Cleep**: widgets, `clAppUpload` / `clAppFab` / `clAppImg`, brand font, dashboard.
- **`config-tabs` URL sync**: still writes `?tab=` via `$location`; acceptable under ui-router hash for this POC. Prefer visual-only tabs later if query noise is an issue.
- **Share model**: one-shot copy; divergences fixed by hand until a shared Vue package exists.

## Suggested next Vue candidates

1. **Preferences** — richest `config-tabs` + vault/network/cache coverage; best validation of a shared component set.
2. **Install auto** — preparation rows + progress; exercises buttons/select/progress.
3. **Updates** — version rows + download progress.
4. Shell / devices panel / webview / monitoring — Desktop-only; keep out of the shared kit until patterns stabilize.
