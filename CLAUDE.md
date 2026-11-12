# Hinweise für die Arbeit an LUMEN LOOP

## Texte, die Spieler sehen

Gilt für alle Texte im Spiel (`src/core/i18n.ts`, DE und EN), im Store (`docs/store/LISTING.md`) und in der
Datenschutzerklärung.

- **Vorgaben des Entwicklers nie in Spieltexte übernehmen.** Wenn eine Anweisung lautet „Polarlicht soll es nur
  für Echtgeld geben, nicht für Diamanten“, wird das im Code umgesetzt, aber nicht als Satz ins Spiel geschrieben.
  Falsch: „Gibt es nur hier im Shop, nicht für Diamanten.“ Kein normales Spiel erklärt dem Spieler, warum etwas
  so gebaut ist.
- **Schreiben, was der Spieler bekommt oder tun kann.** Ein Shop-Angebot zeigt, was der Inhalt kann (zum Beispiel
  die Fähigkeiten eines Funken) und was dabei ist, nicht wie er verkauft wird.
- **Normale Sprache.** Keine typischen KI-Formulierungen, keine Werbesprüche („Leicht zu lernen, schwer zu
  meistern“, „Einzigartig“, „Erlebe …“), kein Juristendeutsch. Kurze Sätze, wenige Gedankenstriche.
- **Pflichtangaben bleiben.** In der Datenschutzerklärung müssen Verantwortlicher, verarbeitete Daten,
  Rechtsgrundlagen und Rechte drinstehen. Sie werden in einfachen Worten erklärt, Paragrafen nur kurz in Klammern.
- **Zahlen prüfen.** Wenn ein Text Mengen nennt (Funken, Upgrades, Erfolge), mit dem Code abgleichen.

## Layout und Optik

- **Gleiche Höhen, gleiche Abstände.** Elemente in einer Leiste haben dieselbe Höhe und Form (`--bar-h`), Abstände
  kommen aus einem festen Maß (`--gap`). Zwischen Kopfleiste und Inhalt ist immer Luft.
- **Bündig und parallel.** Preise und Buttons am Zeilenende stehen in einer Spalte gleicher Breite untereinander.
- **Keine Kästen in Kästen**, wenn ein Kasten nur ein einzelnes Element enthält.
- **Kein Umbruch zwischen Zahl und Einheit.** In Texten ein geschütztes Leerzeichen verwenden (`50\u00a0%`,
  `0,5\u00a0s`). Keine automatische Silbentrennung.
- **Hintergrund bleibt ruhig.** Hinter Menüs keine grellen Effekte: Die Demo-Runde läuft nur im Hauptmenü, gedimmt
  und im ruhigen Effektmodus (`fx.calm`), ohne Texte, Blitze oder weiße Funken. In Untermenüs nur Lichtpunkte.
- **Effekte im Spiel nicht überladen.** Weiß sparsam einsetzen, Bildschirmblitze kurz und schwach halten,
  bei Mehrfach-Treffern nicht zig Zahlen übereinander stapeln.
- **Was etwas kann, muss man sehen.** Funken, Shop-Angebote und Upgrades zeigen ihre Wirkung (zum Beispiel als
  Liste mit Vor- und Nachteilen). Premium-Inhalte müssen sich sichtbar vom Standard abheben.
- **Nach UI-Änderungen Screenshots ansehen**, auf 320 px und auf normaler Handybreite.

## Prüfen vor dem Commit

```bash
npx tsc --noEmit && npx vitest run && npm run build && npm run smoke
```
