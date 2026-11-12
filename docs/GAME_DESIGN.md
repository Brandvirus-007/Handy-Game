# LUMEN LOOP: Game Design & technischer Plan

> *Zieh Kreise aus Licht. Fang die Schatten.*

Dieses Dokument ist der Plan, der **vor** der Umsetzung geschrieben wurde. Es beschreibt
Konzept, Spielsysteme, Balancing-Grundlagen, Architektur und Qualitätskriterien.

---

## 1. Vision

Ein Arcade-Roguelite für das Handy, das man **mit einem Daumen** spielt und das sich
sofort gut anfühlt. Runden dauern 3–15 Minuten, und jede Runde fühlt sich durch Upgrades anders an.

**Kernidee:** Du steuerst einen Lichtfunken, der eine leuchtende Spur hinter sich herzieht.
**Kreuzt die Spur sich selbst, schließt sich eine Schleife.** Jeder Schatten innerhalb der
Schleife wird ausgelöscht. Je mehr Gegner du in einer Schleife fängst, desto höher ist der
Multiplikator. Berührst du einen Gegner selbst, verlierst du ein Herz.

Warum das auf dem Handy funktioniert:
- Wischen und Kreisen ist die natürlichste Touch-Geste überhaupt.
- Es gibt keine virtuellen Joysticks und keine Buttons, die den Bildschirm verdecken.
- Das Spiel hat eine eingebaute Risiko-Abwägung: Große Schleifen fangen viele Gegner, führen dich
  aber auch nah an sie heran.

### Design-Säulen
1. **Gefühl zuerst:** Die Steuerung reagiert sofort, und jede Aktion hat Feedback (Partikel,
   Sound, Vibration, Hit-Stop, Screen-Shake).
2. **Lesbarkeit:** Jede Gefahr wird angekündigt (Spawn-Marker, Ziellinien, Aufladen).
   Ein Treffer passiert nie ohne Vorwarnung.
3. **Tiefe durch Synergien:** 17 Upgrades, die sich gegenseitig verstärken
   (z. B. Echo + Schockwelle + Kettenblitz).
4. **Fair & offline:** Das Spiel kommt ohne Werbung, Pay-to-win, Login und Internet aus. Es ist eine installierbare PWA.

---

## 2. Steuerung

| Eingabe | Aktion |
|---|---|
| Finger ziehen | Standard: Der Funke folgt dem Finger und schwebt dabei 56/80/112 px (einstellbar) darüber, damit der Daumen ihn nicht verdeckt. Am oberen und unteren Rand schrumpft der Abstand, damit jede Stelle erreichbar bleibt. Alternativ: Trackpad-Modus, der Funke bewegt sich **relativ** zum Finger |
| Doppeltippen / zweiter Finger / Puls-Button | **Puls**: Schockwelle, sobald aufgeladen |
| Pause-Button / App verlassen | Pause (automatisch bei `visibilitychange`) |
| Desktop: WASD/Pfeile, Leertaste, Esc | Bewegung, Puls, Pause |

Die Empfindlichkeit ist einstellbar (0,6×–1,8×).

---

## 3. Spielablauf

```
Hauptmenü ─► (Tutorial beim ersten Start) ─► Welle 1 ─► Welle geschafft ─► 1 von 3 Upgrades wählen ─► Welle 2 …
                                                     └─ jede 5. Welle: Boss
Tod ─► (Zweite Chance?) ─► Game Over: Punkte, Statistik, verdiente Splitter ─► Werkstatt / Nochmal
```

- **Wellen**: Jede Welle hat ein Gegner-Budget. Gegner erscheinen gestaffelt mit Vorwarnung.
  Die Welle endet, wenn alle besiegt sind.
- **Splitter** (Währung): Besiegte Gegner lassen sie fallen. Sie werden per Magnet oder Schleife
  eingesammelt. Nach der Runde wandern sie auf das Konto für die Werkstatt.
- **Kombo**: Schleifen mit Kills in schneller Folge erhöhen den Kombo-Multiplikator (bis ×3).
- **Multi-Kill**: Pro zusätzlichem Gegner in einer Schleife gibt es +50 % Punkte.

### Punkteformel
```
punkte_pro_kill = basis(gegner) × (1 + 0,5 × (gefangene − 1)) × kombo_mult
kombo_mult     = min(3, 1 + 0,1 × (kombo − 1))
wellenbonus    = 100 × welle  (× 1,5 wenn ohne Schaden = „Makellos“)
```

---

## 4. Die Schleife (Kernmechanik)

- Die Spur besteht aus Punkten mit Mindestabstand 5 Einheiten. Sie wird durch **maximale Länge**
  (Basis 520) und **Lebensdauer** (Basis 2,6 s) begrenzt.
- Bei jedem neuen Segment wird auf Schnitt mit allen älteren Segmenten geprüft (außer den
  direkten Nachbarn). Das kostet O(n) pro Punkt bei n ≤ ~120.
- Schnittpunkt X → Polygon = [X, p(i+1) … p(n−1)]. Ist die Fläche kleiner als 700 E² (Zitter-Schleifen),
  wird sie ignoriert.
- Gültige Schleife: Point-in-Polygon-Test für Gegner (Bosse: Mittelpunkt), Pickups und Projektile.
  Danach wird die Spur auf [X, Kopf] zurückgesetzt.
- **Schnitt**: Bestimmte Gegner (Schere, Fäden der Weberin, Strahl der Zwillinge) zerschneiden
  die Spur. Alles hinter dem Schnittpunkt verschwindet.

---

## 5. Gegner

Alle Gegner sind „Schatten“: ein dunkler Körper mit farbigem Leuchtrand und Augen, die dem Spieler folgen.
Sie unterscheiden sich in **Form und Farbe**, damit man sie auch mit Farbschwäche erkennt.

| Gegner | ab Welle | HP | Verhalten | Kosten |
|---|---|---|---|---|
| **Motte** | 1 | 1 | Treibt langsam auf dich zu und schlingert | 1 |
| **Pfeil** | 2 | 1 | Hält an, zielt (Linie sichtbar) und sprintet | 2 |
| **Schere** | 3 | 1 | Umkreist dich und **zerschneidet deine Spur** | 2,5 |
| **Teiler** | 4 | 1 | Zerfällt beim Tod in 3 schnelle Mini-Schatten | 3 |
| **Panzer** | 6 | 2 | Langsam, braucht 2 Schleifen, Panzer bekommt Risse | 4 |
| **Spucker** | 7 | 1 | Hält Abstand und schießt langsame Kugeln (mit Aufladen) | 3,5 |
| **Schwarm** | 8 | 1 je | 8–12 winzige, schnelle Schatten im Verbund, ideal für Riesen-Schleifen | 6 |

**Skalierung:** Gegner werden pro Welle 2,5 % schneller (max. +60 %). Ab Welle 7 gibt es **Elite-Varianten**
(+1 HP, größer, ×3 Splitter, Leuchtring), deren Chance bis auf 35 % steigt.

### Bosse (jede 5. Welle, rotierend, jede Runde stärker)
1. **Der Schlund** (Welle 5): riesig und langsam, feuert Projektil-Ringe mit Lücke, ruft Motten.
   In Phase 2 feuert er Doppelringe.
2. **Die Weberin** (Welle 10): springt durch die Arena und hinterlässt **Fäden**, die verletzen und die Spur
   schneiden (mit Vorwarnung). In Phase 2 ruft sie Scheren.
3. **Die Zwillinge** (Welle 15): zwei Körper mit einem **Strahl** dazwischen. Fängst du beide in einer
   Schleife, verursachst du doppelten Schaden und betäubst sie. Stirbt einer, rast der andere.

---

## 6. Upgrades (pro Runde)

Nach jeder Welle wählst du eins von drei. Die Seltenheit bestimmt die Wahrscheinlichkeit (Gewöhnlich 60 %, Selten 30 %, Episch 10 %).

| Upgrade | Seltenheit | Max | Wirkung |
|---|---|---|---|
| Lange Spur | G | 5 | +20 % Spurlänge |
| Nachglühen | G | 3 | +25 % Spur-Lebensdauer |
| Feinfunke | G | 3 | −12 % Trefferzone |
| Magnet | G | 3 | +40 % Sammelradius |
| Splitterregen | G | 3 | +25 % Splitter |
| Kombo-Meister | G | 3 | +0,5 s Kombo-Zeitfenster |
| Herz | S | 3 | +1 max. Herz und 1 Heilung |
| Schockwelle | S | 3 | Gefangene Gegner explodieren (Flächenschaden) |
| Frostschleife | S | 3 | Die Schleife hinterlässt ein Frostfeld (−50 % Tempo) |
| Kettenblitz | S | 3 | Kills springen auf 1/2/3 nahe Gegner über |
| Glutspur | S | 3 | Die Spur selbst verbrennt Gegner |
| Pulsladung | S | 3 | Der Puls lädt 30 % schneller und hat mehr Radius |
| Schild | S | 3 | Eine Schutzblase, die alle 25/20/15 s nachlädt |
| Echo | E | 2 | Die Schleife wiederholt sich 0,6 s später |
| Zeitlupe | E | 2 | Ab 3+ Gegnern pro Schleife verlangsamt sich die Zeit |
| Doppelschlag | E | 2 | Schleifen verursachen +1 Schaden |
| Zweite Chance | E | 1 | Einmal wiederbeleben |

---

## 7. Meta-Progression

**Werkstatt** (permanent, mit Splittern bezahlt, Kosten steigen pro Stufe):
Startherz (+1, max. 2) · Grundspur (+8 %, max. 5) · Splitterfund (+10 %, max. 5) ·
Neu würfeln (+1 Reroll pro Runde, max. 3) · Vorladung (Puls startet mit 50 %, max. 2) · Grundmagnet (+15 %, max. 3)

**Funken** (spielbare Charaktere mit eigener Farbe und eigenem Spielstil):
| Funke | Preis | Eigenschaft |
|---|---|---|
| Funke | – | ausgewogen |
| Komet | 400 | −28 % Trefferzone, −20 % Spur, Puls lädt durch Bewegung |
| Glut | 900 | +30 % Spur, Spur brennt (Glutspur 1), verblasst 15 % schneller |
| Prisma | 1500 | Kettenblitz 1 angeboren, nur 2 Herzen, +25 % Punkte |

**Tägliche Herausforderung:** Seed aus dem Datum, fester (auch noch gesperrter!) Funke und 2 Modifikatoren
(z. B. „Glaskanone“: 1 Herz, ×2 Splitter). Es gibt eine eigene Tagesbestenliste (lokal).

**Erfolge:** 18 Erfolge (erste Schleife, 5er-/10er-Schleife, Welle 5/10/20, jeder Boss, Kombo ×10,
makellose Welle, 1000 Splitter gesammelt, alle Funken …) plus Lebenszeit-Statistiken.

---

## 8. Audiovisueller Stil

- **Look:** Neon auf tiefem Indigo-Schwarz. Licht ist der Spieler, Schatten sind die Gegner.
  Additives Blending, vorgerenderte Glow-Sprites (kein `shadowBlur`, der auf dem Handy zu langsam ist),
  Parallax-Sternenstaub und Nebel.
- **Juice:** Hit-Stop, traumabasierter Screen-Shake, Partikel-Pool (Funken, Ringe), Füll-Blitz der Schleife,
  fliegende Punktzahlen, Kombo-Anzeige, roter Vignetten-Puls bei niedriger Gesundheit, Wellen-Banner.
- **Sound:** Alles wird **prozedural mit der Web Audio API synthetisiert**. Es gibt keine Asset-Dateien und keine Lizenzfragen.
  - SFX: Schleifenschluss (Akkord, dessen Tonhöhe mit der Kombo steigt), Kills, Treffer, Sammeln (pentatonisch aufsteigend),
    Puls, Wellen-Fanfare, Boss-Brüllen, UI.
  - **Generative Musik** in a-Moll mit Pad, Arpeggio und Bass. Die Percussion kommt je nach Intensität dazu
    (Menü → Spiel → späte Wellen → Boss). Im Pause- und Upgrade-Bildschirm wird die Musik gedämpft (Tiefpass).
- **Haptik:** `navigator.vibrate`-Muster (Android), abschaltbar.

---

## 9. Technische Architektur

**Stack:** TypeScript + Vite, Canvas 2D, Web Audio, DOM-Overlay für Menüs, PWA (offline, installierbar).
Es gibt bewusst keine Engine: Das Paket bleibt klein, lädt schnell und lässt sich voll kontrollieren.

```
src/
  core/     math, geometry, rng (seeded), grid (Spatial Hash), storage (versionierter Spielstand), i18n
  game/     world (headless Simulation), trail, enemies, bosses, waves, upgrades, meta,
            characters, modifiers, achievements, tutorial, config
  render/   renderer (Kamera, DPR, Layer), sprites (Glow-Cache), background, fx (Partikel, Texte)
  audio/    sfx (Synth), music (generativer Sequencer mit Lookahead-Scheduler)
  ui/       Screens (Menü, Werkstatt, Funken, Erfolge, Einstellungen, Pause, Upgrade, Game Over), HUD
  app.ts    Zustandsautomat, verbindet alle Teile
```

**Wichtige Prinzipien:**
- **Die Simulation ist headless:** `World` kennt weder DOM noch Audio. Sie erzeugt nur Events
  (`loop`, `kill`, `hit`, …), die Renderer, Audio und UI konsumieren. Dadurch ist die Spiellogik
  unter Node testbar, und es gibt einen Bot-Test, der Hunderte Sekunden simuliert.
- **Fester Zeitschritt** (60 Hz, Akkumulator, max. 5 Schritte/Frame), entkoppelt vom Rendering.
  Zeitlupe und Hit-Stop laufen über eine Zeitskala.
- **Performance:** Objekt-Pools für Partikel, Spatial Hash für Kollisionen, DPR-Begrenzung (max. 2),
  **automatische Qualitätsanpassung** bei niedriger Framerate.
- **Robustheit:** Jeder `localStorage`-Zugriff liegt in try/catch, der Spielstand ist versioniert und wird mit Defaults gemerged.
  Bei `visibilitychange` wird automatisch pausiert und der AudioContext angehalten.
- **Handy-Details:** `viewport-fit=cover` + Safe-Area-Insets (Notch), `touch-action: none`,
  kein Zoom und kein Kontextmenü, Pointer Events (Touch, Maus und Stift). Das Audio wird bei der ersten Geste entsperrt (iOS).
- **i18n:** Deutsch (Standard) und Englisch, automatisch erkannt. Ein Test prüft, dass beide Sprachen dieselben Schlüssel haben.

---

## 10. Qualitätssicherung

- **Unit-Tests (Vitest):** Geometrie (Schnitt, Point-in-Polygon, Fläche), Schleifenerkennung, RNG-Determinismus,
  Wellen-Budget, Upgrade-Limits, Spielstand-Migration und -Korruption, i18n-Parität.
- **Simulationstest:** Ein Bot spielt Runden headless und prüft dabei, dass keine Exceptions und keine NaN-Positionen
  auftreten, dass Wellen fortschreiten und dass Bosse spawnen.
- **Browser-Smoke-Test (Playwright, Handy-Emulation):** Das Spiel startet, ein Touch-Drag wird ausgeführt, es gibt keine Konsolenfehler,
  und es werden Screenshots erstellt.
- **CI:** GitHub Actions (Tests + Build) und Deployment auf GitHub Pages.

---

## 11. Meilensteine

1. Gerüst: Vite/TS, Canvas, Loop, Input, Spieler + Spur + Schleifenerkennung (+ Tests)
2. Gegner, Wellen, Kollision, Herzen, Splitter, Punkte, Kombo
3. Renderer-Juice: Glow, Partikel, Shake, Hit-Stop, Hintergrund
4. Upgrades + Upgrade-Auswahl, Puls
5. Bosse
6. UI: Menüs, HUD, Pause, Game Over, Einstellungen, Werkstatt, Funken, Erfolge
7. Audio: SFX + generative Musik
8. Tutorial, tägliche Herausforderung, Spielstand
9. PWA, Icons, CI/Deployment, Smoke-Test auf dem Handy-Viewport, Feinschliff und Balancing
