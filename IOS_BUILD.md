# Evenit for iOS

Evenit now has a native Capacitor iOS target in `ios/App`. It uses the same
website bundle and Supabase project as Android, so profiles, plans, messages,
passes, aftermath posts, and live database updates are shared across platforms.

## Validate or run on a Mac

1. Install Node.js 24 and Xcode.
2. Run `npm ci`.
3. Run `npm run ios:open`.
4. In Xcode, select the `App` target and an iPhone simulator or registered device.
5. For a physical device or `.ipa`, select an Apple Development Team under
   Signing & Capabilities. Xcode will create or select the required provisioning
   profile for the bundle identifier `app.evenit.mobile`.

The GitHub workflow `Validate iOS app` performs an unsigned iPhone Simulator
build on macOS and publishes it as a workflow artifact. Simulator builds cannot
be installed on a normal iPhone. A device-installable `.ipa` must be signed with
an Apple Developer certificate and matching provisioning profile.

The manual `Build signed iOS IPA` workflow is ready for that final step. Add
these encrypted GitHub Actions secrets, then run the workflow with the export
method matching the provisioning profile:

- `IOS_CERTIFICATE_P12_BASE64`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `IOS_KEYCHAIN_PASSWORD`
- `APPLE_TEAM_ID`

The workflow installs the signing material only in a temporary macOS keychain,
exports `Evenit.ipa`, uploads it as a private workflow artifact, and removes the
temporary keychain even if the build fails.

## Native permissions

The project declares camera, photo library, and foreground-location usage in
`Info.plist`. These cover QR scanning, QR-image fallback, event/aftermath media,
nearby discovery, and choosing the current event location.

Run `npm run mobile:sync` after shared web changes to update both Android and iOS.
