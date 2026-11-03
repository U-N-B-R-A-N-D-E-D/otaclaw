# Release checklist

Use this checklist before publishing a release.

## Pre-release

- [ ] Bump `version` in `package.json` and `CITATION.cff`
- [ ] Update `CHANGELOG.md` with the release notes
- [ ] `npm test` passes (111 tests, 6 suites)
- [ ] `npm run lint` reports 0 errors
- [ ] `npm run gateway:demo` works in a clean browser profile
- [ ] No secrets, tokens, personal paths, hostnames or LAN IPs are committed
  (`config/config.js` stays git-ignored; use `YOUR_HOST` placeholders in docs)
- [ ] All committed text is in English
- [ ] Links in `README.md` and `docs/` resolve
- [ ] `./deploy/deploy-to-openclaw.sh --local` works on a clean checkout
- [ ] Tag the release and publish the GitHub release

## Standalone

The repository is self-contained. Users need:

- Node.js 16+ (dev server / reference gateway)
- This repo cloned
- Optionally OpenClaw, or any gateway that speaks
  [docs/WEBSOCKET-PROTOCOL.md](docs/WEBSOCKET-PROTOCOL.md)

`npm run gateway:demo` is enough for a first run; no external services.

## License

MIT for the code — see [LICENSE](LICENSE). Character art is third-party and
non-commercial only — see [ASSETS.md](ASSETS.md) and [NOTICE](NOTICE).
