# Release Checklist

Use this checklist before publishing a new plugin release.

## Versioning

- Update `manifest.json` version
- Update `package.json` version
- Run `npm run version` if you want `versions.json` refreshed automatically
- Add a new entry to `CHANGELOG.md`

## Verification

- Run `npm install` if dependencies changed
- Run `npm test`
- Run `npm run build`
- Run `npm run release`
- Confirm the release bundle exists in `dist/`

## Obsidian Validation

- Install the latest build into a real test vault
- Confirm the plugin enables successfully
- Confirm settings load without errors
- Confirm sync commands appear in the command palette
- Confirm the sidebar opens and edits note metadata correctly
- Confirm recurrence editing still works
- Confirm remote sync still works against a test Office 365 calendar

## GitHub Release

- Commit all release-related changes
- Push the release commit to `main`
- Create and push a git tag for the release version
- Verify the GitHub Actions release workflow completes successfully
- Verify the GitHub release includes:
  - `manifest.json`
  - `main.js`
  - `styles.css`
  - the generated `.zip` artifact

## Post-Release

- Confirm the release notes are readable and accurate
- Confirm the repository `README.md` still matches current functionality
- If submitting to the Obsidian community plugin list, confirm submission-specific requirements are met
