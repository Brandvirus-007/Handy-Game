# LUMEN LOOP für Google Play: Plan

Stand: 12. November 2026. Dieses Dokument wurde **vor** der Umsetzung geschrieben. Es fasst die Recherche
zusammen und legt Wirtschaftssystem, neue Inhalte, Technik und Veröffentlichung fest.

---

## 1. Recherche: was Google Play heute verlangt

| Thema | Stand Nov. 2026 | Konsequenz für uns |
|---|---|---|
| Ziel-API | Neue Apps und Updates müssen **API 36 (Android 16)** anvisieren ([Play Console Hilfe](https://support.google.com/googleplay/android-developer/answer/11926878)) | `targetSdk = 36`, `compileSdk = 36` |
| In-App-Käufe | Digitale Güter **nur** über Google Play Billing. Seit 31.08.2026 ist **Billing Library 8+** Pflicht ([Übersicht](https://foresightmobile.com/blog/google-play-billing-library-8-migration)) | Plugin `@capgo/native-purchases` 8.9.10 (bindet Billing **9.1.0** ein, geprüft im Gradle-File) |
| Werbung | AdMob über `@capacitor-community/admob` 8.3.0 (Capacitor 8, Rewarded + Interstitial, eingebaute **UMP-Einwilligung** für EU/DSGVO) ([npm](https://www.npmjs.com/package/@capacitor-community/admob), [Release-Notes](https://github.com/capacitor-community/admob/releases/tag/v8.2.0)) | Einwilligung **vor** Initialisierung abfragen; Belohnung nur beim `Rewarded`-Event vergeben |
| Interstitials | Keine „unerwarteten“ Vollbild-Anzeigen während des Spielens oder vor dem Ladebildschirm; erlaubt an natürlichen Übergängen ([Play-Richtlinie](https://support.google.com/googleplay/android-developer/answer/12271244)) | Interstitial **nur** nach Rundenende, mit Frequenzbegrenzung |
| Rewarded Ads | Freiwillig; Belohnung und Aktion müssen **vor** dem Abspielen klar genannt werden ([AdMob/Ad Manager](https://support.google.com/admanager/answer/7496282)) | Jeder Werbe-Button nennt genau, was man bekommt |
| Lootboxen | Bezahlte Zufallsinhalte brauchen offengelegte Gewinnchancen ([Fenwick](https://fenwick.com/insights/publications/google-play-now-requires-disclosure-of-loot-box-odds)) | **Keine bezahlten Zufallsboxen** – alles, was man kauft, ist genau bekannt |
| Neues Entwicklerkonto | Private Konten (nach 13.11.2023) brauchen einen **geschlossenen Test mit ≥ 12 Testern über 14 Tage** vor der Produktion ([Play Console Hilfe](https://support.google.com/googleplay/android-developer/answer/14151465)) | Zeit einplanen: Interner Test → Geschlossener Test → Produktion |
| Rewarded-Platzierung | Der Fortsetzen-Dialog nach dem Scheitern ist der stärkste Werbemoment; Werbung nicht stapeln ([Sensor Tower](https://sensortower.com/blog/best-mobile-game-monetization-retention-practices), [AppSamurai](https://appsamurai.com/blog/rewarded-ads-in-mobile-games-strategy-data-and-best-practices/)) | Kein Interstitial direkt nach einem Rewarded Ad |

---

## 2. Wirtschaftssystem

### Zwei Währungen
| Währung | Symbol | Woher | Wofür |
|---|---|---|---|
| **Splitter** (Standard) | ◆ gold | Im Spiel einsammeln, Missionen, Tagesbonus, Stufenaufstieg | Werkstatt, Funken, Booster, Wiederbeleben (2. Mal) |
| **Diamanten** (Premium) | ◇ cyan | **In-App-Kauf**, **Etappen** (Wellen-Meilensteine), Erfolge, Stufenaufstieg, Tagesbonus Tag 7, Missionen, Gratis-Werbung im Shop | Wiederbeleben, Premium-Funken, Premium-Booster, Splitter tauschen, Werkstatt sofort kaufen |

### Wiederbeleben (Kern der Monetarisierung)
Sind alle Herzen weg, wird die Runde **eingefroren** und es erscheint „Weitermachen?“ mit 7-Sekunden-Countdown:

1. **Werbung ansehen → gratis weiter** (einmal pro Runde)
2. **Splitter** (nach der Werbung): 400 → 1.000 → 2.500 (steigend)
3. **Diamanten** (jederzeit): 15 → 30 → 60 (steigend)
4. „Aufgeben“

Wiederbelebung = **alle Herzen voll**, Gratis-Puls (räumt den Bereich frei), 3 s Unverwundbarkeit.
Die Schwierigkeit ist so angelegt, dass die meisten Runden mitten in einer Welle enden – genau dann ist
das Angebot am attraktivsten.

### Weitere Werbeplätze (alle freiwillig, außer Interstitial)
| Platz | Belohnung | Grenze |
|---|---|---|
| Rundenende | **Splitter ×2** | 1× pro Runde |
| Upgrade-Auswahl | **Neu würfeln** | 1× pro Runde |
| Shop „Gratis“ | **3 Diamanten** | 3× pro Tag |
| Interstitial | – | frühestens ab der 4. Runde, max. alle 3 Runden und 3 Minuten, nie direkt nach Rewarded, nie mit „Werbefrei“ |

### In-App-Käufe (Produkt-IDs für die Play Console)
| Produkt-ID | Typ | Inhalt | Preisvorschlag |
|---|---|---|---|
| `diamonds_80` | Verbrauchbar | 80 Diamanten | 0,99 € |
| `diamonds_450` | Verbrauchbar | 450 Diamanten (+12 %) | 4,99 € |
| `diamonds_1000` | Verbrauchbar | 1.000 Diamanten (+25 %) · *Beliebt* | 9,99 € |
| `diamonds_2200` | Verbrauchbar | 2.200 Diamanten (+38 %) | 19,99 € |
| `diamonds_6000` | Verbrauchbar | 6.000 Diamanten (+50 %) · *Bester Wert* | 49,99 € |
| `starter_pack` | Einmalig | 300 Diamanten + 3.000 Splitter + Funke **Nova** | 2,99 € |
| `no_ads` | Einmalig | Keine Interstitials + 100 Diamanten Bonus | 3,99 € |
| `spark_aurora` | Einmalig | Funke **Polarlicht** (nur für Echtgeld) + 500 Diamanten + 5.000 Splitter | 9,99 € |

Preise werden in der Play Console festgelegt; die App zeigt den **lokalisierten Preis aus Google Play** an.

### Pay-to-Win-Hebel – und warum es trotzdem Spaß macht
Geld beschleunigt und rettet Runden, ersetzt aber nie das Spielen:
- **Booster vor der Runde:** Startschild, Extraherz, Vollladung (Splitter) · Glücksgriff (Start mit seltenem Upgrade), Splitter-Magnet, **Kopfstart** ab Welle 6 (Diamanten)
- **Premium-Funken:** *Nova* (startet mit Echo) und *Phantom* (ignoriert den ersten Treffer jeder Welle)
- **Werkstatt sofort kaufen** mit Diamanten, wenn Splitter fehlen
- **Wiederbeleben** mit Diamanten

Spielspaß-Garantien: Jeder Inhalt ist auch kostenlos erreichbar (Diamanten gibt es durch Etappen,
Erfolge, Stufen, Missionen, Gratis-Werbung). Keine Zufallskäufe, keine Energie-/Wartesysteme,
die das Spielen blockieren.

### Gratis-Diamantenquellen („Etappen“ & Co.)
| Quelle | Diamanten |
|---|---|
| Etappe: erstmals Welle 5/10/15/20/25/30/40/50/75/100 überstanden | 5/10/15/20/25/30/40/50/75/100 |
| Erfolg freigeschaltet | 5–25 |
| Lichtstufe aufgestiegen | 3 pro Stufe, 25 alle 5 Stufen |
| Tagesbonus (7-Tage-Kalender) | Tag 3: 5 · Tag 5: 8 · Tag 7: 20 |
| Tagesmissionen | je 2–5, Bonus 5 für alle drei |
| Shop-Werbung | 3 × 3 pro Tag |

### Langzeitmotivation
- **Lichtstufe** (Kontostufe): Jede Runde gibt Erfahrung; jede Stufe bringt Splitter und Diamanten.
- **Tagesmissionen:** 3 pro Tag (z. B. „Fang 60 Schatten“, „Erreiche Welle 8“, „Besiege einen Boss“).
- **Tagesbonus:** 7-Tage-Kalender mit steigenden Belohnungen; eine Lücke setzt die Serie zurück.

---

## 3. Neue Inhalte („viel mehr rein“)

| Bereich | Bisher | Neu |
|---|---|---|
| Gegner | 7 | **10**: + **Wächter** (Schildaura – zuerst ihn fangen), **Blinker** (teleportiert mit Vorwarnung), **Bomber** (explodiert nach dem Tod – große Schleifen!) |
| Bosse | 3 | **5**: + **Die Hydra** (teilt sich in drei Köpfe), **Das Auge** (rotierender Laserstrahl) |
| Upgrades | 17 | **25**: Schatzschleife, Rache, Doppelpuls, Magnetspur, Supernova, Heilschleife, Sternenstaub, Durchschlag |
| Funken | 4 | **6**: + Nova, Phantom (Premium) |
| Welten | 1 | **5 Gebiete** mit eigener Farbwelt: Nebelmeer → Glutwüste → Tiefsee → Aurora → Die Leere (alle 10 Wellen) |
| Erfolge | 18 | **26** (inkl. neue Bosse, Welle 30/50, Stufe 10/25) |
| Meta | Werkstatt 6 | Werkstatt mit höheren Stufen + **Lichtstufe, Missionen, Tagesbonus, Shop, Booster** |

---

## 4. Technik

```
Web-Spiel (TypeScript/Vite)  ──►  Capacitor 8 (Android-Hülle, WebView)  ──►  .aab für Google Play
                                   ├─ @capacitor-community/admob   (Rewarded, Interstitial, UMP)
                                   ├─ @capgo/native-purchases       (Google Play Billing 9)
                                   ├─ @capacitor/app                (Zurück-Taste, Pause/Resume)
                                   ├─ @capacitor/haptics            (Vibration)
                                   └─ @capacitor/status-bar         (Vollbild)
```

- **Plattform-Schicht** `src/platform/`: Ein Interface für Werbung und Käufe mit zwei Implementierungen.
  *Native* nutzt AdMob und Google Play. *Web/Demo* simuliert Werbung (Countdown-Overlay) und Käufe, damit
  alles im Browser testbar bleibt; das ist klar als Demo gekennzeichnet.
- **Spielstand v2** mit Migration aus v1 (Splitter bleiben erhalten).
- **Android-Zurück-Taste:** pausiert im Spiel, navigiert in Menüs zurück, verlässt im Hauptmenü die App.
- **Kein Service Worker** in der App (nur Web), keine Werbung beim Start.
- **Test-IDs:** Bis echte AdMob-IDs eingetragen sind, nutzt die App Googles offizielle Test-Anzeigen.
- **Build:** Android SDK lokal installiert → Debug-APK wird hier gebaut und geprüft. GitHub Actions baut
  APK und signiertes AAB (Signatur-Schlüssel als Repository-Secrets).

---

## 5. Was du selbst erledigen musst (kann ich nicht für dich tun)

1. **Google-Play-Entwicklerkonto** anlegen (einmalig 25 US$), Identität bestätigen.
2. **Zahlungsprofil** (Händlerkonto) für In-App-Käufe einrichten.
3. **AdMob-Konto** anlegen, App + 2 Anzeigenblöcke (Rewarded, Interstitial) erstellen → IDs eintragen
   (`src/platform/config.ts` und `android/app/src/main/res/values/strings.xml`).
4. **Paketname** endgültig festlegen (lässt sich nach dem ersten Upload nie mehr ändern).
5. **Upload-Schlüssel** erzeugen (Anleitung in `android/README.md`) und als GitHub-Secrets hinterlegen.
6. **Produkte** mit den IDs aus der Tabelle oben in der Play Console anlegen.
7. **Datenschutzerklärung** (Vorlage liegt bei) mit deinen Angaben füllen und veröffentlichen; **Impressum** ergänzen.
8. Play-Console-Formulare: **Datensicherheit**, **Inhaltsbewertung (IARC)**, **Werbung: Ja**, Zielgruppe **ab 13**
   (nicht für Kinder – das vermeidet die strengen Familienrichtlinien).
9. **Geschlossener Test:** 12 Tester für 14 Tage, danach Produktionszugang beantragen.

---

## 6. Umsetzungsreihenfolge

1. Plan (dieses Dokument)
2. Spielstand v2, Wallet, Lichtstufe, Etappen, Missionen, Tagesbonus
3. Plattform-Schicht (Werbung/Käufe) inkl. Web-Demo
4. Wiederbeleben-Dialog, Rundenende-Belohnungen, Interstitial-Taktung
5. Shop, Booster-Auswahl, Premium-Funken, Werkstatt-Ausbau
6. Neue Gegner, Bosse, Upgrades, Gebiete, Erfolge
7. Capacitor-Android-Projekt, App-Icons, Zurück-Taste, Vollbild
8. Android-Build hier verifizieren, GitHub-Actions-Build
9. Store-Material: Beschreibung DE/EN, Feature-Grafik, Screenshots, Datenschutzerklärung, Checkliste
