# Release Checklist

Use this checklist before publishing OtaClaw as open source.

## Pre-Release

- [ ] Update `package.json` `repository.url`, `bugs.url`, `homepage` with final org/repo
- [ ] Review `README.md` – all `U-N-B-R-A-N-D-E-D/otaclaw` URLs point to your repo
- [x] Ensure no secrets in repo (`config/config.js` is gitignored)
- [x] No hardcoded hostnames (use `localhost` or placeholders in examples)
- [x] Run `npm run lint` and fix issues
- [x] Test `./deploy/deploy-to-openclaw.sh --local`
- [ ] Test widget: open `widget.html` in browser
- [x] Update `CHANGELOG.md` with release notes (0.0.1-beta)

## Standalone

This repo is **standalone**. It does not depend on external cluster scripts or specific hostnames.

Users only need:
- OpenClaw installed
- This repo cloned
- `./deploy/deploy-to-openclaw.sh --local` (or `--host=their-host`)

## License

MIT – see [LICENSE](LICENSE). OtaClaw is a fan-made project, not affiliated with Konami or Kojima Productions.
