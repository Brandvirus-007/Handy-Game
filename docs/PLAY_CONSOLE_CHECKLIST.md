# Veröffentlichung in Google Play: Checkliste

Diese Schritte kann nur der Kontoinhaber erledigen. Reihenfolge = empfohlene Reihenfolge.
Technische Details zum Bauen und Signieren: [`android/README.md`](../android/README.md).

## A. Konten

- [ ] **Google-Play-Entwicklerkonto** anlegen (einmalig 25 US$), Identität bestätigen.
      Privates Konto (nach 13.11.2023 erstellt) → vor dem Livegang **geschlossener Test mit ≥ 12 Testern über 14 Tage**
      ([Play-Hilfe](https://support.google.com/googleplay/android-developer/answer/14151465)).
- [ ] **Zahlungsprofil** (Händlerkonto) verknüpfen – Voraussetzung für In-App-Käufe.
- [ ] **AdMob-Konto** anlegen → App hinzufügen (Android) → zwei Anzeigenblöcke: *Mit Prämie* (Rewarded) und *Interstitial*.
      IDs eintragen (siehe `android/README.md`, Abschnitt 2).
- [ ] In AdMob unter *Datenschutz & Mitteilungen* eine **DSGVO-Einwilligungsnachricht** erstellen und veröffentlichen.

## B. App vorbereiten

- [ ] **Paketname** festlegen (aktuell `app.lumenloop.game`, nach dem ersten Upload unveränderlich).
- [ ] **Upload-Schlüssel** erzeugen und als GitHub-Secrets hinterlegen → Workflow *Android* baut das signierte `.aab`.
- [ ] **Datenschutzerklärung** (`public/privacy.html`) mit Name, Anschrift und E-Mail füllen
      (gelb markierte Platzhalter) und über GitHub Pages veröffentlichen
      (*Settings → Pages → Source: GitHub Actions*, Branch `main`).
- [ ] Optional: `app-ads.txt` auf deiner Entwickler-Website hinterlegen (AdMob zeigt den Inhalt an) – erhöht die Werbeeinnahmen.

## C. Play Console: App anlegen

- [ ] App erstellen: Name „LUMEN LOOP“, Spiel, **kostenlos**, Standardsprache Deutsch.
- [ ] **Store-Eintrag**: Texte und Grafiken aus [`docs/store/LISTING.md`](store/LISTING.md).
- [ ] **In-App-Produkte** anlegen (IDs exakt so):

| Produkt-ID | Typ in der App | Preisvorschlag |
|---|---|---|
| `diamonds_80` | verbrauchbar | 0,99 € |
| `diamonds_450` | verbrauchbar | 4,99 € |
| `diamonds_1000` | verbrauchbar | 9,99 € |
| `diamonds_2200` | verbrauchbar | 19,99 € |
| `diamonds_6000` | verbrauchbar | 49,99 € |
| `starter_pack` | einmalig | 2,99 € |
| `no_ads` | einmalig | 3,99 € |
| `spark_aurora` | einmalig | 9,99 € (Funke Polarlicht + 500 Diamanten + 5.000 Splitter, ab Version 2.1.0) |
| `light_pass` | verbrauchbar | 4,99 € (Premium-Stufen des Lichtpasses für die laufende Saison, ab Version 2.2.0) |

> In Google Play sind alle sieben „In-App-Produkte“ (keine Abos). Ob ein Kauf verbraucht wird, entscheidet die App.

## D. Play Console: App-Inhalte (Pflichtformulare)

| Formular | Empfohlene Antwort für LUMEN LOOP |
|---|---|
| Datenschutzerklärung | URL von `privacy.html` |
| App-Zugriff | Alle Funktionen ohne Anmeldung verfügbar |
| Werbung | **Ja, die App enthält Werbung** |
| Werbe-ID | **Ja**, wird für Werbung genutzt (AdMob) |
| Zielgruppe | **13+** (nicht für Kinder – vermeidet die Familienrichtlinien und kindgerechte Werbepflichten) |
| Inhaltsbewertung (IARC) | Spiel; keine realistische Gewalt (abstrakte Lichtformen), keine Nutzerinteraktion/Chats, **In-App-Käufe: ja**. Erwartet: USK 0 / PEGI 3 mit Hinweis „In-Game-Käufe“ |
| Nachrichten-, Gesundheits-, Finanz-, Regierungs-App | Nein |

### Datensicherheit
Die App selbst sammelt nichts; erhoben wird ausschließlich durch das **Google Mobile Ads SDK**.
Grundlage: [Googles Datenoffenlegung für AdMob](https://developers.google.com/admob/android/privacy/play-data-disclosure) – vor dem Absenden bitte mit der aktuellen Fassung abgleichen.

| Frage | Antwort |
|---|---|
| Erhebt oder teilt die App Nutzerdaten? | Ja |
| Verschlüsselung bei der Übertragung | Ja |
| Löschanfrage möglich? | Spieldaten liegen nur lokal (Löschen über *Einstellungen → Spielstand löschen* oder Deinstallation) |

| Datentyp | Erhoben | Geteilt | Zweck |
|---|---|---|---|
| Standort → Ungefährer Standort (aus IP-Adresse) | Ja | Ja | Werbung, Analyse, Betrugsprävention |
| App-Aktivität → App-Interaktionen | Ja | Ja | Werbung, Analyse, Betrugsprävention |
| App-Info und -Leistung → Diagnosedaten | Ja | Ja | Analyse, Betrugsprävention |
| Geräte- oder andere IDs | Ja | Ja | Werbung, Analyse, Betrugsprävention |

## E. Testen → Veröffentlichen

1. [ ] **Interner Test**: `.aab` hochladen, eigenes Konto als Tester → App über den Testlink installieren.
       Prüfen: Einwilligungsdialog (EU), Testanzeigen (Wiederbeleben, Splitter ×2, Gratis-Diamanten),
       Interstitial erst ab der 4. Runde, Testkäufe mit Lizenztester-Konto, *Käufe wiederherstellen*, Zurück-Taste.
2. [ ] **Echte AdMob-IDs** eintragen, neue Version bauen (vorher **nie** auf eigene echte Anzeigen tippen – Kontosperre!).
3. [ ] **Geschlossener Test** mit ≥ 12 Testern für 14 Tage am Stück.
4. [ ] **Produktionszugriff** beantragen → Produktion → Rollout.

## F. Nach dem Start

- Preise und Inhalte der Pakete jederzeit in der Play Console änderbar (IDs bleiben).
- Neue Version: `versionCode` steigt im CI automatisch; `versionName` in `android/app/build.gradle` anpassen.
- Ab dem 31.08. jedes Jahres verlangt Google üblicherweise eine neue Ziel-API und Billing-Version – dann
  Capacitor und Plugins aktualisieren.
