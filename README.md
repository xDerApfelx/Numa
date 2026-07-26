# nu·ma

Das selbst entworfene Kartenspiel **Numa** als browserbasiertes Multiplayer-Spiel — per Link spielbar, ohne Installation, ohne Server-Kosten.

> **Alle Rechte vorbehalten.** Dieses Repository ist aus Hosting-Gründen öffentlich einsehbar, das ist keine Nutzungserlaubnis. Siehe [LICENSE](LICENSE) — keine kommerzielle Nutzung, kein Kopieren, keine Weiterverbreitung ohne Erlaubnis.

**Spielen:** https://xderapfelx.github.io/Numa/

## Wie es funktioniert

- 2–6 Spieler, ca. 20 Minuten. Ein Spieler erstellt einen Raum und teilt den 5-stelligen Code (oder den Einladungslink), die anderen treten bei. Freie Plätze lassen sich mit Bots füllen.
- Multiplayer läuft über WebRTC ([PeerJS](https://peerjs.com/)): Der Host-Browser führt die Spiellogik aus, alle anderen verbinden sich direkt mit ihm — es gibt keinen eigenen Server.
- Punkteziel und Joker sind in der Lobby einstellbar.

Die vollständigen Regeln stehen in der physischen Anleitung ([PDF/](PDF/)) bzw. in [numa-projektplan.md](numa-projektplan.md).

## Entwicklung

```bash
npm install
npm run dev      # Dev-Server (http://localhost:5173/Numa/)
npm test         # Vitest — komplette Spiellogik ist getestet
npm run build    # Produktions-Build nach dist/
```

Struktur: `src/game/` (pure, getestete Spiellogik), `src/net/` (PeerJS Host/Client + Protokoll), `src/ui/` (React-Komponenten, SVG-Karten). Karten-Galerie zur Sichtprüfung: `/?gallery`.

Die Ziel-Häufigkeiten der Aktionsverteilung sind Platzhalter in [src/game/config.ts](src/game/config.ts) (`ACTION_FREQUENCIES`) — dort die echten Balance-Werte eintragen, Summe muss 108 bleiben.

## Deployment

Jeder Push auf `main` baut und deployed automatisch über GitHub Actions auf GitHub Pages (einmalig in den Repo-Einstellungen unter *Pages* die Quelle „GitHub Actions" wählen).

## Hinweis zur Fairness

Der Host hält technisch bedingt alle Handkarten im Speicher (die UI zeigt sie niemandem). Ein Host mit offenen Entwicklertools könnte sie einsehen — für ein Spiel unter Freunden ein bewusst akzeptierter Trade-off.
