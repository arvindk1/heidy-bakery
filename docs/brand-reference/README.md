# Brand references

These images document the bakery identity and icon artwork. They are not bundled in the application.

The production icon is `HeidyBakery/Resources/AppIcon.icns`, referenced by `CFBundleIconFile`. This repository uses a shell-built Cocoa bundle, not an Xcode asset catalog. Source PNGs live in `assets/brand/`; regenerate using the root `build-icns.sh`.

`superseded/AppIcon-opaque-do-not-use.png` preserves the old opaque image for provenance only. Never use it as a runtime icon. The root `AppIcon.iconset.zip` was pre-existing untracked user content and was left untouched.
