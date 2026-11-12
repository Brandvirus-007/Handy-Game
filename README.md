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
- **7 Gegnertypen** mit eigener Silhouette und eigenem Verhalten (Motte, Pfeil, Schere, Teiler, Panzer, Spucker, Schwarm)
  sowie Elite-Varianten.
- **3 Bosse** mit zwei Phasen: Der Schlund, Die Weberin, Die Zwillinge. Jede 5. Welle ist eine Bosswelle, und die Bosse werden mit jedem Durchlauf stärker.
- **17 Upgrades** mit Synergien (Schockwelle, Kettenblitz, Echo, Frost, Zeitlupe …). Nach jeder Welle wählst du eins von drei.
- **Meta-Progression:** Werkstatt (6 permanente Verbesserungen), 4 spielbare Funken mit eigenem Stil,
  18 Erfolge und Lebenszeit-Statistiken.
- **Tägliche Herausforderung:** Seed aus dem Datum, fester Funke und 2 Modifikatoren. Sie ist für alle gleich.
- **Interaktives Tutorial** in einer echten (harmlosen) Spielwelt.
- **Prozeduraler Sound:** Alle Effekte und die generative Musik entstehen live mit der Web Audio API. Es gibt keine Audiodateien.
- **Juice:** Glow, Partikel, Screen-Shake, Hit-Stop, Zeitlupe und Vibration (Android).
- **Mobile-Details:** Safe-Area/Notch, Auto-Pause beim App-Wechsel, Wake-Lock, automatische Grafikanpassung,
  Offline-Unterstützung (PWA) und Installation auf dem Home-Bildschirm.
- **Deutsch & Englisch** werden automatisch erkannt und lassen sich umschalten.

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
npm test             # 40+ Unit- & Simulationstests (inkl. Bot, der ganze Runden spielt)
npm run build        # Produktions-Build nach dist/ (inkl. Service Worker)
npm run smoke        # Browser-Smoke-Test auf emuliertem Pixel 7 (benötigt den Build)
npm run build:single # Alles in einer einzigen HTML-Datei (dist-single/)
npm run icons        # App-Icons neu erzeugen
```

**Veröffentlichen:** Der Workflow `.github/workflows/deploy.yml` baut bei jedem Push auf `main` und
veröffentlicht auf GitHub Pages. Dafür einmalig unter *Settings → Pages → Source* die Option **GitHub Actions** wählen.

## Architektur

Das Spiel ist in TypeScript mit Vite geschrieben, nutzt Canvas 2D, Web Audio und DOM-Overlays für Menüs und kommt ohne Engine aus (ca. 50 KB JS gzip).

```
src/
  core/     Mathe, Geometrie, Seed-RNG, Spatial Hash, Spielstand (versioniert, robust), i18n
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
