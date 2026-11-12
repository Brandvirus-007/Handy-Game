# LUMEN LOOP

**Zieh Kreise aus Licht. Fang die Schatten.**

LUMEN LOOP ist ein Arcade-Roguelite für das Handy, das man mit einem Daumen spielt. Du steuerst einen
Lichtfunken, der eine leuchtende Spur hinter sich herzieht. Kreuzt die Spur sich selbst, schließt sich eine
Schleife, und alle Schatten darin werden ausgelöscht. Je mehr Schatten in einer Schleife gefangen sind, desto höher fällt der Bonus aus.
Berührst du einen Schatten selbst, kostet das ein Herz.

<p align="center">
  <img src="docs/screenshots/menu.webp" width="180" alt="Hauptmenü">
  <img src="docs/screenshots/boss.webp" width="180" alt="Bosskampf gegen den Schlund">
  <img src="docs/screenshots/upgrade.webp" width="180" alt="Upgrade-Auswahl">
  <img src="docs/screenshots/gameover.webp" width="180" alt="Rundenende">
</p>

## Features

- **Kernmechanik „Schleife“** mit Multi-Kill- und Kombo-Multiplikatoren. Ein *magnetischer Schleifenschluss*
  verzeiht auf dem Touchscreen ein paar Pixel Ungenauigkeit.
- **1:1-Relativsteuerung** wie bei einem Trackpad: Der Finger kann überall liegen und verdeckt den Funken nie.
- **10 Gegnertypen** (u. a. Wächter mit Schildaura, teleportierende Blinker, explodierende Bomber) und **5 Bosse**:
  Schlund, Weberin, Zwillinge, Hydra und Auge. Alle fünf Wellen kommt ein Boss, mit jedem Durchgang stärker.
- **25 Upgrades** mit Synergien, **6 Funken** (zwei davon Premium) und **5 Gebiete** mit eigener Farbwelt.
- **Fortschritt:** Lichtstufen, Etappen, 3 Tagesmissionen, 7-Tage-Bonus, Werkstatt, Booster, 26 Erfolge, tägliche Herausforderung.
- **Wirtschaft:** Splitter (im Spiel verdient) und Diamanten (Etappen, Erfolge, Stufen, Missionen, Gratis-Werbung oder Kauf).
  Nach dem Tod kann man einmal pro Runde per Werbung weiterspielen, danach mit Splittern oder Diamanten.
- **Werbung & Käufe:** AdMob (Rewarded und Interstitials nur zwischen Runden, mit DSGVO-Einwilligung) und Google Play Billing.
  Im Browser wird beides als „Demo“ simuliert.
- **Prozeduraler Sound:** Alle Effekte und die generative Musik entstehen live mit der Web Audio API.
- **Mobile-Details:** Safe-Area/Notch, Auto-Pause, Bildschirm bleibt an, Zurück-Taste, automatische Grafikanpassung, offline spielbar.
- **Deutsch & Englisch** werden automatisch erkannt und lassen sich umschalten.

## Dokumente

| Dokument | Inhalt |
|---|---|
| [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) | Ursprünglicher Spielentwurf |
| [`docs/PLAY_STORE_PLAN.md`](docs/PLAY_STORE_PLAN.md) | Recherche + Plan für die Play-Version (Wirtschaft, Werbung, Käufe) |
| [`docs/PLAY_CONSOLE_CHECKLIST.md`](docs/PLAY_CONSOLE_CHECKLIST.md) | Schritt für Schritt zur Veröffentlichung |
| [`docs/store/LISTING.md`](docs/store/LISTING.md) | Store-Texte DE/EN, Feature-Grafik, Screenshots |
| [`android/README.md`](android/README.md) | App bauen, signieren, AdMob-IDs, Paketname |

## Spielen

Am Handy öffnest du die gehostete Seite (siehe unten) im Browser und wählst dann **„Zum Home-Bildschirm“**.
Danach startet LUMEN LOOP als Vollbild-App und funktioniert auch offline.

| Eingabe | Aktion |
|---|---|
| Finger ziehen | Funke bewegen (relativ, 1:1) |
| Doppeltippen / zweiter Finger / PULS-Button | Puls (Schockwelle, sobald aufgeladen) |
| Desktop: WASD/Pfeile · Leertaste · Esc | Bewegen · Puls · Pause |

## Entwicklung

```bash
npm install
npm run dev          # Dev-Server (auch im WLAN erreichbar → am Handy testen)
npm test             # 66 Unit-, Simulations- & Plattformtests (inkl. Bot, der alle 5 Bosse besiegt)
npm run build        # Produktions-Build nach dist/ (inkl. Service Worker)
npm run smoke        # Browser-Smoke-Test auf emuliertem Pixel 7 (benötigt den Build)
npm run build:single # Alles in einer einzigen HTML-Datei (dist-single/)
npm run icons        # App-Icons (Web + Android) neu erzeugen
npm run android:debug   # Android-Debug-APK bauen
npm run android:bundle  # Signiertes .aab für Google Play bauen
node scripts/store-assets.mjs  # Store-Grafiken & Screenshots neu erzeugen
```

**Veröffentlichen:** Der Workflow `.github/workflows/deploy.yml` baut bei jedem Push auf `main` und
veröffentlicht auf GitHub Pages. Dafür einmalig unter *Settings → Pages → Source* die Option **GitHub Actions** wählen.

## Architektur

Das Spiel ist in TypeScript mit Vite geschrieben, nutzt Canvas 2D, Web Audio und DOM-Overlays für Menüs und kommt ohne Engine aus (ca. 70 KB JS gzip).
Die Android-App ist eine Capacitor-8-Hülle (Ziel-API 36), siehe `android/`.

```
src/
  core/     Mathe, Geometrie, Seed-RNG, Spatial Hash, Spielstand (versioniert, robust), i18n
  economy/  Preise, Belohnungen, Missionen, Stufen, Etappen (reine, getestete Funktionen)
  platform/ Werbung & Käufe: Android (AdMob, Play Billing) und Browser-Demo
  game/     Headless-Simulation: World, Spur & Schleifenerkennung, Gegner, Bosse, Wellen,
            Upgrades, Funken, Meta, Modifikatoren, Erfolge
  render/   Renderer, Glow-Sprites, Hintergrund, Effekte
  audio/    Synthesizer-SFX und generative Musik
  ui/       Bildschirme, HUD, Icons, Styles
  app.ts    Zustandsautomat und Spielschleife (fester 60-Hz-Zeitschritt)
```

Die Simulation (`World`) kennt weder DOM noch Audio. Sie erzeugt nur Events. Dadurch ist sie vollständig testbar,
und ein Bot spielt in den Tests ganze Runden inklusive aller drei Bosse.

Der vollständige Plan mit Design-Entscheidungen und Balancing steht in [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).
