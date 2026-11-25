# Pagine

Una pagina è un documento Markdown nella barra laterale. Usala per il testo che non è una lista di task: appunti di una riunione, un piano, un README. Una pagina è salvata come testo semplice, esattamente come lo scrivi, e può essere mostrata formattata.

## Creare una pagina

- Premi `Ctrl+Maiusc+N`.
- Oppure usa **Nuova pagina** nel menu **File**, nell'intestazione della barra laterale, nel menu di una cartella o nel menu dell'area vuota dell'albero.

Una pagina sta nell'albero come una nota: puoi metterla in una cartella, rinominarla, spostarla con il trascinamento, aprirla in un tab o nella [vista divisa](./folders-and-notes#dividere-in-due-aree), duplicarla, archiviarla, eliminarla (finisce nel [cestino](./trash-and-archive)) ed esportarla.

## Scrivere e anteprima

Una pagina si apre come editor di testo. Scrivi in Markdown. Il testo si salva da solo poco dopo che smetti di scrivere, e quando chiudi la pagina.

Per vedere la pagina formattata, clicca il pulsante **testo / anteprima** nella barra del percorso sopra la pagina (**Mostra l'anteprima formattata**, poi **Mostra il testo Markdown**). La scelta è ricordata per ogni pagina e ogni area.

L'anteprima supporta:

- titoli, **grassetto** e *corsivo*;
- elenchi puntati e numerati, citazioni e linee orizzontali;
- `codice in linea` e blocchi di codice;
- liste di controllo (`- [ ]` e `- [x]`): clicca una casella nell'anteprima per spuntarla, e il testo viene cambiato per te;
- link scritti come `[testo](indirizzo)` e indirizzi semplici (`http`, `https` e `mailto`). Usa `Ctrl`+clic per aprire un link nel browser.

L'HTML grezzo non viene mai eseguito: è mostrato come testo.

## Annulla e ripeti

`Ctrl+Z` e `Ctrl+Y` funzionano anche dentro il testo. Ogni serie di digitazione, salvata dopo una pausa, è un passo della [cronologia](./undo-and-history) chiamato "Modifica il testo della pagina". I passi restano anche dopo il passaggio all'anteprima.

## Cercare

- `Ctrl+K` trova anche le parole dentro il testo delle pagine. Le pagine che corrispondono sono elencate sotto **Nel testo delle pagine**, con un pezzo di testo.
- `Ctrl+F` (o il pulsante di ricerca della barra del percorso) cerca dentro la pagina aperta, nel testo e nell'anteprima, con il contatore e i pulsanti avanti e indietro.

## Esportare

Nel menu di una pagina, **Copia come Markdown** ne copia il testo ed **Esporta PDF** apre la finestra di stampa del sistema, dove puoi scegliere **Salva come PDF**. La pagina viene stampata formattata, come nell'anteprima.

## Cosa non ha una pagina

La barra del percorso di una pagina ha il percorso, la ricerca, la vista divisa e il pulsante testo / anteprima. Gruppi, tag, **Nascondi i task completati**, [automazioni](./automations) e [template](./templates) sono solo per le note.

Una versione precedente di EasyTask non può aprire un database che contiene pagine (vedi [Dati e backup](./data-and-backups#versioni-precedenti-di-easytask)), e mostra come nota vuota una pagina importata da un file.
