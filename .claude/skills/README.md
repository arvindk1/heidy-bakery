# Third-party skills installed for this project

Pulled in to complement `HeidyBakery` (native Swift/WKWebView macOS app) and any
future SwiftUI work. Not written by Claude — vendored from these sources:

- `swiftui-pro/` — twostraws/SwiftUI-Agent-Skill (Paul Hudson) — common LLM
  mistakes in SwiftUI (accessibility, deprecated APIs, animation/state pitfalls)
  https://github.com/twostraws/SwiftUI-Agent-Skill
- `apple-swiftui/` — vabole/apple-skills, `skills/swiftui` — general SwiftUI
  framework reference (state, navigation, Charts, Liquid Glass)
- `apple-macos-packaging/` — vabole/apple-skills, `skills/guide-macos-spm-packaging`
  — macOS app packaging/signing/notarizing guidance, directly relevant to
  `HeidyBakery/build.sh` / `RELEASE.md`
- `apple-swift-testing/` — vabole/apple-skills, `skills/guide-swift-testing`
  — Swift Testing framework guidance

apple-skills source: https://github.com/vabole/apple-skills — check each
skill's own LICENSE file before redistributing further.

Re-sync by re-cloning the source repos; these are point-in-time copies.
