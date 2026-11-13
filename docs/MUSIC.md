# Musik

Ohne weitere Dateien erzeugt das Spiel seine Musik selbst (`src/audio/music.ts`): jedes Gebiet hat ein eigenes
Thema mit eigener Tonart, eigenem Tempo und einer Melodie, dazu ein Menü-Thema und Bossmusik.

## Eigene Musikdateien einbauen

Echte Aufnahmen ersetzen die erzeugte Musik dort, wo eine Datei vorhanden ist. Für alles andere läuft weiter
die erzeugte Musik.

1. Die Dateien nach `public/music/` legen. Am besten **OGG** oder **MP3**, 96–160 kbit/s, nahtlos loopbar,
   Lautheit etwa −14 LUFS (sonst sind Musik und Effekte unterschiedlich laut).
2. Daneben `public/music/tracks.json` anlegen, zum Beispiel:

```json
{
  "menu": "menu.ogg",
  "boss": "boss.ogg",
  "region0": "nebelmeer.ogg",
  "region1": "glutwueste.ogg",
  "region2": "tiefsee.ogg",
  "region3": "aurora.ogg",
  "region4": "leere.ogg",
  "region5": "kristallgrotte.ogg"
}
```

Fehlende Einträge sind in Ordnung: Dann spielt dort die erzeugte Musik. Zwischen den Stücken blendet das Spiel
über, die Lautstärke-Regler und das Abdämpfen in Menüs gelten auch für die Dateien.

## Rechte

Nur Musik verwenden, die du nutzen darfst: eigene Stücke, gekaufte Lizenzen oder CC0. Die Lizenz am besten als
Textdatei mit in `public/music/` legen und im Store-Eintrag oder in den Einstellungen die Urheber nennen, wenn die
Lizenz das verlangt.

## Größe

Jedes Stück macht die App größer (ein 3-Minuten-Stück in OGG mit 128 kbit/s sind etwa 3 MB). Acht Stücke sind
also gut 20 MB, das ist noch unproblematisch.
