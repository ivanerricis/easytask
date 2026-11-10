# Gruppi, sezioni e task

Il contenuto di una nota è organizzato su tre livelli. Una nota contiene dei **gruppi**, affiancati come colonne. Un gruppo contiene delle **sezioni**, impilate nella colonna. Una sezione contiene dei **task**, e un task può avere dei **sottotask**, annidati quanto serve. Un gruppo può anche contenere task propri, subito sotto l'intestazione, senza alcuna sezione. Questa lista di task può stare in qualsiasi punto tra le sezioni del gruppo.

![Dettagli del task](../../screenshots/it/task-details-light.png){.light-only}
![Dettagli del task](../../screenshots/it/task-details-dark.png){.dark-only}

## Gruppi e sezioni

### Aggiungerli

- Fai clic sul pulsante **+** (**Nuovo gruppo**), il primo a sinistra dei pulsanti nella barra sopra la nota, oppure premi `Alt+N`: si apre un campo in fondo ai gruppi. Scrivi un nome e premi `Invio`. `Esc` chiude il campo.
- Dentro un gruppo apri il suo menu (il pulsante del menu del gruppo, o il clic destro sull'intestazione), scegli **Nuova sezione**, scrivi un titolo e premi `Invio`. Il campo si apre in fondo al gruppo.

Il nome è facoltativo: premi `Invio` su un campo vuoto e il gruppo o la sezione viene creato senza nome. EasyTask mostra allora **Gruppo 1**, **Gruppo 2**… o **Sezione senza titolo** in grigio. Puoi nascondere queste etichette con **Impostazioni > Note e sezioni > Mostra il nome dei gruppi e delle sezioni senza nome**.

### Rinominare, colorare e gestire

Fai clic sul nome per rinominarlo sul posto (`Invio` salva, `Esc` annulla), oppure apri il menu del gruppo o della sezione con il suo pulsante o con il clic destro.

Il clic destro sull'area vuota della nota (fuori da gruppi, sezioni e task) apre un piccolo menu con **Nuovo gruppo**, **Nascondi task completati** / **Mostra task completati** e **Sfondo della nota** (vedi [Colori](./colors#sfondo-della-nota)).

![Menu del gruppo](../../screenshots/it/group-menu-light.png)

| Voce                                   | Gruppo | Sezione | Cosa fa                                                          |
| -------------------------------------- | :----: | :-----: | ---------------------------------------------------------------- |
| **Aggiungi file audio**                | sì     |         | Aggiunge file audio al gruppo. Vedi [File audio](./audio).       |
| **Nuova sezione**                      | sì     |         | Apre il campo per il titolo di una nuova sezione nel gruppo.     |
| **Duplica**                            |        | sì      | Copia la sezione, con i suoi task, subito dopo l'originale.      |
| **Rinomina**                           | sì     | sì      | Modifica il nome.                                                |
| **Cambia colore**                      | sì     | sì      | Imposta o toglie il colore.                                      |
| **Sposta a sinistra**, **Sposta a destra** | sì |         | Sposta il gruppo di un passo nella riga.                         |
| **Sposta su**, **Sposta giù**          |        | sì      | Sposta la sezione di un passo nel suo gruppo, anche oltre la lista dei task del gruppo. |
| **Sposta lista task su**, **Sposta lista task giù** | sì |  | Sposta la lista dei task del gruppo di un passo tra le sue sezioni. |
| **Sposta in…**                         |        | sì      | Sposta la sezione in fondo a un altro gruppo, o in un **Nuovo gruppo**. |
| **Automazioni…**                       | sì     | sì      | Apre le automazioni della nota. Vedi [Automazioni](./automations). |
| **Archivia**                           | sì     | sì      | Lo nasconde senza eliminarlo. Vedi [Cestino e archivio](./trash-and-archive). |
| **Elimina**                            | sì     | sì      | Lo sposta nel cestino.                                           |

![Menu della sezione](../../screenshots/it/section-menu-light.png)

Puoi spostare gli elementi anche trascinandoli:

- Trascina un gruppo dalla sua intestazione per riordinare i gruppi. Mentre trascini, gli altri gruppi si scostano di lato per aprire lo spazio dove atterrerebbe e il gruppo trascinato si richiude. Con **Task, sezioni e gruppi che si spostano mentre li trascini** spento in **Impostazioni > Note e sezioni** una linea verticale mostra invece dove cade.
- Trascina una sezione su un altro gruppo, o tra due sezioni, per spostarla. Mentre trascini, le altre sezioni (e la lista dei task del gruppo) si scostano per aprire lo spazio dove atterrerebbe, nello stesso gruppo o in un altro, e la sezione trascinata si richiude. Con **Task, sezioni e gruppi che si spostano mentre li trascini** spento in **Impostazioni > Note e sezioni** una linea mostra invece dove cade. Rilasciala sull'area **Nuovo gruppo** al bordo per farne un gruppo a sé.

La lista dei task del gruppo segue lo stesso ordine delle sezioni: di default è in cima, e la sposti con **Sposta lista task su** e **Sposta lista task giù** (anche nel menu del clic destro del gruppo), che sono disattivate quando la lista è già a un'estremità, e non compaiono finché il gruppo non ha sezioni. [Annulla](./undo-and-history) la riporta com'era.

### Comprimere, contatori e barre d'avanzamento

Ogni gruppo e ogni sezione ha un pulsante per comprimerlo (**Comprimi gruppo**, **Comprimi sezione**). Un task con sottotask ha nel suo menu **Comprimi sottotask** / **Espandi sottotask**: finché sono compressi i sottotask non vengono disegnati e il task mostra sempre il conteggio dei sottotask completati (anche con **Mostra sottotask completati** disattivato). Aggiungere un sottotask a un task compresso lo espande prima. I sottotask nascosti contano comunque in ogni barra d'avanzamento e contatore. Cosa è aperto e cosa chiuso viene ricordato tra un avvio e l'altro dell'app; non fa parte di annulla/ripeti, dei template né degli export, e aprire o chiudere qualcosa non cambia la data di modifica del workspace. La ricerca apre ciò che nasconde un risultato solo finché è aperta. Un gruppo può mostrare quante sezioni, task e file audio contiene. Gruppi e sezioni possono mostrare anche una barra d'avanzamento con la percentuale di task completati (per un gruppo contano tutti i task e i sottotask). Scegli cosa mostrare in **Impostazioni > Note e sezioni**: **Mostra barra d'avanzamento nelle sezioni**, **Mostra barra d'avanzamento nei gruppi**, **Mostra numero di sezioni**, **Mostra numero di task**, **Mostra numero di file audio**. L'opzione **Linee tra i gruppi** disegna una sottile linea guida tra le colonne.

### Ridimensionare un gruppo

Trascina il bordo destro di un gruppo per allargarlo o restringerlo. Da tastiera, porta il focus sul bordo e usa `Sinistra` e `Destra` (con `Maiusc` i passi sono più grandi), `Home` per la larghezza minima e `Fine` per quella massima. Con un doppio clic sul bordo torni alla larghezza automatica. La barra di avanzamento del gruppo sparisce quando il gruppo è troppo stretto per mostrarla.

## Task e sottotask

### Aggiungere un task

1. In fondo a una sezione fai clic sul pulsante **+** (**Aggiungi task**). Per aggiungere un task a un gruppo senza sezione, fai clic sul pulsante tratteggiato **Nuovo task** del gruppo: si trova subito sotto i task del gruppo, ovunque sia quella lista tra le sezioni, e il nuovo task viene creato in quella lista.
2. Scrivi il testo in **Nuovo task…** e conferma con `Invio` (il campo non ha pulsanti). `Esc` lo chiude scartando il testo.

I task di un gruppo contano nella barra di avanzamento e nel numero di task del gruppo. Trascinane uno in una sezione, o il contrario, oppure usa **Sposta in…** (il gruppo compare nell'elenco come **Task del gruppo**). **Sposta su** e **Sposta giù** di un task restano dentro la stessa lista.

I nuovi task vanno in fondo alla sezione. Per metterli in cima scegli **In cima** in **Impostazioni > Note e sezioni > Posizione dei nuovi task**.

### Inserire un task tra due altri

Passa il mouse tra due task (di una sezione, di un gruppo, o due sottotask): compare una linea sottile con un **+** al centro. Fai clic sul **+** e proprio lì si apre un campo. Scrivi il testo e premi `Invio` per inserire il task in quel punto; `Esc` chiude il campo e scarta il testo. La linea c'è anche sopra il primo task, per inserire prima di lui.

![La linea per inserire un task](../../screenshots/it/task-insert-field-light.png)

- È aperto un solo campo alla volta: facendo clic su un altro **+** il campo si sposta.
- Con **Continua ad aggiungere task** attivo il campo si sposta sotto il nuovo task, così puoi continuare a inserire in ordine; se è disattivato si chiude dopo ogni task.
- Quando i task completati sono nascosti, la linea sopra il primo task visibile inserisce prima di lui e i nascosti restano dove sono.
- La linea funziona solo con il mouse e non compare durante un trascinamento o con più task selezionati.
- Ogni inserimento è un unico passo nella [cronologia di annulla](./undo-and-history).
- Puoi disattivare le linee da **Impostazioni > Note e sezioni > Linea per inserire un task**.

### Aggiungere un sottotask

Passa il mouse su un task e fai clic su **Aggiungi sottotask**, oppure scegli la voce dal menu del task. Scrivi il testo e premi `Invio`: il campo resta aperto per il sottotask successivo. `Esc` lo chiude. I sottotask possono avere altri sottotask, senza limiti. Il task mostra quanti sottotask sono completati (per esempio `1/3`) se **Mostra sottotask completati** è attivo.

### Modificare e completare

- Spunta la casella per completare un task, togli la spunta per riaprirlo.
- Fai clic sul testo per modificarlo. `Invio` salva, `Esc` annulla. Se preferisci evitare modifiche accidentali, disattiva **Rinomina cliccando sul nome**: userai **Rinomina** nel menu o `Invio` sul nome.

### Priorità, descrizione e colore

Apri il menu del task (pulsante del menu o clic destro):

![Menu del task](../../screenshots/it/task-menu-light.png)

| Voce                                         | Cosa fa                                                              |
| -------------------------------------------- | -------------------------------------------------------------------- |
| **Aggiungi sottotask**                       | Aggiunge un sottotask.                                               |
| **Aggiungi descrizione** / **Rimuovi descrizione** | Apre una finestra dove scrivi la **Descrizione**. `Maiusc+Invio` va a capo, `Ctrl+Invio` salva. |
| **Aggiungi priorità** / **Rimuovi priorità** | Segna il task come ad alta priorità. Sul task compare una bandierina. |
| **Rinomina**                                 | Modifica il testo.                                                   |
| **Cambia colore**                            | Colora il task con una barra laterale (e uno sfondo leggero, se lo vuoi). |
| **Sposta su**, **Sposta giù**                | Sposta il task di un passo tra i suoi fratelli.                      |
| **Sposta in…**                               | Sposta il task in un'altra sezione, o sotto un altro task come sottotask. |
| **Mostra dettagli**                          | Seleziona il task nel pannello dei dettagli.                         |
| **Archivia**, **Elimina**                    | Lo nascondono o lo spostano nel cestino, con i suoi sottotask.       |

![Descrizione del task](../../screenshots/it/task-description-light.png)

Un task con una descrizione mostra una piccola icona: fai clic per leggerla. L'aspetto dei task dipende da **Densità dei task** (**Compatta**, **Normale**, **Ampia**) e da **Sfondo colorato dei task**.

### Spostare i task

Trascina un task dalla sua riga. Mentre trascini, gli altri task si scostano per aprire lo spazio dove atterrerebbe e il task che trascini si riduce, così vedi l'ordine finale prima di rilasciare. Rilascialo:

- tra due task, per riordinarli;
- al centro di un task, per renderlo un sottotask di quel task (il task mostra un anello invece di aprire uno spazio);
- su una sezione, per farne l'ultimo task di quella sezione.

Con **Task, sezioni e gruppi che si spostano mentre li trascini** spento in **Impostazioni > Note e sezioni** i task restano fermi e si vede solo l'indicatore del punto di rilascio. **Sposta su**, **Sposta giù** e **Sposta in…** nel menu fanno lo stesso senza trascinare. Con [Task completati in fondo](#task-completati-in-fondo) attivo, un task rilasciato viene messo dove lo rilasci e l'elenco è poi mostrato con i completati in fondo.

### Usare la tastiera

Ogni lista di task è un albero per la tastiera e per gli screen reader: `Tab` entra nella lista su un solo task (l'ultimo che ha avuto il focus, o il primo) e il `Tab` successivo ne esce, così non devi attraversare ogni task. Dentro la lista:

![L'anello di focus su un task](../../screenshots/it/task-keyboard-light.png)

- `↑` e `↓` vanno al task visibile precedente e successivo, `Home` e `End` al primo e all'ultimo. Le frecce non escono dalla sezione.
- `→` apre i sottotask di un task (se sono chiusi) e poi va al primo; `←` li chiude e poi va al task padre.
- `Spazio` completa o riapre il task, `Invio` ne modifica il testo, `Maiusc+F10` (o il tasto menu) apre il suo menu.
- `Alt+↑` e `Alt+↓` spostano il task di un passo tra i fratelli, come **Sposta su** e **Sposta giù** del menu. Il focus resta sul task e uno screen reader annuncia "Spostato in posizione N di M" (o che non si può spostare oltre).

Il task che prende il focus diventa anche quello selezionato, come quando lo clicchi. Quando elimini, archivi o sposti altrove il task con il focus, il focus passa al task successivo (o al precedente) per poter continuare. Per selezionare più task da tastiera vedi [Selezionare più task](#selezionare-più-task). Tutti i tasti sono elencati in [Scorciatoie da tastiera](./shortcuts#task-da-tastiera).

### Selezionare più task

Tieni premuto **Ctrl** (**Cmd** su macOS) e clicca per aggiungere un task alla selezione o toglierlo. Clicca un task con **Maiusc** per selezionare tutti i task visibili tra l'ultimo cliccato e questo, anche tra sezioni e gruppi. **Esc** annulla la selezione, come un normale clic.

Da tastiera, porta il focus su un task e premi **Maiusc+Giù** o **Maiusc+Su** per estendere la selezione di un task alla volta (**Maiusc+End** e **Maiusc+Home** vanno all'ultimo e al primo task della lista); tornando verso il primo task la selezione si restringe. **Ctrl+Spazio** (**Cmd+Spazio** su macOS) aggiunge alla selezione il task con il focus o lo toglie, così puoi scegliere task non vicini: spostati con le frecce semplici, che mantengono la selezione, e premilo su ciascuno. Questi tasti non cambiano il task mostrato nel pannello dei dettagli. Quando la selezione scende a un solo task o a nessuno, uno screen reader lo annuncia; con due o più legge il contatore.

Fai clic destro su un task selezionato (o apri il suo menu) per agire su tutti insieme: **Elimina N task**, **Archivia N task**, **Colora** e **Sposta in…** (in fondo a una sezione, o tra i task diretti di un gruppo). Un task selezionato vale anche per i suoi sottotask, che vengono eliminati, archiviati e spostati con lui. Ogni azione è un solo passo nella [cronologia di annullamento](./undo-and-history). Il trascinamento sposta sempre un task alla volta.

I task selezionati hanno un contorno tratteggiato (oltre alla tinta) e gli screen reader li annunciano come "selezionato"; con due o più task selezionati, in basso nella nota compare un contatore, ad esempio "3 selezionati".

![Task selezionati con il contorno tratteggiato e il contatore](../../screenshots/it/task-selection-light.png)

## Cercare in una nota

Premi `Ctrl+F` o clicca la lente nella barra del percorso sopra i gruppi per aprire il campo di ricerca. Mentre scrivi, le corrispondenze vengono evidenziate nel testo di task e sottotask e nei nomi di sezioni e gruppi (non nelle descrizioni dei task), senza distinguere maiuscole e accenti, e il contatore, dentro il campo, indica a quale sei arrivato, ad esempio "3 di 12", oppure "Nessun risultato". **Invio** va alla corrispondenza successiva e **Maiusc+Invio** alla precedente; quella corrente è arancione con un anello, viene portata in vista e apre il gruppo o la sezione compressi che la contengono. Oltre a **Invio** e **Maiusc+Invio** puoi usare i pulsanti **Risultato successivo** e **Risultato precedente**. I task completati nascosti non vengono cercati. **Esc** (o il pulsante di chiusura) chiude il campo e toglie le evidenziazioni.

## Nascondere i task completati

Premi `Ctrl+Maiusc+H`, usa il pulsante a forma di occhio nella barra del percorso sopra i gruppi, oppure scegli **Visualizza > Nascondi task completati**. I task completati e i loro sottotask spariscono, e ogni sezione indica quanti sono nascosti. Un task completato che ha ancora un sottotask aperto resta visibile, così il lavoro aperto non si perde. Non viene eliminato nulla: premi di nuovo la scorciatoia per rivederli. Per partire con i task nascosti usa **Impostazioni > Note e sezioni > Nascondi task completati**.

## Task completati in fondo

Attiva **Impostazioni > Note e sezioni > Task completati in fondo** per vedere i task completati dopo quelli da fare in ogni elenco: i task di una sezione, i task messi direttamente in un gruppo e i sottotask di un task. È solo una vista: ogni blocco mantiene il suo ordine, l'ordine salvato nella nota non cambia e non si sposta nulla quando completi o riapri un task (cambia solo posto sullo schermo). Funziona insieme a **Nascondi task completati**.

Con l'opzione attiva, la selezione dei task, la ricerca e la tastiera seguono l'ordine che vedi. **Sposta su** e **Sposta giù** (e `Alt+↑` / `Alt+↓`) spostano un task tra i task dello stesso tipo e si fermano al bordo dei task da fare o di quelli completati. La riga **+** sopra il primo task completato aggiunge un nuovo task dopo l'ultimo da fare, e tra i task completati non c'è nessuna riga **+**. Quando trascini un task, viene messo dove lo rilasci, poi l'elenco è mostrato di nuovo con i completati in fondo.

## Il pannello dei dettagli

Il pannello a destra ha due schede. Aprilo o chiudilo con `Ctrl+Maiusc+B` o **Visualizza > Pannello dei dettagli**.

**Dettagli** mostra:

- per un task selezionato (fai clic su di esso): il percorso, lo stato, un interruttore per **Priorità alta**, il **Colore**, la **Descrizione** (modificabile, con **Salva** e **Annulla**), l'avanzamento dei sottotask e le date;
- per la nota, quando nessun task è selezionato: il numero di gruppi, sezioni e task, l'avanzamento complessivo, il colore e le date.

**Cronologia** elenca le azioni che puoi annullare e ripetere. Vedi [Annulla e cronologia](./undo-and-history).

## Finestre piccole

Sotto i 900 pixel di larghezza, la barra laterale e il pannello dei dettagli diventano pannelli sovrapposti: partono chiusi e coprono la nota finché sono aperti. Aprili con `Ctrl+B` e `Ctrl+Maiusc+B`.

## Controllo ortografico

EasyTask sottolinea le parole sbagliate mentre scrivi. Per disattivarlo vai in **Impostazioni > Note e sezioni > Controllo ortografico**.
