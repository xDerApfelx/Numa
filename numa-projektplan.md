# Numa — Projektplan für die digitale Umsetzung

Dieses Dokument ist die Übergabe-Grundlage für die Implementierung. Es fasst alles zusammen, was bisher zu Regeln, Architektur, Tech-Stack und Hosting geklärt wurde. Abschnitt 8 listet offene Punkte, die im Zweifel nachgefragt statt geraten werden sollten.

---

## 1. Überblick

Numa ist ein selbst entworfenes physisches Kartenspiel (2–6 Spieler, ca. 20 Min. Spielzeit), das zu einem browserbasierten Multiplayer-Spiel werden soll. Kein kommerzielles Projekt — Ziel ist, dass man Kollegen/Freunden einen Link schicken kann und direkt zusammen spielen kann, ohne Installation, ohne laufende Kosten.

**Harte Anforderungen:**
- Web-basiert, per Link spielbar (kein Installer, kein App Store)
- Multiplayer über WebRTC, kein eigener Server nötig
- Lobby vor Spielstart: Spieleranzahl wählen, optional Bots auffüllen
- Null laufende Kosten (kein Hosting-Abo)
- Aktuelle, gut gepflegte Technologien — keine veralteten, zufällig gepinnten Paketversionen

---

## 2. Tech-Stack (Entscheidung + Begründung)

| Bereich | Wahl | Warum |
|---|---|---|
| Build-Tool | **Vite** | Standard-Scaffolding-Tool, `npm create vite@latest` holt immer die aktuelle Version, kein Altlast-Setup wie bei älteren Tools |
| UI | **React + TypeScript** | Größte Trainingsdaten-Abdeckung für KI-Coding-Agenten (weniger Halluzinationsrisiko bei Fable/Claude Code), riesiges Ökosystem, für ein Projekt dieser Größe völlig ausreichend ohne Overengineering |
| State Management | React `useState`/`useReducer`/Context — **kein** Redux/Zustand/etc. | Die Spiellogik läuft an einer Stelle (beim Host), der State ist nicht komplex genug, um eine zusätzliche Library zu rechtfertigen |
| Multiplayer | **PeerJS** (WebRTC) | Kostenloser Cloud-Signaling-Server, kein eigener Server nötig, kurze Peer-IDs lassen sich direkt als Raum-Code verwenden. Aktuell (Stand Juli 2026) weiterhin aktiv und gepflegt. Alternative wäre Trystero (noch weniger Infrastruktur, dezentraleres Signaling) — PeerJS reicht aber für den Host-Modell-Ansatz unten völlig und hat die einfachere API |
| Styling/Grafik | Reines CSS + SVG, kein UI-Framework wie Tailwind/MUI | Der Look soll eng an den bestehenden Numa-Vektor-Assets hängen, ein generisches Design-System würde eher stören als helfen |
| Hosting | **GitHub Pages** über GitHub Actions | Kostenlos, direkt am vorhandenen GitHub-Account, kein Backend nötig, siehe Abschnitt 7 |

**Zum Versions-Problem:** `npm create vite@latest` und `npm install <paket>` (ohne Versionsnummer) installieren immer die aktuell neueste Version. Damit das so bleibt, sollte `package.json` mit Caret-Ranges (`^18.0.0` statt `18.0.0` fest) arbeiten, und von Zeit zu Zeit `npm outdated` bzw. `npm update` laufen. Wenn Fable/Claude Code beim Setup gezielt `npm create vite@latest` und `npm install <paket>` ohne Versionsangabe nutzt, sollte das “alte-Version”-Problem nicht auftreten.

---

## 3. Architektur

### Host-Modell (Sterntopologie)
Statt vollem Mesh (jeder mit jedem, bei 6 Spielern 15 Verbindungen) übernimmt eine Person die Host-Rolle:
- Der Host führt die eigentliche Spiellogik aus (mischen, austeilen, Stiche werten, Regelkarte ziehen)
- Alle anderen Spieler verbinden sich einzeln nur mit dem Host (max. 5 Verbindungen bei 6 Spielern — laut PeerJS-Dokumentation problemlos machbar, empfohlen werden bis zu 5–10 gleichzeitige Verbindungen pro Peer)
- Vorteile: Bots sind für den Host einfach zusätzliche simulierte Spieler ohne eigene Verbindung, Lobby-Logik läuft zentral
- Nachteil: fällt der Host raus, pausiert die Runde — für ein Hobby-Spiel unter Kollegen unkritisch

**Wichtig zur Privatsphäre der Handkarten:** Damit der Host Züge validieren und Runden auswerten kann, muss sein Programm zwangsläufig die Handkarten aller Spieler im Speicher halten. Die Oberfläche zeigt niemandem — auch dem Host nicht — fremde Karten an. Aber ein Host, der die Browser-Entwicklertools öffnet, könnte diese Daten technisch einsehen. Das lässt sich ohne eigenen vertrauenswürdigen Server (= wieder laufende Kosten) oder aufwändige Verschlüsselung nicht vollständig verhindern. Für ein lockeres Spiel unter Kollegen ist das ein akzeptabler Trade-off (Vertrauensbasis statt technischer Garantie) — sollte aber bewusst so entschieden sein und nicht später überraschen.

### Raum-Code
Der Host erzeugt beim Start einen kurzen Code (z. B. 5 Zeichen, ohne verwechselbare Zeichen wie 0/O oder 1/I) und nutzt ihn direkt als PeerJS-Peer-ID (`new Peer(code)`). Mitspieler geben den Code ein und verbinden sich per `peer.connect(code)`. Kein zusätzlicher eigener Server für die Code-Verwaltung nötig.

### Datenfluss
- Lobby-Phase: Host broadcastet den aktuellen Lobby-Zustand (wer ist da, wie viele Bots, Spieleranzahl) bei jeder Änderung an alle verbundenen Peers
- Spiel-Phase: Host validiert und resolved jeden Zug (siehe Rundenablauf unten), broadcastet danach den neuen öffentlichen Zustand; private Infos (eigene Handkarten) gehen nur an den jeweiligen Spieler

### Referenz-Implementierung
Es existiert bereits ein funktionierender Prototyp der Lobby- und Verbindungsschicht (Vanilla JS + PeerJS, dunkles Theme in Numa-Farben) — kann als Vorlage für die Lobby-Logik dienen, auch wenn die finale Version in React/TypeScript entstehen sollte.

---

## 4. Spielregeln (vollständig, nach der offiziellen aktuellen Anleitung)

### Kartenübersicht (189 Karten gesamt)
| Kartentyp | Anzahl | Aufbau |
|---|---|---|
| Aktionskarten | 108 | 4 Farben × Zahlen 1–9 × 3 Kopien |
| Zahlenlose | 12 | 4 Farben × 3 Kopien, zeigen "?" statt Zahl, Aktion immer "Wert kopieren" |
| Farblose | 18 | Zahlen 1–9 × 2 Kopien, keine Farbe, Aktion immer "Farbe kopieren" |
| Joker | 8 | 4 Typen × 2 Kopien |
| Regelkarten | 30 | 4 Farben × 7 Bedingungen (28) + 2 schwarze Sonderkarten |
| Cheat-Sheets | 12 | 6 Aktions- + 6 Joker-Sheets |
| Startspielerkarte | 1 | Marker |

**Die vier Kartenfarben heißen offiziell Rot, Grün, Blau, Gelb** — nicht Orange/Türkis, wie an früherer Stelle in diesem Dokument fälschlich angenommen; korrigiert nach dem tatsächlichen Anleitungstext.

### Setup
- 2–6 Spieler, jeder bekommt 7 Handkarten, verdeckt vor den anderen
- Regelkartenstapel liegt mit der Vorderseite nach oben; oberste Karte = aktuelle Regelkarte in der Mitte, die nächste bleibt als **Vorschau-Regelkarte** sichtbar
- Übrige Karten bilden den verdeckten Nachziehstapel; ist er leer, werden die verbrauchten Karten neu gemischt

### Spielende / Zielanzahl (bewusst NICHT fest vorgeschrieben)
Die physische Anleitung hatte eine feste Tabelle (2 Spieler=9, 3=8, 4=7, 5=6, 6=5 Regelkarten zum Sieg) — das war laut Bero nur eine Formalität für eine ungefähre Spieldauer, kein zentraler Spielmechanismus. **Für die digitale Version soll diese feste Kopplung an die Spieleranzahl weggelassen werden.** Sinnvolle Alternativen, die Fable frei wählen oder sogar als Option anbieten kann:
- Festes Punkteziel unabhängig von der Spieleranzahl (z. B. erster bei 20 Punkten gewinnt)
- Feste Rundenzahl oder Zeitlimit, danach gewinnt der Punktestand
- Endloses Spiel ohne festes Ende (wie bei Uno) — man hört auf, wann man will
- Regelkarten werden nach Gewinn wieder in den Nachziehstapel gemischt statt dauerhaft "eingesammelt" zu werden (verändert das Punktesystem grundlegend, aber ebenfalls denkbar)

Das ist eine reine Geschmacksfrage, keine Kernregel — muss vor dem Implementieren nur einmal festgelegt werden.

### Rundenablauf
1. Startspieler-Marker startet beim linken Sitznachbarn des Kartengebers, wechselt pro Runde im Uhrzeigersinn
2. Oberste Regelkarte legt das Rundenziel fest (Farbe + Bedingung)
3. Der Reihe nach, beginnend beim Startspieler, legt jeder Spieler **eine** Handkarte verdeckt ab — optional zusammen mit einem Joker. Der Pfeil auf der Rückseite wird auf linken Nachbarn, rechten Nachbarn oder sich selbst ausgerichtet. Nur direkte Nachbarn sind erlaubt, nicht über den Tisch hinweg
4. Die Pfeilrichtung ist beim Ablegen für alle sichtbar, Zahl/Farbe/Aktion auf der Vorderseite bleiben bis zum Aufdecken geheim → Bluff-Element
5. **Hat der letzte Spieler gelegt, wird aufgedeckt und die Aktionen werden der Reihe nach ab dem Startspieler ausgeführt.** Dabei werden **Joker immer zuerst ausgeführt**, beginnend mit dem Joker, der dem Startspieler am nächsten sitzt — erst danach die normalen Aktionen in Ablage-Reihenfolge. Die Reihenfolge verändert das Ergebnis
6. Gewinner-Ermittlung (siehe eigener Abschnitt unten)
7. Alle Spieler ziehen nach, bis wieder 7 Handkarten erreicht sind; die Startspielerkarte wandert zum nächsten Spieler

### Gewinner-Ermittlung (offizielle Priorität)
1. **Farbe zuerst**: nur Karten, deren finale Farbe (nach allen Aktionen) zur Regelkarte passt, sind grundsätzlich zulässig. **Bedient niemand die geforderte Farbe, entfällt diese Bedingung ersatzlos** — dann sind alle gelegten Karten zulässig und es wird direkt nach Schritt 2/3 entschieden (das war zuvor ein offener Punkt, jetzt durch die offizielle Anleitung geklärt)
2. **Gerade/Ungerade**: unter den zulässigen Karten gewinnen bevorzugt die, die die Paritätsbedingung der Regelkarte erfüllen
3. **Hoch/Niedrig/Mittel**: verbleibender Tiebreak — wer der Zahlenbedingung am nächsten kommt, gewinnt. Erfüllt niemand die Paritätsbedingung, wird direkt unter allen farblich zulässigen Karten nach diesem Kriterium entschieden

Beispiel aus der Anleitung: Regelkarte "Gelb, Gerade Hohe Zahlen". Gespielt werden eine gelbe 5, eine grüne 8, eine gelbe 3, eine rote 3. Nur die gelben Karten (5 und 3) sind farblich zulässig, keine davon ist gerade — also entscheidet direkt die höchste gelbe Zahl: die 5 gewinnt, obwohl sie ungerade ist.

### Aktionen
**Aktionen sind nicht an Farben gebunden — jede Farbe kann jede Aktion tragen**, es gibt keine feste Zuordnung (bestätigt durch die offizielle Anleitung). Das validiert die Idee der dynamischen Verteilung unten: es gab nie eine feste Farbe-Aktion-Kopplung, die "erhalten" werden müsste — nur die Gesamthäufigkeit pro Aktion war/ist balanciert.

Aktionsliste für die 108 normalen Zahlenkarten:
| Aktion | Effekt |
|---|---|
| Wert ändern (+) | Erhöht den Kartenwert um 1 |
| Wert ändern (−) | Senkt den Kartenwert um 1 |
| Schild | Wehrt eine gegen einen selbst gerichtete Aktion ab |
| Spiegel | Reflektiert eine gegen einen selbst gerichtete Aktion auf den Angreifer zurück |
| Farbe tauschen | Tauscht die eigene Farbe mit der Farbe des Nachbarn |

Die beiden Sonderkategorien haben eine fest zugeordnete, nicht-verteilte Aktion:
- **Farblose Karten** (18, Zahl 1–9 ohne Farbe): immer "Farbe kopieren" — kopiert die Farbe eines Nachbarn. Zeigen zwei Farblose aufeinander, bleiben beide farblos
- **Zahlenlose Karten** (12, "?" statt Zahl): immer "Wert kopieren" — kopiert die **aktuelle**, nicht die aufgedruckte Zahl eines Nachbarn. Zeigen zwei "?" aufeinander, bleiben beide wertlos

**"Aktion kopieren" ist nicht mehr Teil der aktuellen Aktionsliste** — bestätigt Beros Erinnerung. Das Icon taucht in einem älteren Beispielbild noch auf, gehört aber nicht zur offiziell beschriebenen Aktionsliste.

Aktionen können auf einen Nachbarn ODER auf sich selbst gerichtet werden.

### Schwarze Regelkarten (2 von 30, optional)
Zweck: schlechte Hände reparieren (z. B. nur eine Farbe auf der Hand, obwohl gerade eine andere gefordert ist). Die physische Anleitung beschreibt eine binäre Variante (komplette Hand tauschen oder ablehnen) — im Team war man sich darüber aber nicht einig, und Bero bevorzugt für die digitale Version eine andere Lösung: **einzelne Handkarten nach eigener Wahl abwerfen und dieselbe Anzahl neu nachziehen**, sodass man immer bei 7 Karten bleibt, statt alles auf einmal zu tauschen. Diese Variante soll umgesetzt werden. Nach Gebrauch wird die schwarze Regelkarte aussortiert (Einmal-Effekt), kein Einfluss auf den "Neue Regelkarte"-Joker.

### Dynamische Aktionsverteilung (Vorschlag)

Im physischen Original war die Zuordnung, welche konkrete Zahl welche Aktion trägt, fest vorgegeben (von einem Kollegen mit einem Python-Skript balanciert, damit keine Zahl systematisch zu stark wird) — aber wie oben bestätigt, war Farbe dabei ohnehin nie ausschlaggebend, nur die Gesamthäufigkeit pro Aktion. Für die digitale Version bietet sich an, die Zuordnung Aktion→Zahl (für die 5 Aktionen der 108 Zahlenkarten) **pro Spiel-Session zufällig neu zu würfeln**, unter Einhaltung der ursprünglich angestrebten Gesamthäufigkeit je Aktion. Das:
- erhält die ursprüngliche Balance-Absicht (gleiche Gesamthäufigkeiten je Aktion)
- sorgt für Abwechslung zwischen Spielsitzungen, ohne dass sich Spieler starre Zahl-Aktion-Kombinationen einprägen können
- ist technisch simpel: Ziel-Häufigkeiten pro Aktion als Liste aufstellen, zufällig auf die 108 Zahlenkarten-Slots verteilen (Fisher-Yates-Shuffle o. ä.), einmal zu Beginn einer Session — nicht jede Runde neu, damit der Zustand innerhalb eines Spiels konsistent bleibt

**Vorgehen für den Start:** Fable soll zunächst mit selbst gewählten, plausiblen Platzhalter-Häufigkeiten implementieren (als klar benannte, zentrale Konfigurationswerte, nicht hart im Code verstreut). Bero liefert die tatsächlichen, im Team berechneten Zielwerte nach, sobald er sie zusammengestellt hat — reiner Parameter-Austausch, keine strukturelle Änderung.

### Joker
Müssen immer zusammen mit einer normalen Handkarte gespielt werden (Aktionskarte, Zahlenlose oder Farblose), nie allein. Die begleitende Karte nimmt regulär am Stich teil und kann die Runde gewinnen. **Der Joker selbst ist nur aktiv, wenn die begleitende Karte dieselbe Farbe wie die Regelkarte hat** — sonst verfällt nur der Joker, die Karte bleibt gültig. Joker können nicht untereinander kombiniert werden. Beim Aufdecken werden alle Joker zuerst ausgeführt (Reihenfolge ab dem Startspieler), erst danach die normalen Aktionen.

| Joker | Effekt |
|---|---|
| Alle Karten verschieben | Je nach Jokerrichtung werden alle ausgespielten Karten der Runde um eine Position verschoben |
| Neue Regelkarte | Aktuelle Regelkarte kommt unter den Stapel, wird durch die nächste ersetzt; die begleitende Handkarte muss die Farbe der **Vorschau-Regelkarte** bedienen |
| Zweiter gewinnt | Die zweitbeste Karte der Runde gewinnt. Gibt es zwei erste Plätze, ist die dritte Person Zweiter |
| Nur eigene Aktion zählt | Nur die eigene Aktion wird in der Runde ausgeführt (Joker selbst ausgenommen) |

Für Einsteiger empfiehlt die Anleitung, Joker zunächst wegzulassen. Bero ist unentschlossen, ob sie von Anfang an mitgebaut werden sollen — findet es aber unproblematisch, schon früh in diese Richtung zu entwickeln, keine Notwendigkeit, sie komplett auf später zu verschieben.

### Unentschieden / Pool-Mechanik
**Basisregel:** Bei einem Unentschieden wandert die Regelkarte umgedreht in den "Pool". Es kann **immer nur eine** Regelkarte im Pool sein. Kommt eine weitere hinzu, während der Pool schon voll ist, wird sie komplett aus dem Spiel entfernt statt sich anzusammeln. Der Gewinner der nächsten Runde bekommt die neue Regelkarte plus die Pool-Karte.

**Optionale Variante "Pool Extrem"** (das ist die Variante, die Bero für die digitale Umsetzung gewählt hat): bei jedem Unentschieden wandert die Regelkarte in den Pool, beliebig viele können sich ansammeln (auch schwarze Regelkarten), bis jemand den Pool durch einen Sieg abräumt.

### Bekannte Randfälle (aus dem Playtesting, jetzt größtenteils durch die offizielle Anleitung geklärt)

- **Farblose Karte ohne gültiges Kopierziel**: bleibt farblos, wenn nichts Gültiges zu kopieren ist (z. B. zwei Farblose zeigen aufeinander) — kann dann keine Regelkarte gewinnen, da Farblos keine der vier Regelkartenfarben ist
- **Falsche Farbe kann nie gewinnen, außer niemand hat die geforderte Farbe gespielt** — dann entfällt die Farbbedingung (siehe Gewinner-Ermittlung oben). Das war der zuvor offene Punkt, jetzt durch die offizielle Anleitung geklärt
- **"Wert kopieren" kopiert den aktuellen, nicht den aufgedruckten Wert** — deshalb ist die Ausführungsreihenfolge entscheidend: wird der Zielwert vorher durch eine andere Aktion verändert, kopiert man den neuen Wert

---

## 5. Digitale Anpassungen gegenüber dem physischen Original

- **Karten gehen nie aus**: anders als beim physischen Spiel (wo ständig neu gemischt werden musste) können Regel- und Handkarten digital beliebig oft "nachkommen" — einfach den Stapel bei Bedarf neu mischen/generieren
- **Digitale Punktzählung** statt physischer Kartenstapel neben dem Spieler
- **Wichtig, nicht nur "nice to have"**: Bei "Farbe kopieren" / "Wert kopieren" / "Wert ändern" sollte sich die betroffene Karte während der sequenziellen Auflösung sichtbar verändern (Farbe/Zahl aktualisiert sich live, während jede Aktion der Reihe nach ausgeführt wird). Da die exakte Reihenfolge das Ergebnis so stark beeinflusst (siehe Randfälle in Abschnitt 4), muss für die Spieler nachvollziehbar sein, was in welchem Moment passiert ist — sonst wirkt das Ergebnis willkürlich. Sollte schon für die erste spielbare Version mitgedacht werden, auch wenn die Umsetzung zunächst simpel bleibt (z. B. kurzer Farbwechsel + Zahl-Update statt aufwändiger Animation)

---

## 6. Visuelles Design

- Vektor-/SVG-Stil, keine gerasterten Bilder — passt zum vorhandenen Numa-Look (dunkler Hintergrund, klare Farbflächen, reduzierte Iconografie) und lässt sich verlustfrei skalieren
- Farbpalette an den bestehenden Numa-Farben orientieren: Rot, Grün, Blau, Gelb auf dunklem Grund — nicht neu erfinden
- **Vollständige Karten-PDFs (Regelkarten, Aktionskarten, Joker, Startspieler, Vorder- und Rückseiten) liegen bereits vor** und werden direkt an Fable übergeben — diese müssen nicht neu erstellt oder von Claude generiert werden, einfach als Vorlage/Assets einbinden
- **Die gesamte Website (Lobby, Menüs, HUD, nicht nur die Karten selbst) sollte gestalterisch zum Karten- und Logo-Design passen** — gleiche Farbpalette, gleiche Typografie-Anmutung, gleicher dunkler Hintergrund mit dem roten Akzent-Motiv wie im "nu·ma"-Logo, damit es aus einem Guss wirkt und nicht wie ein generisches UI-Template über handgemachten Karten
- Referenzpunkt für Qualität: eine Demo-Kartenillustration wurde bereits als reiner Code-generierter Vektor erstellt (Datei liegt bei), zeigt den angestrebten Detailgrad für Kartenrahmen, Icons, Farbverläufe — hilfreich als Stil-Anhaltspunkt, ersetzt aber nicht die echten Assets

---

## 7. Hosting-Plan (GitHub Pages)

Verifiziert (Stand Juli 2026): GitHub Pages ist für öffentliche Repositories kostenlos, mit 1 GB Größenlimit, einem weichen Bandbreitenlimit von 100 GB/Monat und 10 Builds/Stunde — für ein Hobby-Kartenspiel unter Freunden bei Weitem ausreichend. Kein Backend/Server-Code möglich, aber das braucht dieses Projekt dank WebRTC + PeerJS Cloud auch nicht.

**Setup:**
1. Öffentliches GitHub-Repo anlegen (wie bei `NullChat` bereits vorhanden)
2. In `vite.config.ts` den `base`-Pfad auf `/<repo-name>/` setzen (nötig, weil GitHub Pages Projektseiten unter `https://<username>.github.io/<repo-name>/` liegen)
3. GitHub Actions Workflow einrichten, der bei jedem Push auf `main` automatisch baut (`npm run build`) und den `dist`-Ordner nach GitHub Pages deployed
4. In den Repo-Einstellungen unter „Pages" die Quelle auf „GitHub Actions" stellen
5. Ergebnis: fester Link wie `https://xderapfelx.github.io/numa/`, den man einfach an Kollegen schicken kann — jeder Push aktualisiert die Seite automatisch

**Warum nicht als .exe/Installer:** Ein Electron-Installer wäre plattformspezifisch (Windows/Mac/Linux getrennt), deutlich größer, müsste manuell verteilt und aktualisiert werden, und Kollegen müssten etwas installieren statt einfach einen Link zu öffnen. Für den gewünschten Use-Case ("geht auf diese Webseite") ist der Web-Link eindeutig die bessere Wahl.

---

## 8. Offene Punkte

Nach der offiziellen Anleitung sind fast alle vorherigen Unsicherheiten geklärt (Spieleranzahl, Farbe-zu-Aktion-Zuordnung, Joker-Details, Verhalten bei fehlender Farbe, Status von "Aktion kopieren"). Es bleiben:

- **Exakte Ziel-Häufigkeiten je Aktion** (wie oft welche Aktion vorkommen soll) — Bero liefert diese nach, Fable startet mit Platzhaltern (siehe Abschnitt 4)
- **Ob der Host technisch Zugriff auf fremde Handkarten haben darf** (siehe Abschnitt 3) — aktuell als akzeptierter Trade-off dokumentiert, aber bewusst nochmal bestätigen

---

## 9. Vorgeschlagene Vorgehensweise (Phasen)

1. Repo aufsetzen (Vite + React + TS), Lobby- und Verbindungsschicht bauen (Referenz-Prototyp liegt vor)
2. Grundlegenden Spielloop mit Platzhalter-Grafiken umsetzen (Regelkarte anzeigen, Karten ablegen, Reihenfolge-Aufdecken, Punktevergabe, Pool-Mechanik)
3. Echte Kartendaten/SVGs einbinden, sobald verfügbar
4. Bots (zunächst simple/zufällige Logik, später verfeinern)
5. Joker optional zuschaltbar machen
6. Polish: Animationen (Farbe/Wert-Morph), ggf. Soundeffekte
7. Playtesting mit Kollegen über den GitHub-Pages-Link, Feedback einarbeiten

---

## 10. Hinweis für die Umsetzung

Dieses Dokument fasst den aktuellen Wissensstand zusammen. Bei Widersprüchen zwischen diesem Plan und einer möglicherweise vorliegenden älteren PDF-Anleitung gilt dieser Plan als aktueller. Bei den in Abschnitt 8 gelisteten offenen Punkten lieber nachfragen als eine Annahme zu treffen, die später schwer zu ändern ist.

**Wichtig zur Verbindlichkeit:** Das grobe Spielprinzip (Rundenablauf, Gewinner-Ermittlung, Bluff-Mechanik über die Pfeilrichtung) ist fest und sollte eingehalten werden. Einzelne Zahlenwerte und Detailregeln (genaue Kartenanzahl, exakte Balance-Häufigkeiten, Zielanzahl Regelkarten, Feinheiten der Schwarzen Regelkarten) sind dagegen bewusst als Vorlage gedacht, nicht als exakte Spezifikation — hier sind kleinere Anpassungen und Verbesserungen im Sinne des Spiels ausdrücklich erwünscht, kein Grund für Rückfragen.
