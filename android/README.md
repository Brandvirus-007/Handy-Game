# LUMEN LOOP – Android-App

Die App ist eine [Capacitor 8](https://capacitorjs.com)-Hülle um das Web-Spiel (Ziel-API 36 / Android 16).
Werbung: AdMob (`@capacitor-community/admob`, inkl. DSGVO-Einwilligung über Google UMP).
Käufe: Google Play Billing 9 (`@capgo/native-purchases`).

## Bauen

```bash
npm install
npm run android:debug    # → android/app/build/outputs/apk/debug/app-debug.apk (zum Testen installierbar)
npm run android:bundle   # → android/app/build/outputs/bundle/release/app-release.aab (für Google Play, signiert)
```

Voraussetzungen: Node 22, JDK 21, Android SDK (Platform 36). In Android Studio genügt `npx cap open android`.

## 1. Upload-Schlüssel erzeugen (einmalig – gut aufbewahren!)

```bash
keytool -genkeypair -v -keystore lumen-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Google Play nutzt „Play App Signing“: Du signierst nur mit diesem **Upload-Schlüssel**, Google verwaltet den
eigentlichen App-Signaturschlüssel. Geht der Upload-Schlüssel verloren, kann er über die Play Console
zurückgesetzt werden – trotzdem: Datei + Passwörter sicher verwahren und **niemals committen**.

### Lokal signieren
`android/keystore.properties` anlegen (ist in `.gitignore`):
```properties
storeFile=/pfad/zu/lumen-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

### In GitHub Actions signieren
Repository → *Settings → Secrets and variables → Actions* → folgende Secrets anlegen:

| Secret | Inhalt |
|---|---|
| `LUMEN_KEYSTORE_BASE64` | `base64 -w0 lumen-upload.jks` |
| `LUMEN_KEYSTORE_PASSWORD` | Keystore-Passwort |
| `LUMEN_KEY_ALIAS` | `upload` |
| `LUMEN_KEY_PASSWORD` | Schlüssel-Passwort |

Danach baut der Workflow **Android** bei jedem Push ein signiertes `.aab` (Download unter *Actions → Artifacts*).
Der `versionCode` ist die Laufnummer des Workflows und steigt automatisch.

## 2. Echte AdMob-IDs eintragen (vor der Veröffentlichung)

Bis dahin zeigt die App ausschließlich **Google-Testanzeigen**.

1. `android/app/src/main/res/values/strings.xml` → `admob_app_id` (Format `ca-app-pub-…~…`)
2. `src/platform/config.ts` → `appId`, `rewarded`, `interstitial` (Format `ca-app-pub-…/…`)

Zusätzlich in AdMob: Datenschutz & Mitteilungen → **DSGVO-Nachricht** veröffentlichen (sonst erscheint kein Einwilligungsdialog in der EU).

## 3. Paketname

Aktuell `app.lumenloop.game`. Er ist nach dem ersten Upload **unveränderlich**. Zum Ändern:
`applicationId` in `android/app/build.gradle` und `appId` in `capacitor.config.ts` anpassen
(der Java-`namespace` darf bleiben).

## 4. In-App-Produkte

In der Play Console unter *Monetarisierung → Produkte → In-App-Produkte* anlegen – IDs exakt wie in
`src/economy/defs.ts` (`diamonds_80`, `diamonds_450`, `diamonds_1000`, `diamonds_2200`, `diamonds_6000`,
`starter_pack`, `no_ads`, `spark_aurora`, `light_pass`). Zum Testen eigene Google-Konten als *Lizenztester* eintragen.
