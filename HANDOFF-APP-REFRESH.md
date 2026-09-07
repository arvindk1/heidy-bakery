# Handoff: App Refresh (Visual + Navigation) + Brand Assets

Status: Plan reviewed, brand assets prepared. No app code changed. This is a
handoff for Codex to plan and implement.

Full plan: [`APP-REFRESH-PLAN.md`](./APP-REFRESH-PLAN.md) (in this directory).

---

## 1. Plan feedback

The plan is well-scoped and safe to build from as-is. Two things worth
resolving before or during implementation, not blockers:

- **Contrast targets are qualitative** ("sufficient contrast," "readable
  contrast"). Use WCAG AA quantitatively: 4.5:1 for body text, 3:1 for large
  text / UI components / focus indicators, in both light and dark mode. Check
  this for every new color pairing introduced, not just the ones that look
  borderline.
- **Window-size breakpoints are unspecified** ("narrower window sizes",
  "collapse when content needs more width"). Pick actual pixel thresholds
  before writing layout CSS — this is a real resizable WKWebView window, not
  a responsive marketing site with unlimited breakpoints to choose from.

Everything else in the plan (functionality-protection invariants, the
six-destination navigation order, the explicit refusal to invent an "overall
bakery margin" metric, the incremental delivery sequence) is sound and
should be followed as written.

## 2. Brand assets — what's usable and where

All files below are at the root of `~/devl/heidy` (not yet moved into
`HeidyBakery/`).

| File | Status | Use it for |
|---|---|---|
| `AppIcon.icns` | **Fixed — usable now** | Wire into `Assets.xcassets/AppIcon.appiconset` / `Info.plist`. See note below — the original version had a real defect that's now corrected in this file. |
| `AppIcon.iconset/` (10 PNGs, 16px–1024px) | Usable now | Same content as the `.icns`, unpacked, in case the build needs individual sizes. |
| `AppIcon-transparent.png` (1024×1024) | Usable now | Master source image — properly alpha-masked, transparent outside the rounded-square shape. Use this as the source of truth if the iconset needs regenerating later. |
| `AppIcon.png` (1024×1024) | **Do not use as-is** | Flat opaque JPEG-derived PNG, no transparency — same defect as the old `.icns`. Superseded by `AppIcon-transparent.png`. Safe to delete once the new files are confirmed working. |
| `AppLogo-DockIcon.jpg` | Reference only | Same artwork as the icon; JPEG has no alpha channel so it can't be used as the actual app icon. Useful as a visual reference for the 3D style if you want to extend it to other assets. |
| `AppLogo-BrandMockup.jpg` | Marketing use only, not the app icon | Includes the wordmark ("the little dot — tea & bakery") baked into the image. App icons should stay graphic-only per Apple HIG — text becomes unreadable at 16×16 and 32×32. Fine for a README banner or a splash/about screen if one gets added, not for `AppIcon.appiconset`. |
| `IMG_1390.jpg` | Source reference | The original flat brand-mark photo the palette below was sampled from. Keep for reference; not used directly in the app. |
| `build-icns.sh` | Tooling reference | One-line `iconutil` command to regenerate `AppIcon.icns` from `AppIcon.iconset/` if the source art changes later. Must be run in a real macOS Terminal — `iconutil` isn't available in a sandboxed shell. |

**Note on the icon fix:** the original `AppIcon.png` and `AppIcon.icns` had a
fully opaque background baked in (verified by direct pixel inspection —
alpha channel absent or 255 at every corner), which would have rendered as a
visible white/cream square block behind the icon in the Dock and Finder
instead of a floating rounded shape. The current `AppIcon.icns` in this
directory has been rebuilt with a proper alpha-masked rounded-square
(squircle) shape and verified transparent at the corners. It's ready to
wire in directly.

## 3. Confirmed brand palette

Sampled directly from pixel data in the flat source logo (`IMG_1390.jpg`),
not the 3D-rendered icon — glossy shading in the rendered icon skews hues
lighter/warmer under highlight, so it isn't a reliable palette source.

| Role | Hex | Notes |
|---|---|---|
| Deep caramel | `#A08050` | Dark downward-triangle mark; candidate for the plan's "restrained caramel action color" |
| Warm tan | `#A89068` | Middle triangle mark |
| Olive / sage | `#B0B078` | The "D" mark; candidate for the plan's sparing olive/sage accent |
| Pale sage dot | `#D8D8A8` | The small dot mark; too light for text/icon use at AA contrast on a light canvas — status-accent only, paired with text or an icon per the plan's own guidance |
| Wordmark brown | `#908060` | Close to deep caramel but distinct; likely redundant with it in a UI palette — pick one as the primary accent rather than carrying both |
| Warm porcelain canvas | `#FAF6EE` | Not sampled from the logo — matches the plan's own "warm porcelain canvas" description; verify against the plan author's intent before locking it in |

Every functional color pairing built from this palette (text on porcelain,
badges/status colors on their backgrounds, focus rings) needs its own AA
contrast check per §1 above — none of these values are pre-verified against
any specific background yet.

## 4. What to do with this

1. Read `APP-REFRESH-PLAN.md` in full — it's the actual scope document.
2. Follow the plan's own delivery sequence (baseline → visual foundation →
   screen layouts → navigation behavior → verification → handoff), starting
   with inspecting the running app and recording baseline screenshots, per
   plan §"Delivery sequence" step 1.
3. Wire `AppIcon.icns` into the Xcode project's asset catalog and verify it
   renders correctly (no white box) in both the Dock and Finder, at multiple
   sizes, in both system appearances.
4. Build the visual foundation (typography, spacing, the palette in §3 above
   with contrast verified per §1) before touching individual screens.
5. Run all three existing test suites (`model.test.cjs`, `regression.test.cjs`,
   `margin-watch.test.cjs`) after every increment — visual changes must not
   regress the costing invariants described in the plan's "Functionality
   protection" section.
6. Once done, clean up the unused asset files noted "Do not use" / "Reference
   only" in §2 above so they don't linger as ambiguous artifacts in the repo.
