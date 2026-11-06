# Good Energy | Scan the Can

The first drink that pays you to drink it.

An Android app built from the Good Energy Consumer BrandScript. Scan the can, hear the chirp, take 33% back. Connect a Solana wallet through Mobile Wallet Adapter and your wallet signs every scan claim.

**Download the APK:** [apk/good-energy-scan.apk](apk/good-energy-scan.apk) (Android 8.0 and up). It's also attached to the [latest release](../../releases/latest).

## Try it on an emulator

1. Start an Android emulator (API 26 or newer). Set a screen lock PIN, since test wallets ask for one.
2. Install a wallet that supports Mobile Wallet Adapter:
   - [Mock MWA Wallet](https://github.com/solana-mobile/mock-mwa-wallet) from Solana Mobile, made for testing, or
   - Solflare, Jupiter Mobile, or any other wallet with Mobile Wallet Adapter support.
3. Install the app:
   ```bash
   adb install apk/good-energy-scan.apk
   ```
4. Open **Good Energy** and tap **Connect wallet**. Approve in the wallet.
5. Tap **Scan the can**. The wallet asks you to sign the claim. Approve it, hear the chirp, and watch your balance go up.

To test a QR deep link:

```bash
adb shell am start -a android.intent.action.VIEW -d "goodenergy://scan?can=GE-TEST-0001"
```

## What it does

- **Mobile Wallet Adapter.** Connect, sign and disconnect with any MWA wallet on the phone. The session is saved, so the wallet stays connected the next time you open the app.
- **Signed scan claims.** With a wallet connected, every scan asks the wallet to sign a claim message (can code, wallet, cashback, time). No signature, no claim.
- **Scan the can.** Tap the big button. You hear the chirp, the logo flashes in the corner for one second, and 33% of a $2.99 can lands in your balance.
- **Codes under the tab.** Type a can code to claim it. Each code pays once.
- **QR deep links.** `goodenergy://scan?can=CODE` opens the app and claims that can.
- **Free can meter.** Shows how close you are to your next can on us.
- **Streaks.** Counts the days in a row you scanned. Drink. Scan. Earn. Repeat!
- **Played to paid.** A slider that does the cashback math for 1 to 10 cans a day. (10x a day. Literally.)
- **Public ledger.** Every claim, with the wallet and signature that signed it.
- **Flavors, 18+ check and share.** Key Lime, Cherry, Orange and Sol Surge. Scan payouts are 18+. Share uses the Android share sheet.

## How it's built

| Folder | What's in it |
| --- | --- |
| `app/` | Native Android app in Kotlin. `MainActivity.kt` runs the UI in a WebView and talks to wallets with the official [Mobile Wallet Adapter client library](https://github.com/solana-mobile/mobile-wallet-adapter) (`com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.1.1`). |
| `web/` | The UI in plain HTML, CSS and JS. It ships inside the APK. You can open `web/index.html` in a browser for a quick look (wallet connect needs the app). |
| `apk/` | The built APK. |

The UI and the Kotlin side talk through a small bridge:

- UI to app: `GoodEnergyNative.connect()`, `disconnect()`, `signClaim(id, message)`, `share(text)`, `currentWallet()`
- App to UI: `GoodEnergyWallet.onConnected(address, label)`, `onDisconnected()`, `onError(message)`, `onSigned(id, signature, address)`, `onSignFailed(id, message)`

The chirp is made live with the Web Audio API: a sharp chirp with a short coin shimmer, under one second. No audio files.

## Build from source

You need JDK 17 or newer and the Android SDK (platform 36).

```bash
./gradlew testDebugUnitTest assembleRelease
```

The APK lands in `app/build/outputs/apk/release/app-release.apk`. It's signed with the debug key so it installs on any emulator. Use your own key for a store release. GitHub Actions also builds it on every push.

## Notes

- Demo build. No real money moves. The app only asks the wallet to connect and sign messages. It never sends a transaction.
- The wallet connects on Solana mainnet so it works with any wallet out of the box. To use devnet, change `blockchain` in `MainActivity.kt` to `Solana.Devnet`.
- Scan payouts are 18+.
- More at [drinkgoodenergy.com](https://drinkgoodenergy.com).

## License

MIT
