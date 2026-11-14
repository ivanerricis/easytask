# Introduzione

EasyTask è una todo list per desktop basata sui workspace, ispirata a strumenti come Notion, Obsidian e Trello. Tutto viene salvato in locale sul tuo computer.

![Una nota aperta con gruppi e sezioni colorati e i suoi task, l'albero delle cartelle a sinistra, i tab in alto e il pannello dei dettagli a destra](../../screenshots/it/workspace-light.png){.light-only}
![Una nota aperta con gruppi e sezioni colorati e i suoi task, l'albero delle cartelle a sinistra, i tab in alto e il pannello dei dettagli a destra](../../screenshots/it/workspace-dark.png){.dark-only}

## Struttura

Ogni workspace contiene cartelle e note. Una nota contiene gruppi, i gruppi contengono sezioni, le sezioni contengono task e i task possono contenere sottotask.

```text
Workspace
 ├── Cartelle (annidabili)
 │    └── Note
 └── Note
      └── Gruppi
           └── Sezioni
                └── Task
                     └── Sottotask (annidabili)
```

Cartelle e sottotask si annidano senza limiti. Gruppi e sezioni possono restare senza nome.

## Funzioni principali

- **Workspace** con cartelle e note proprie. Vedi [Workspace](./workspaces) e [Cartelle e note](./folders-and-notes).
- **Gruppi, sezioni, task e sottotask**, con rinomina sul posto e drag and drop. Vedi [Gruppi, sezioni e task](./groups-sections-tasks).
- **Colori** su qualsiasi elemento. Vedi [Colori](./colors).
- **Automazioni**: regole per nota che agiscono su task e gruppi quando succede qualcosa. Vedi [Automazioni](./automations).
- **Template**: salva una nota come template e crea nuove note a partire da essa. Vedi [Template](./templates).
- **Cestino e archivio**: ripristina ciò che hai eliminato, oppure nascondi ciò che non ti serve ora. Vedi [Cestino e archivio](./trash-and-archive).
- **Annulla e ripeti** con la cronologia delle azioni. Vedi [Annulla e cronologia](./undo-and-history).
- **Audio**: allega file audio a una nota e ascoltali nell'app. Vedi [Audio](./audio).
- **Ricerca delle note** e **scorciatoie da tastiera personalizzabili**. Vedi [Scorciatoie da tastiera](./shortcuts).
- **Vista divisa**: due note affiancate, ognuna con i suoi tab. Vedi [Cartelle e note](./folders-and-notes#dividere-in-due-aree).
- **Sfondo della nota**: un colore dietro tutta la nota. Vedi [Colori](./colors#sfondo-della-nota).
- **Esporta e importa** un workspace come file `.easytask.json`, oppure `.easytask.zip` con audio, immagini e video.
- Interfaccia in **italiano e inglese**, nove temi predefiniti (anche ad alto contrasto) e temi personalizzati. Vedi [Temi](./themes).
- **Aggiornamenti** con versioni firmate. Vedi [Aggiornamenti](./updates).

### Impostazioni

Le impostazioni hanno una casella di ricerca per trovare un'opzione dal nome. Tra le opzioni:

- avviare EasyTask con il sistema e chiuderlo nell'area di notifica (**Sistema**);
- svuotare il cestino in automatico dopo un certo numero di giorni, scegliere ogni quanto fare il backup automatico e in quale cartella salvarlo (**Dati**);
- scegliere se i nuovi task vanno in cima o in fondo, la densità dell'elenco dei task e attivare o disattivare il controllo ortografico (**Note e sezioni**).

Vedi [Impostazioni](./settings).

## Piattaforme

| Piattaforma | Note |
| --- | --- |
| Windows 10/11 (64 bit) | Installer o zip portable |
| Linux | `.deb` e `.AppImage` |

Non sono previste build per macOS. Vedi [Installazione](./install).

## Dove sono i tuoi dati

I dati restano in una cartella locale, in un database SQLite, con backup automatici. Vedi [Dati e backup](./data-and-backups).

## Prossimi passi

[Installa](./install) l'app, poi segui [Primi passi](./getting-started).
