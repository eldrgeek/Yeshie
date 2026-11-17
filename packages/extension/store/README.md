# Publishing Yeshie to the Chrome Web Store

_Written 2026-11-17 by Claude Opus 5.5 for Mike Wolf. Mike owns the SoMA Studios publisher account; everything before the final Submit can be done by an AI in his Chrome._

| File | What it is |
| --- | --- |
| `LISTING.md` | Every dashboard field, with the exact text to paste |
| `PRIVACY.md` | The privacy policy the listing links to |
| `REVIEW-2026-11-17.md` | The code review behind the 1.0.0 cleanup, and open follow-ups |
| `assets/` | Store icon, two 1280×800 screenshots, 440×280 promo tile |
| `icon.svg` | Source for the icons in `../public/icon/` |
| `../CHANGELOG.md` | One line per zip sent to the store |

## Make the zip

```bash
cd packages/extension
npm ci
npm run zip:store      # → .output/yeshie-extension-<version>-chrome.zip
```

The store flavor ignores `.env`, has no hot reload and no SOMA admin script, and the build stops with "Store build refused" if anything personal would ship. For a new version: bump `version` in `package.json`, add a `CHANGELOG.md` line, run `npm test` from the repo root, then zip.

## Submit (first time)

1. Open the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole), signed in as the SoMA Studios publisher.
2. **Items → + New item**, choose the zip, **Upload**.
3. **Store listing**: paste from `LISTING.md`, upload the icon, both screenshots and the small promo tile. **Save draft**.
4. **Privacy practices**: paste the single purpose, each permission justification, answer remote code **No**, tick the four data types, tick the three certifications, paste the privacy policy URL. **Save draft**.
5. **Distribution**: Free, **Unlisted**, all regions. **Save draft**.
6. **Test instructions**: paste the reviewer steps. **Save draft**.
7. **Submit for review**. Leave "Publish automatically after review" on. Expect an in-depth review of several days because of `debugger` and access to all sites.

## Submit an update

Dashboard → Yeshie → **Package → Upload new package**, choose the new zip, adjust any listing text that changed, **Submit for review**. Record the date in `CHANGELOG.md`.
