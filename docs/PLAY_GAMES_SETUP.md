# Google Play Games einrichten

Das Spiel hat Bestenlisten und Erfolge für Google Play Games eingebaut. Solange nichts eingerichtet ist, ist das
abgeschaltet: Die App läuft normal, und in den Einstellungen taucht der Bereich „Google Play Games“ nicht auf.

## 1. Projekt in der Play Console anlegen

1. Play Console → deine App → **Wachstum → Play Games-Dienste → Einrichtung und Verwaltung → Konfiguration**.
2. „Nein, mein Spiel verwendet keine Google APIs“ wählen und ein neues Play-Games-Projekt anlegen.
3. Unter **Anmeldedaten** eine Android-Anmeldung hinzufügen. Dafür wird ein OAuth-Client in Google Cloud angelegt,
   mit Paketname `app.lumenloop.game` und dem SHA-1-Fingerabdruck des **App-Signaturschlüssels**
   (Play Console → Testen und veröffentlichen → App-Integrität). Für eigene Testbuilds zusätzlich den SHA-1 des
   Upload- oder Debug-Schlüssels eintragen.
4. Die **Projekt-ID** (eine lange Zahl) oben auf der Konfigurationsseite kopieren.

## 2. ID in die App eintragen

In `android/app/src/main/res/values/strings.xml`:

```xml
<string name="games_app_id" translatable="false">123456789012</string>
```

Steht dort `0`, bleibt Play Games aus.

## 3. Bestenlisten anlegen

Unter **Bestenlisten** fünf Listen anlegen (Sortierung: höher ist besser) und die IDs in
`src/platform/games-ids.ts` bei `LEADERBOARD_IDS` eintragen:

| Schlüssel | Name (DE) | Name (EN) | Wert |
|---|---|---|---|
| `score` | Rekord | High score | Punkte im Modus Normal |
| `wave` | Beste Welle | Best wave | Geschaffte Wellen im Modus Normal |
| `blitz` | Blitz | Blitz | Punkte im Blitz-Modus |
| `bosses` | Bossjagd | Boss Hunt | Punkte in der Bossjagd |
| `weekly` | Wochen-Event | Weekly event | Punkte im Wochen-Event |

## 4. Erfolge anlegen

Unter **Erfolge** diese 33 Erfolge anlegen und die IDs in `src/platform/games-ids.ts` bei
`ACHIEVEMENT_IDS` eintragen, zum Beispiel `first_loop: 'CgkI…'`. Fehlende Einträge werden einfach übersprungen.

| Schlüssel | Name (DE) | Beschreibung (DE) | Name (EN) |
|---|---|---|---|
| `first_loop` | Erster Kreis | Schließe deine erste Schleife. | First Circle |
| `multi5` | Lichtnetz | Fang 5 Schatten in einer Schleife. | Net of Light |
| `multi10` | Sternenfänger | Fang 10 Schatten in einer Schleife. | Star Catcher |
| `combo10` | Kettenreaktion | Erreiche eine Kombo von ×10. | Chain Reaction |
| `pulse5` | Supernova | Besiege 5 Schatten mit einem einzigen Puls. | Supernova |
| `wave5` | Glimmen | Überstehe Welle 5. | Glimmer |
| `wave10` | Leuchten | Überstehe Welle 10. | Glow |
| `wave15` | Strahlen | Überstehe Welle 15. | Radiance |
| `wave20` | Unauslöschlich | Überstehe Welle 20. | Inextinguishable |
| `wave30` | Weitgereist | Überstehe Welle 30. | Far Traveller |
| `wave50` | Legende | Überstehe Welle 50. | Legend |
| `flawless5` | Unberührt | Überstehe die ersten 5 Wellen ohne Treffer. | Untouched |
| `boss_maw` | Schlundbezwinger | Besiege den Schlund. | Maw Breaker |
| `boss_weaver` | Fadenriss | Besiege die Weberin. | Thread Cutter |
| `boss_twins` | Getrennte Wege | Besiege die Zwillinge. | Parted Ways |
| `boss_hydra` | Kopflos | Besiege die Hydra. | Headless |
| `boss_eye` | Augenblick | Besiege das Auge. | Blink of an Eye |
| `boss_vortex` | Sturmstiller | Besiege den Wirbel. | Storm Tamer |
| `score10k` | Funkenregen | Erreiche 10.000 Punkte in einer Runde. | Spark Shower |
| `score50k` | Lichtsturm | Erreiche 50.000 Punkte in einer Runde. | Light Storm |
| `shards1000` | Sammler | Sammle insgesamt 1.000 Splitter. | Collector |
| `all_chars` | Spektrum | Schalte alle Funken frei. | Spectrum |
| `daily` | Tagwerk | Spiele eine tägliche Herausforderung. | Daily Grind |
| `level10` | Leuchtfeuer | Erreiche Lichtstufe 10. | Beacon |
| `level25` | Sonnenfunke | Erreiche Lichtstufe 25. | Sunspark |
| `level50` | Lichtmeister | Erreiche Stufe 50. | Master of Light |
| `revived` | Zweiter Atem | Spiel eine Runde weiter, nachdem du erloschen bist. | Second Breath |
| `shopper` | Unterstützer | Kaufe etwas im Shop. | Supporter |
| `legend` | Legendär | Wähle eine legendäre Fusion. | Legendary |
| `galaxy` | Sternensystem | Wähle die Fusion Galaxie. | Star System |
| `blitz` | Blitzlicht | Hol 10.000 Punkte im Blitz-Modus. | Flashlight |
| `hunter` | Bossjäger | Besiege 5 Bosse in einer Bossjagd. | Boss Hunter |
| `master` | Meister des Lichts | Bring einen Funken auf Meisterschaft 10. | Master of Light |

## 5. Testen

1. Play-Games-Projekt unter **Tester** um das eigene Google-Konto ergänzen.
2. App bauen und installieren. Beim Start meldet Play Games dich automatisch an.
3. In den Einstellungen erscheinen „Bestenlisten“ und „Erfolge“. Erreichte Rekorde und Erfolge werden beim Start
   und nach jeder Runde übertragen.
4. Wenn alles passt, das Play-Games-Projekt in der Play Console **veröffentlichen**.
