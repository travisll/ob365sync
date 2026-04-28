# Contributing

Thanks for contributing to `ob365sync`.

## Development

```bash
npm install
npm test
npm run build
```

## Local Obsidian Testing

Build the plugin and copy these files into your vault plugin folder:

- `manifest.json`
- `main.js`
- `styles.css`

Target folder:

```text
<vault>/.obsidian/plugins/office365-calendar-sync/
```

## Release Process

1. Update code and docs.
2. Bump the version in `manifest.json` and `package.json`.
3. Run:

```bash
npm test
npm run release
```

4. Create a GitHub release and attach:

- `manifest.json`
- `main.js`
- `styles.css`

The workflow in `.github/workflows/release.yml` can also package these artifacts automatically on tags.
