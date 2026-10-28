# TJ for iPhone and iPad

Open `TradingJournal.xcodeproj` in Xcode and choose the `TradingJournal` scheme.
Select an installed iPhone simulator and press Run. To install on your iPhone,
add your Apple account in Xcode Settings, choose your team in Signing & Capabilities,
connect the iPhone, and select it as the run destination. Enable Developer Mode on
the iPhone if Xcode requests it. No signing team is committed to this project.

This is a native WebKit shell for the existing journal at
https://ryryreynoso.github.io/Trading-Journal/. Website updates continue through
GitHub Pages. It requires internet to load the journal; it is not an offline native
rewrite. The app menu offers reload, Safari, and storage information.

The default persistent WebKit data store retains journal entries and screenshots
across app launches. Safari, Home Screen web apps, and this app have separate storage.
Existing Safari entries are not automatically transferred. Do not delete the Safari
journal or this app to troubleshoot storage. Deleting this app removes its local data.
Firebase is not configured in the current website, so cloud backup is not enabled.

Simulator build check:

```sh
xcodebuild -project ios/TradingJournal.xcodeproj -scheme TradingJournal \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/TJDerivedData CODE_SIGNING_ALLOWED=NO build
```
