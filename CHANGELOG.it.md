# Changelog (italiano)

Versione italiana di [CHANGELOG.md](CHANGELOG.md): è il testo che l'app mostra nelle novità di un aggiornamento quando la lingua scelta è l'italiano. Ogni versione ha qui la stessa sezione che ha nell'originale inglese (la CI lo controlla).

## [Unreleased]

### Aggiunto

- Colore di sfondo di una nota: clic destro sullo spazio vuoto di una nota e scegli **Sfondo della nota** per prendere un colore dalla stessa tavolozza usata altrove (o **Nessun colore** per toglierlo). Il colore è uno strato leggero sull'area della nota, si può annullare, e viene copiato duplicando la nota, dai template (creazione, aggiornamento, nuova nota da template, editor del template) e da esportazione e importazione (i file esportati prima di questa versione si importano ancora). Il database passa alla versione 13, e prima di migrare viene fatta una copia di sicurezza, come per ogni migrazione.

## [0.18.0] - 2026-10-29

### Aggiunto

- Vista divisa in due aree: il pulsante **Dividi in due aree** a destra della barra del percorso (o Ctrl+\) mostra due note affiancate. Ogni area ha i suoi tab e la sua nota aperta, e **Chiudi la divisione** chiude i tab dell'area destra. Una nota è aperta in una sola area alla volta, il divisore tra le aree si può trascinare (o spostare con le frecce, doppio clic per il 50%), e la divisione con i suoi tab viene riaperta al prossimo avvio se "Riapri le note all'avvio" è attivo.
- Puoi trascinare una scheda da una barra di schede all'altra (o nella barra vuota) per spostare la nota nell'altra area.
- Nuove voci "Apri a destra" e "Apri a sinistra" nel menu di una nota e della sua scheda: la prima crea la divisione se serve.
- Nuove scorciatoie: Ctrl+\ divide lo spazio o chiude la divisione, Ctrl+Alt+→ (anche Ctrl+Alt+←) sposta la nota attiva nell'altra area, e Ctrl+Alt+\ sposta il focus sull'altra area. Si possono cambiare in Impostazioni > Scorciatoie (tranne Ctrl+Alt+←).

### Modificato

- Svuotare il cestino e aprire workspace grandi è più veloce (nuovi indici del database: il database passa alla versione 12, e prima di migrare viene fatta una copia di sicurezza, come per ogni migrazione).
- Meno ridisegni mentre trascini il divisore tra le due aree, sposti i task, cambi scheda e modifichi le impostazioni, così l'app è più fluida.
- L'importazione di un workspace con molti file audio li controlla a blocchi.
- Le impostazioni audio, il player audio e la finestra di aggiornamento si vedono e funzionano come prima; la finestra di aggiornamento ora aspetta anche le finestre di conferma aperte.

### Corretto

- Il tema Sistema ora segue il passaggio chiaro/scuro del sistema operativo mentre l'app è aperta.
- Un file con un tag danneggiato non può più chiudere l'app mentre ne vengono letti i metadati audio (la build di rilascio non si interrompe più su un panic).
- Preferenze, schede e altre impostazioni vengono scritte con un unico salvataggio ritardato, così non si perde nessuna impostazione se chiudi l'app subito dopo una modifica.
- I link alle pagine delle issue e dei confronti del progetto nelle note di rilascio ora si aprono.
- I moduli per aggiungere un task o una sezione non reagiscono più ai clic quando sono chiusi, e una classe di stile `undefined` in più sulla barra laterale è sparita.

## [0.17.0] - 2026-10-28

### Aggiunto

- Nuova impostazione "Dimensione del testo" (Impostazioni > Aspetto): una dimensione in px da 12 a 24 (16 è quella normale) che ingrandisce o riduce tutta l'app (testo, icone e spazi). Si cambia con i pulsanti - e +, oppure con Ctrl+Più, Ctrl+Meno e Ctrl+0 (torna alla normale).
- Nuova impostazione "Carattere" (Impostazioni > Aspetto): quello predefinito, oppure Inter, Lora, JetBrains Mono, Atkinson Hyperlegible o OpenDyslexic, che sono inclusi nell'app e si caricano solo quando li scegli.
- Nuova impostazione "Apri all'avvio" (Impostazioni > Note): la pagina iniziale, l'ultimo workspace usato, oppure sempre un workspace a tua scelta. Sostituisce l'interruttore "Riapri l'ultimo workspace all'avvio": chi lo aveva attivo mantiene l'ultimo workspace.
- Nuova impostazione "Accelerazione hardware" (Impostazioni > Sistema, attiva di default): spegnila se vedi problemi grafici; vale dal prossimo avvio e propone di riavviare subito.
- Audio: nuove impostazioni "Fissa il player", "Ripeti il brano" e "Riprendi da dove eri" (le ultime due sono spente di default, la posizione di ogni brano viene ricordata), e la velocità di riproduzione scelta nel player viene ricordata.

### Modificato

- La lingua si sceglie da un menu, e i menu a tendina, i campi e le aree di testo usano lo stesso sfondo dei pulsanti con bordo.
- Nelle impostazioni il pulsante di ripristino di una riga sta prima del controllo, così i controlli arrivano al bordo destro di ogni riga (anche nella pagina delle scorciatoie). In una finestra stretta il controllo va sotto il testo invece di schiacciarlo.
- Tutte le scrollbar hanno lo stesso stile (9px). La scrollbar di un gruppo sta sotto la sua intestazione, e il pulsante "Nuovo task" dei task direttamente nel gruppo resta in fondo mentre l'elenco scorre.
- Il "+" tra due task è centrato anche sopra il primo task e ha più spazio attorno all'icona.
- La pipeline di rilascio esegue i controlli accanto alle build e costruisce lo zip portatile nel job Windows, così una release è più veloce.

## [0.16.0] - 2026-10-28

### Aggiunto

- Selezione dei task da tastiera: Maiusc+Su/Giù/Home/Fine estendono la selezione e Ctrl+Spazio (Cmd+Spazio su macOS) aggiunge o toglie il task con il focus. Il pannello dei dettagli non cambia durante la selezione e uno screen reader annuncia quando la selezione scende a un task o a nessuno.
- Nuova impostazione "Task completati in fondo" (Impostazioni > Note): in ogni elenco (sezioni, task direttamente nel gruppo, sottotask) i task completati sono mostrati dopo quelli da fare. Solo una vista: l'ordine salvato non cambia.
- Nuova impostazione "Conferma l'eliminazione solo se c'è contenuto" (Impostazioni > Note, attiva di default): una nota, una sezione o un gruppo vuoti vanno subito nel cestino con "Annulla", e con l'impostazione disattivata nessuno dei tre chiede conferma. Cartelle, workspace, task e selezioni multiple chiedono sempre.
- Nuova impostazione "Ricorda posizione e dimensione della finestra" (attiva di default, non disponibile nella versione portatile): al prossimo avvio la finestra torna dove l'hai lasciata.
- Nuova impostazione "Tieni la finestra in primo piano": si applica subito e viene ricordata al prossimo avvio.

### Modificato

- I campi per aggiungere un task, un sottotask o un task tra due altri non hanno più i bottoni di aggiunta e chiusura: Invio aggiunge, Esc annulla (un suggerimento è letto dagli screen reader).
- Trascinando un task che fa parte di una selezione multipla si sposta solo quel task, la selezione si azzera e lo dice agli screen reader. Quando un elemento trascinato non è su una destinazione valida il cursore mostra "non consentito".
- I nomi (workspace, cartelle, note, gruppi, sezioni, template, automazioni) sono limitati a 120 caratteri.
- Accessibilità e leggibilità: la barra di scorrimento verticale è più larga e più scura, il bordo del pulsante distruttivo ha più contrasto, il colore selezionato mostra una spunta, il percorso di navigazione è annunciato nella lingua dell'app, i nomi di gruppi e sezioni dicono "premi Invio per rinominare", l'interruttore di un'automazione ha un nome neutro, l'editor delle automazioni annuncia il passo corrente e le descrizioni di regole e righe sono più grandi.
- Le pagine di errore mostrano un messaggio tradotto con i dettagli tecnici ripiegati e permettono di copiarli. Le liste di cestino, archivio e template annunciano il caricamento e rispettano il movimento ridotto; il piè di pagina del cestino ha "Chiudi" a sinistra e "Svuota cestino" a destra.
- I dialog dei template selezionano il nome precompilato all'apertura, e gli errori dei moduli di importazione e di nota da template sono collegati ai campi per gli screen reader. Il selettore dei template non scrive più "Nessun risultato" durante il caricamento o dopo un errore.
- La finestra di aggiornamento non osserva più l'intera pagina mentre attende la chiusura di un'altra finestra.

### Corretto

- Il lettore musicale flottante non lampeggia più per un istante nella vecchia posizione quando lo si rilascia dopo il trascinamento.
- Una sezione senza task mantiene lo spazio della freccia di compressione, così il titolo non si sposta; l'icona della descrizione di un task non è più un pulsante nascosto che può prendere il focus; l'etichetta "Nuovo gruppo" nell'area di rilascio è centrata e più leggibile.
- L'errore del dialogo di eliminazione è collegato al pulsante di conferma per gli screen reader.

## [0.15.0] - 2026-10-28

### Aggiunto

- Modifica un template come una nota normale: "Modifica" nella finestra dei template lo apre in una scheda "Template". Le modifiche si salvano da sole, annulla e ripeti funzionano come in ogni nota, e se l'app si chiude la scheda torna al prossimo avvio (con "Riapri le note" attivo) oppure le modifiche vengono salvate nel template. Il menu "⋯" di un template ha "Duplica" e "Aggiorna da un'altra nota"; "Aggiorna dalla nota" resta disattivato mentre l'editor è aperto.
- Tra due task compare una linea sottile con un "+" quando ci passi sopra con il mouse (anche sopra il primo task, tra i sottotask e tra i task di un gruppo): un clic apre il campo di un nuovo task in quel punto. Con "Continua ad aggiungere task" attivo il campo scende sotto il nuovo task. Annulla lo toglie in un solo passo. Impostazioni > Note: "Linea per inserire un task" (attiva di default).
- I task si usano anche con la tastiera: Tab entra in una lista con una sola tappa, Su e Giù, Home e Fine passano tra i task della stessa lista, Destra e Sinistra aprono e chiudono i sottotask (o vanno al primo figlio o al genitore), Spazio completa, Invio rinomina, Maiusc+F10 o il tasto Menu apre il menu, e Alt+Su e Alt+Giù spostano il task e dicono la nuova posizione agli screen reader. Le scorciatoie hanno una nuova categoria "Task".
- I task selezionati sono segnati da un contorno tratteggiato e da un testo "selezionato" nascosto per gli screen reader, non solo da un colore, e un contatore ("3 selezionati") compare con due o più task selezionati.
- Un pulsante "+" nella barra del percorso, il primo a sinistra, crea un nuovo gruppo (come `Alt+N`); sostituisce la casella tratteggiata dopo i gruppi.

### Modificato

- Quando la finestra si restringe e la nota resterebbe sotto i 420 px, le barre laterali si chiudono da sole (prima la destra, poi la sinistra) e non si riaprono da sole.
- I file audio di un gruppo non scorrono mai: la lista mostra tutti i file sopra le sezioni.
- Piccoli miglioramenti dalla revisione UI: nomi per gli screen reader, un anello di focus più spesso, la maniglia di ridimensionamento delle barre laterali, il campo di ricerca delle note, il pannello dei dettagli e la pagina di errore.
- Il database viene aggiornato alla versione 11 all'avvio dell'app (prima viene fatto un backup, in automatico): le note in modifica come template stanno nella stessa tabella delle note. Le date di modifica non cambiano; una versione più vecchia dell'app non può aprire il database aggiornato.
## [0.14.0] - 2026-10-27

### Aggiunto

- La lista dei task creati direttamente in un gruppo può stare in qualsiasi punto tra le sue sezioni, non solo in cima. Spostala con "Sposta lista task su" e "Sposta lista task giù" nel menu del gruppo; una sezione può scavalcarla con "Sposta su" e "Sposta giù" o trascinandola, e una linea mostra se cade sopra o sotto la lista. Il pulsante "Nuovo task" del gruppo aggiunge alla lista dove si trova. Annulla e ripeti funzionano, e dopo l'aggiornamento tutto resta com'era (lista in cima).
- Template ed export salvano la posizione della lista dei task del gruppo.
- Gruppi e sezioni aperti o chiusi vengono ricordati: restano come li hai lasciati anche dopo aver riavviato l'app. Dopo l'aggiornamento tutto è aperto. La ricerca apre ancora ciò che nasconde un risultato, ma solo finché è aperta.
- "Comprimi sottotask" ed "Espandi sottotask" nel menu di un task che ha sottotask: i sottotask vengono nascosti e il task mostra il conteggio di quelli completati (anche con quell'opzione disattivata). Aggiungere un sottotask a un task compresso lo espande. Lo stato viene ricordato come quello di gruppi e sezioni.
- L'albero della barra laterale sinistra si usa anche con la tastiera: Su e Giù passano da una riga all'altra, Destra e Sinistra aprono e chiudono le cartelle (o vanno al primo figlio o al genitore), Home e Fine saltano alla prima e all'ultima riga, e Tab entra ed esce dall'albero con una sola tappa. La scheda attiva scorre in vista e una cartella chiusa che contiene la nota aperta mostra un puntino.

### Modificato

- Le conferme e le eliminazioni vengono eseguite una volta sola anche se premi Invio o clicchi due volte; i pulsanti aspettano mentre l'azione è in corso.
- I toast con un'azione ("Annulla", "Mostra") restano per 8 secondi invece di 3.
- Aree di clic più grandi per i pulsanti piccoli (lettore audio, pulsanti della finestra, schede, barra del percorso, ricerca) e il pulsante di chiusura delle finestre ha il contrasto pieno.
- Un clic fuori dal campo di un nuovo task o di una nuova sezione non scarta più quello che hai scritto; l'elenco dei file audio di un gruppo scorre dopo alcuni file; le linee e gli anelli di rilascio del trascinamento non vengono più tagliati e la maniglia di larghezza del gruppo non copre più la sua barra di scorrimento.
- Il selettore dei workspace distingue due workspace con lo stesso nome.

- Il database viene aggiornato alla versione 9 all'avvio dell'app (prima si fa una copia di sicurezza, in automatico): la lista e le sezioni di un gruppo condividono un solo ordine. Le date di modifica non cambiano; una versione più vecchia dell'app non può aprire il database aggiornato.
- Il database viene aggiornato alla versione 10 all'avvio dell'app (prima si fa una copia di sicurezza, in automatico): gruppi, sezioni e task ricordano se sono aperti o chiusi. Le date di modifica non cambiano, e nemmeno aprire o chiudere qualcosa le cambia; una versione più vecchia dell'app non può aprire il database aggiornato.

## [0.13.0] - 2026-10-27

### Aggiunto

- Barra del percorso sopra i gruppi, con `Cartella › Sottocartella › Nota`. Fai clic su una voce per mostrarla nella barra laterale sinistra: la barra si apre, le cartelle sopra di essa si espandono e la riga viene portata in vista e selezionata.
- Cerca nella nota: il pulsante di ricerca nella barra del percorso (o `Ctrl+F`) apre un campo che evidenzia le corrispondenze in task, sottotask, sezioni e gruppi, con il contatore "N di M". `Invio` e `Maiusc+Invio` scorrono i risultati, aprendo i gruppi e le sezioni compressi che li contengono, ed `Esc` chiude la ricerca.
- I task si possono creare direttamente in un gruppo, senza una sezione: il pulsante tratteggiato "Nuovo task" sotto i task del gruppo ne aggiunge uno, e si spostano da e verso le sezioni (trascinamento, "Sposta in…"). Una nuova sezione si crea dal menu del gruppo ("Nuova sezione").
- I gruppi si possono ridimensionare: trascina il bordo destro di un gruppo, oppure usa frecce, Home e Fine sul bordo con il focus, e fai doppio clic per tornare alla larghezza automatica. La larghezza è salvata con la nota, e la barra di completamento del gruppo si nasconde quando il gruppo è più stretto di 320 px.
- Seleziona più task con `Ctrl/Cmd+clic` e `Maiusc+clic` (`Esc` annulla la selezione), poi eliminali, archiviali, colorali o spostali insieme dal menu del tasto destro. Ogni azione è un solo passo di annullamento.
- Le automazioni possono usare i task creati direttamente in un gruppo come punto di partenza di una regola e come destinazione di uno spostamento («Gruppo X», task diretti).
- Impostazioni > Note: "Continua ad aggiungere task" (attiva di default). Dopo aver creato un task il campo resta aperto per il successivo; `Esc` o `Invio` su un campo vuoto lo chiudono.
- Una puntina sul lettore audio flottante lo blocca nella sua posizione, così non si sposta per sbaglio.
- Clic destro sull'area vuota di una nota: nuovo gruppo, e mostra o nascondi i task completati.

### Modificato

- La scorciatoia di ricerca delle note ora è `Ctrl+K` (prima `Ctrl+O`); `Ctrl+F` cerca nella nota aperta. Entrambe si cambiano in Impostazioni > Scorciatoie.
- Il pulsante che nasconde i task completati si è spostato dalla scheda della nota alla barra del percorso. La scorciatoia, `Ctrl+Maiusc+H`, è la stessa.
- Il pulsante in fondo a un gruppo aggiunge un task; le sezioni si creano dal menu del gruppo.
- La barra di scorrimento orizzontale dei gruppi è più alta e più facile da afferrare.
- Un task non mostra più il pulsante "Mostra dettagli" quando ci passi sopra con il mouse; la voce resta nel suo menu.
- I file di esportazione hanno un nuovo formato (versione 2): i file esportati da versioni precedenti non sono più accettati. Il database passa a una nuova versione all'avvio dell'app (prima viene fatta una copia di sicurezza); una versione più vecchia dell'app non riesce ad aprirlo.
- I riepiloghi di cestino e archivio non contano più la sezione nascosta che contiene i task diretti di un gruppo, e un task direttamente in un gruppo mostra «Nota X › Gruppo Y».

### Corretto

- Il pulsante "…" di gruppi, sezioni e file audio è centrato verticalmente nella sua riga.
- Quando un gruppo viene allargato, la barra di completamento, i contatori e il pulsante "…" restano sul bordo destro dell'intestazione.
- Aprire il campo di un nuovo task in un gruppo a larghezza automatica non aggiunge più una barra di scorrimento orizzontale, e i pulsanti di aggiunta e annulla si dividono la riga invece di allungarsi.
- Un menu aperto mentre si crea un task non si chiude più quando il campo del nuovo task riprende il focus.

## [0.12.0] - 2026-10-23

### Aggiunto

- Sito della documentazione in italiano e in inglese: [ivanerricis.github.io/easytask-tauri/it](https://ivanerricis.github.io/easytask-tauri/it/). Si apre da Aiuto > Documentazione, con `F1` (la scorciatoia si cambia in Impostazioni > Scorciatoie) o da Impostazioni > Informazioni. Si apre nella lingua dell'app.

### Modificato

- Il pulsante accanto alla barra di ricerca che torna alla home è una freccia invece di una casa.

### Corretto

- L'ultima scheda delle note aperte ha di nuovo il bordo destro quando non è quella attiva.
- Il testo segnaposto della ricerca nelle Impostazioni non è più tagliato.

## [0.11.0] - 2026-10-22

### Aggiunto

- Impostazioni: una casella di ricerca trova un'opzione dal nome. Esc, il pulsante X o la scelta di una categoria la svuotano.
- Impostazioni > Sistema (nuova): avvio di EasyTask con Windows e chiusura nell'area di notifica. Con questa opzione attiva, chiudere la finestra la nasconde e l'icona nell'area di notifica la riapre o chiude l'app. Entrambe le opzioni sono disattivate di default.
- Impostazioni > Dati: il cestino può svuotarsi da solo degli elementi eliminati da più di un numero di giorni a scelta (il controllo avviene all'avvio). Il backup automatico ha una frequenza e può essere salvato in una cartella a scelta.
- Impostazioni > Note: i nuovi task possono essere aggiunti in cima o in fondo, l'elenco dei task ha un'impostazione di densità e il controllo ortografico si può disattivare.

### Modificato

- Più veloce con note e workspace grandi: trascinare task, sezioni ed elementi della sidebar, cambiare nota e scheda, riprodurre l'audio ed esportare un workspace richiedono molto meno lavoro.
- Le impostazioni sono organizzate in riquadri, in una finestra più larga.
- Le righe della sidebar non mostrano più le icone di cartelle e note.

### Corretto

- "Nessun colore" toglie di nuovo il colore a cartelle e note nella sidebar.
- Il tooltip di una riga della sidebar non ricompare più dopo la chiusura del menu del tasto destro.
- Ctrl, Alt o Maiusc con le frecce non cambiano più nota dalla barra delle schede.
- I messaggi di errore lunghi nelle finestre di eliminazione vanno a capo invece di uscire dal riquadro.
- Sicurezza: `rustls-webpki` 0.103.16 e `webpki-root-certs` 1.0.10 correggono due avvisi sui certificati (RUSTSEC-2026-0382 e 0383).


## [0.10.1] - 2026-10-16

### Corretto

- Icona dell'app: torna su un riquadro scuro con gli angoli arrotondati e il simbolo più grande. La versione trasparente mostrava forme bianche che sparivano sugli sfondi chiari (barra delle applicazioni chiara, esplora risorse, installer) e lasciava visibile solo la pillola arancione.
- Sicurezza: `rustls` passa alla 0.23.46, che corregge quattro avvisi nella gestione del TLS (RUSTSEC-2026-0346, 0347, 0348 e 0349).

### Modificato

- Aggiornate le dipendenze: i plugin di Tauri e le altre librerie Rust, i pacchetti npm, le GitHub Actions e la lettura dei tag audio (`lofty` 0.25). I tag e l'anno dei file audio si leggono come prima.


## [0.10.0] - 2026-10-13

### Aggiunto

- Automazioni: quattro trigger "di stato" (una sezione o un gruppo non ha task da completare / ha almeno un task da completare) che impostano un colore. Bastano due regole per colorare di verde un gruppo o una sezione quando non resta nulla da fare e di rosso altrimenti. Si applicano in silenzio, senza notifica e senza voce di annullamento, e sono rivalutate a ogni cambio dei task della nota e al salvataggio delle regole.
- Automazioni: una schermata per quando non ce ne sono, con un esempio e un solo pulsante "Nuova automazione".

### Modificato

- Palette: sei colori (Giallo, Ciano, Lime, Rosa, Lavanda, Beige) sono più scuri perché il testo resti leggibile in entrambi i temi; i colori già assegnati non cambiano. I campioni sono quadrati e un test controlla il contrasto.
- Automazioni: la frase di una regola nomina il colore, gli elenchi si uniscono con "e", i passaggi sono controllati, Invio va avanti e la notifica mostra un titolo breve con una riga per regola.
- La finestra di aggiornamento e le Impostazioni condividono le stesse parti: focus su "Aggiorna ora", note di rilascio scorribili da tastiera e con link, avanzamento e un suggerimento.
- Menu di sezioni, gruppi e task riordinati con separatori; nel sottomenu del colore c'è "Nessun colore" al posto di "Elimina"; "Sposta in…" rifinito.
- I pulsanti di creazione hanno il "+" e sono pieni quando una lista è vuota. Le checkbox dei sottotask sono allineate al testo del task padre, e il player audio e Impostazioni > Audio sono allineati.

### Corretto

- Menu del testo: posizione errata, annulla e ripeti, campi di sola lettura e numerici o email; il testo di un task mantiene il menu del task.
- Il selettore "Quando" dell'editor delle automazioni non taglia più il testo.

### Note

- Tornando a una versione precedente le nuove regole di stato vengono ignorate senza errori.

## [0.9.1] - 2026-10-13

### Aggiunto

- Tasto destro sullo spazio vuoto dell'albero della barra laterale: un menu per creare una nota o una cartella nella radice del workspace, creare una nota da un template, importare, e comprimere o espandere tutte le cartelle.
- Impostazioni > Aspetto > Animazioni: un nuovo valore "Sistema", ora quello predefinito, che segue l'impostazione delle animazioni del sistema operativo (in Windows: Impostazioni > Accessibilità > Effetti visivi > Effetti di animazione) e cambia con essa. Chi aveva scelto una velocità la mantiene.

### Modificato

- Le cartelle si aprono e si chiudono con un'animazione a scorrimento, e la loro freccia ruota in modo fluido (segue l'impostazione delle animazioni).
- Barra laterale: le righe non hanno bordo finché non ci passi sopra; la nota aperta o selezionata ha un bordo d'accento su tutti i lati, e una cartella chiusa che contiene la nota aperta lo ha più tenue. L'icona di una nota sta sotto l'icona della sua cartella, e i pulsanti in alto sono raggruppati (crea, file, vista) da separatori.
- Impostazioni > Aspetto > Animazioni: una descrizione più breve.

### Corretto

- Il trascinamento di gruppi, sezioni e task in una nota, e di note e cartelle nella barra laterale, è fluido anche con centinaia di task: quando il puntatore cambia bersaglio viene ridisegnata solo la riga interessata (in una nota con 213 task i frame di un trascinamento sono passati da 100 ms a 17 ms).
- L'anello di focus dell'ultimo elemento di una cartella era tagliato in basso.

## [0.9.0] - 2026-10-12

### Aggiunto

- Una nota vuota mostra al centro un pulsante "Nuovo gruppo", oltre ai suggerimenti delle scorciatoie.
- Impostazioni > Informazioni: un pulsante copia il percorso del database.
- Impostazioni > Aspetto: i colori sotto Intensità dei colori hanno l'etichetta "Anteprima".

### Modificato

- Le conferme delle azioni che non si possono annullare (svuotare il cestino, eliminare definitivamente, ripristinare o eliminare un backup, eliminare o scartare un'automazione) hanno un pulsante rosso pieno. Gli altri pulsanti rossi hanno un bordo più visibile.
- La ricerca delle note (Ctrl+O) mostra prima le note: Invio subito dopo l'apertura non annulla più l'ultima azione.
- Impostazioni: il pulsante di reset di una riga sta sempre a destra del controllo e compare solo se il valore è stato cambiato, così i controlli sono allineati. "Ripristina" resta solo per backup, cestino e archivio; per le impostazioni ora è "Reimposta".
- Impostazioni > Dati: i backup sono elencati in un riquadro, con un'icona a orologio per ripristinarli e l'unità accanto al numero da conservare.
- L'anello di focus di pulsanti e campi usa il colore d'accento.
- Il dialog delle scorciatoie scorre al suo interno, con una sfumatura in basso finché c'è altro sotto.
- Template: un'icona più chiara per "Aggiorna dalla nota", Elimina separato dagli altri pulsanti, e il dialog è alto quanto la sua lista.
- Il pulsante del colore nei dialog di nuova cartella e nuova nota mostra un'icona a tavolozza finché non si sceglie un colore.
- Il task selezionato ha una barra del colore d'accento a sinistra; il numero di template nella barra laterale è un badge neutro; il menu della nota è diviso in gruppi.
- Home: pulsanti squadrati, il riquadro dei workspace recenti è alto quanto il suo contenuto, e nomi e date lunghi vengono troncati.
- Il player audio si sposta dalla sua intestazione, che contiene solo il pulsante di chiusura; il titolo ha una riga sua.
- Mentre si trascina una sezione, la colonna "Nuovo gruppo" è essa stessa l'area di rilascio.
- I messaggi di conferma spariscono dopo 3 secondi; gli errori restano per 8.

### Corretto

- Finestra stretta: la barra laterale e il pannello laterale non coprono più il pulsante che li nasconde.
- La scheda Dettagli non taglia più la descrizione del task: la parte Audio occupa solo lo spazio che serve.
- Il nome di un gruppo non si riduce più a "…" accanto alla barra di avanzamento e ai contatori.
- Impostazioni > Informazioni: il percorso del database va a capo solo dopo un separatore di cartella.

## [0.8.1] - 2026-10-12

### Modificato

- Le schede delle note aperte sono più strette, e solo la nota aperta mostra il pulsante di chiusura (le altre al passaggio del mouse).
- Mentre si trascina un elemento il puntatore è una mano chiusa ovunque, e una cartella, nota, gruppo, sezione o task trascinato è leggermente inclinato.
- Gli slider nelle Impostazioni (intensità dei colori, dimensione e opacità del player audio) seguono il puntatore in modo fluido e applicano il valore al rilascio.
- Impostazioni > Aspetto: rimossa l'anteprima della dimensione di cartelle e note.

### Corretto

- Windows: i controlli multimediali del sistema (riquadro del volume, schermata di blocco) mostrano EasyTask invece di "App sconosciuta" mentre il player audio riproduce. I pulsanti precedente/successivo saltano indietro e avanti di 15 secondi.
- La linea guida orizzontale di un sottotask era 1px sotto il centro della sua casella.

## [0.8.0] - 2026-10-09

### Aggiunto

- Rinomina sul posto: Rinomina nel menu di un workspace, una cartella, una nota, un gruppo o una sezione trasforma il nome in un campo di testo con tutto il nome selezionato (Invio salva, Esc annulla). I file audio e i template mantengono la finestra di dialogo.
- Le sezioni possono non avere un nome, come i gruppi. Un gruppo o una sezione senza nome non mostra testo nell'intestazione, e Impostazioni > Note può mostrare invece il nome predefinito (es. Gruppo 1) in grigio.
- Impostazioni > Note: rinominare un gruppo, una sezione o un task con un clic sul nome (attivo di default; se disattivato, Invio rinomina comunque) e colorare lo sfondo di un task colorato, oltre alla barra laterale (attivo di default).
- Impostazioni > Aspetto: velocità delle animazioni (Assenti, Normali, Lente). Normali, il valore predefinito, è più veloce delle animazioni delle versioni precedenti, che ora sono Lente.
- Scegliendo un colore d'accento con poco contrasto rispetto allo sfondo compare un avviso con la proposta di un colore vicino ma leggibile.
- Prima di un aggiornamento del database ne viene tenuta una copia separata dai backup automatici (le ultime 10), elencata in Impostazioni > Backup.
- Segnaposto di caricamento (skeleton) per le note, la home, il cestino, l'archivio e i template quando i dati tardano ad arrivare.

### Modificato

- Gruppi e sezioni si creano come i task: un solo campo di testo, Invio crea, Esc o un clic fuori annulla (i pulsanti + e X non ci sono più). I pulsanti "Nuovo gruppo" e "Nuova sezione" hanno un bordo tratteggiato e un'etichetta.
- I pulsanti delle finestre di dialogo restano in fondo. In Impostazioni, Cestino e Archivio l'elenco laterale delle categorie occupa tutta l'altezza della finestra, e il pulsante di chiusura non copre più "Ripristina tutto". "Svuota cestino" sta accanto a "Chiudi".
- Cestino, Archivio, Template, Impostazioni e le altre finestre si aprono subito (alla prima apertura attendevano circa mezzo secondo), e Cestino e Archivio non animano più il layout all'apertura.
- I tooltip sono più vicini al loro elemento, si aprono subito passando a un pulsante vicino e nel tema scuro sono grigi con un bordo invece che bianchi.
- Il menu del tema nelle Impostazioni ha le icone.

### Corretto

- Scrivendo in un campo di testo non compare più il pulsante di cancellazione (X) del sistema.

## [0.7.0] - 2026-10-09

### Aggiunto

- Automazioni per i task di una nota: regole come "quando un task viene completato in In corso, spostalo in Fatto". Reagiscono quando un task viene completato, riaperto, creato, spostato in una sezione o quando tutti i suoi sottotask sono completati, e possono spostare il task, segnarlo come completato o da fare, aggiungere o togliere la priorità, colorarlo o completarne i sottotask. Si gestiscono dai menu della nota e della sezione (Automazioni…); ogni esecuzione mostra un avviso e si annulla come qualsiasi altra azione. Anche per i gruppi: quando tutti i task di un gruppo sono completati, il gruppo può essere archiviato, colorato o spostato in cima o in fondo alla nota, anche dal menu del gruppo. Le regole restano quando una nota viene duplicata, esportata o importata.
- Un menu testuale nella barra del titolo (File, Modifica, Visualizza, Aiuto), raggiungibile anche con Alt o F10, con un'icona su ogni voce.
- Il colore della nota aperta si cambia dal pannello Dettagli, come quello di un task.
- I task si possono archiviare dal loro menu, insieme ai sottotask: spariscono dalla nota senza finire nel cestino, e l'Archivio ha una scheda Task da cui ripristinarli (tornano anche i task padre archiviati).
- Importando un workspace, una nota o una cartella vengono mostrati prima i nomi che avranno (viene proposto un nome libero), modificabili.
- Tastiera: i menu degli elementi (…) funzionano con le frecce, le schede delle note si scorrono con le frecce e si spostano a sinistra o a destra dal loro menu, e il menu del task ha Rinomina.

### Modificato

- Il colore d'accento predefinito è un arancione più scuro, così il testo dei pulsanti è bianco. Un colore scelto dall'utente mantiene il testo nero o bianco scelto in automatico.
- Il focus da tastiera è visibile ovunque, le aree cliccabili sono più grandi, e menu a tendina, schede, interruttori e cursori hanno lo stesso aspetto e comportamento in tutta l'app (impostazioni, cestino, archivio, pannello destro, lettore audio).
- Mentre si trascina un task, la sezione che lo riceverà è evidenziata per intero. Il pulsante "Aggiungi task" è un semplice "+". Il segno della categoria selezionata nelle impostazioni è a sinistra, e le categorie delle impostazioni non scorrono mai in orizzontale.
- La barra laterale compatta si apre come pannello sopra il contenuto e si chiude con Esc.
- Esporta workspace non è più nella barra laterale sinistra: si trova in File e in Impostazioni > Dati.
- I nomi lunghi non allargano più finestre, gruppi o schede: vengono troncati o vanno a capo.
- Testi più chiari e coerenti: "Nuova nota", "Comprimi", messaggi di errore, date, "sottotask" e "…" ovunque.
- Il controllo degli aggiornamenti parte 3 secondi dopo l'avvio.
- Il database viene aggiornato al primo avvio (prima viene fatta una copia di sicurezza).

### Corretto

- Eliminare un workspace dalla home lo toglie subito dalla lista (prima restava visibile fino al ricaricamento della pagina).
- Le finestre più alte dello schermo scorrono invece di essere tagliate.
- Gli avvisi seguono il tema dell'app invece di quello del sistema.
- Cestino, Archivio, Template e Nuova nota da template funzionano dal menu anche con la barra laterale sinistra chiusa.
- La griglia dei workspace nella pagina iniziale non scorre più di lato.
- Lettori di schermo: caselle dei task, barre di avanzamento, albero della barra laterale e schede delle note hanno nomi e ruoli corretti.

## [0.6.0] - 2026-10-07

### Aggiunto

- Una palette colori nelle finestre di creazione: il pulsante "Aggiungi colore" delle finestre di nuovo workspace, nuova cartella e nuova nota è ora un pulsante "+" accanto al nome che apre la stessa palette dei menu (con "Scegli un altro colore" per qualsiasi altro colore).
- Cestino e Archivio sono divisi in schede per tipo di elemento (cartelle, note, gruppi, sezioni...), ognuna con il proprio conteggio e un messaggio quando un tipo è vuoto.
- Una notifica di conferma quando un elemento viene spostato nel cestino.

### Modificato

- Cartelle, note, gruppi, sezioni e task si trascinano da tutta la riga o l'intestazione: le maniglie sono state tolte. L'anteprima mostrata durante il trascinamento ha il colore dell'elemento.
- Una scheda si può rilasciare a entrambe le estremità della barra delle schede.
- Il pulsante di chiusura delle notifiche è dentro la notifica, a destra.
- I backup automatici conservano 5 copie per impostazione predefinita (erano 7). Il valore scelto nelle Impostazioni non cambia.

## [0.5.0] - 2026-10-06

### Aggiunto

- Archivio: cartelle, note, gruppi e sezioni si possono archiviare dal loro menu (o più insieme dalla selezione multipla della sidebar di sinistra). Un elemento archiviato sparisce dalla nota e dalla sidebar, con tutto quello che contiene, senza finire nel cestino. Il pulsante "Archivio" accanto al Cestino elenca gli elementi archiviati divisi per tipo (cartelle, note, gruppi, sezioni): da lì si ripristinano o si spostano nel cestino. Archiviazione e ripristino si possono annullare, e l'export e l'import del workspace conservano gli elementi archiviati.
- Informazioni sui file audio: la scheda Dettagli della sidebar di destra è divisa in due, e la metà in basso mostra il file audio in riproduzione, o quello scelto con "Informazioni" dal suo menu: copertina, titolo, artista, album e gli altri tag, durata, formato e codec, bitrate, frequenza di campionamento, profondità in bit, canali, dimensione e data di modifica.

### Corretto

- Il lettore audio non parte più in parte fuori dalla finestra: la sua posizione è calcolata dalla dimensione reale (era considerato molto più basso di quanto è).
- "Colora contenuto" di una cartella si può annullare.
- Il nome di un workspace importato che coincide con uno esistente riceve il suffisso nella lingua dell'app ("(importato)" in italiano, "(imported)" in inglese), e gli errori dei backup e dell'import sono tradotti.
- Modificare una nota con molti task è più leggero: una modifica a un task non ridisegna più tutti i task che hanno sottotask.

### Modificato

- Una sezione senza task non mostra più la barra di avanzamento ("100 %"), come già avviene per i gruppi.

## [0.4.0] - 2026-10-06

### Corretto

- Aprire una nota con molti task non blocca più l'app: il testo di ogni task veniva dimensionato da uno script che forzava un ricalcolo del layout per ciascuno (una nota con 400 task impiegava mezzo minuto, una con 3000 non finiva mai). Ora è la webview a dimensionare le caselle di testo (`field-sizing: content`), e una nota con 250 task si apre in meno di un secondo.
- Lo slider del volume del lettore audio è fluido: mentre lo si trascina si aggiorna solo il lettore, e la preferenza del volume (che a ogni passo ridisegnava tutta l'app e veniva scritta su disco) si salva una volta sola al rilascio.
- Le linee ad albero dei sottotask annidati: la linea di un sottotask che non è l'ultimo del suo livello spariva quando uno dei suoi antenati era l'ultimo, e le linee sembravano spezzate.
- Il campo descrizione della sidebar di destra ha un'altezza minima fissa.
- Una sola regola per il testo sul colore d'accento (pulsanti, opzioni selezionate, la spunta): il `--primary-foreground` scuro o bianco, anche all'avvio del tema chiaro, prima che sia calcolato dall'accento.
- Aprendo una sidebar non si vede più per un istante il contenuto schiacciato (testo in verticale): il contenuto mantiene la larghezza finale mentre il pannello si apre.
- Il testo dei pulsanti principali (e di ciò che sta sul colore d'accento) è scuro o bianco secondo l'accento: era sempre bianco, 1,8:1 sull'arancione predefinito.
- Il bordo di una casella vuota e dei campi di testo arriva a 3:1 sul tema scuro (era 2,8:1).
- Ctrl+Z subito dopo "Sposta su/giù" (o un trascinamento) lo annulla: prima non faceva nulla finché lo spostamento non era salvato.
- La data di modifica di un workspace si aggiorna a ogni cambiamento al suo interno (aggiunta, modifica, spostamento, eliminazione o ripristino di cartelle, note, gruppi, sezioni, task, file audio): prima cambiava solo rinominando o ricolorando il workspace. La pagina iniziale ordina i workspace per quella data.
- Esc funziona nei campi che creano un nuovo task, gruppo o sezione (li chiude e scarta il testo), e dopo Esc il titolo di una sezione non viene più salvato quando il campo perde il focus. Le dialog di rinomina e di descrizione del task dimenticano quanto scritto quando si chiudono con Esc.
- Nella dimensione compatta della sidebar le righe di note e cartelle non mostrano più le barre di scorrimento.
- "Svuota cestino" chiude la dialog del cestino quando riesce.
- I task completati nascosti non si portano più via i sottotask aperti: un task completato con un sottotask aperto resta visibile finché tutto ciò che ha sotto non è finito.
- Il selettore del colore d'accento non è più lento: mentre si trascina il colore cambia solo l'anteprima; la preferenza si salva una volta sola, quando il selettore si ferma.
- La ricerca delle note (Ctrl+O) mostra il percorso completo di una nota: una nota in una sottocartella mostrava solo l'ultima cartella.
- I pulsanti nell'intestazione della sidebar sinistra vanno a capo su una seconda riga quando la sidebar è stretta, invece di sparire.
- Gli errori delle dialog di eliminazione, cestino e rinomina e della modifica sul posto di task, gruppi e sezioni sono mostrati accanto al campo invece che in un toast.

### Aggiunto

- La barra colorata a sinistra di un task è larga il doppio (4 px invece di 2).
- Un pulsante nell'intestazione della sidebar sinistra per creare una nota da un template: si sceglie il template (con una casella di ricerca), poi il nome e la cartella della nota. La sidebar non può più essere più stretta di 224 px (era 200) perché i sei pulsanti dell'intestazione ci stiano.
- Le novità nella dialog di aggiornamento e in Impostazioni > Informazioni sono mostrate nella lingua dell'app (italiano o inglese). Vengono da `CHANGELOG.md` e dal nuovo `CHANGELOG.it.md`, che i controlli di release richiedono per ogni versione.
- Esportazione e importazione di note e cartelle. "Esporta" è nel menu di ogni nota e cartella (una cartella con tutto il suo contenuto). "Importa" è un pulsante nell'intestazione della sidebar sinistra (importa nella radice del workspace) e "Importa qui" è nel menu di una cartella. Il file ha il formato dell'esportazione di un workspace; i nomi uguali vengono rinominati, i file audio mancanti saltati, e l'importazione si può annullare.
- Selezione multipla nella sidebar sinistra: Ctrl+clic (Cmd su macOS) aggiunge o toglie un elemento, Maiusc+clic seleziona un intervallo, Esc la annulla. Su più elementi insieme: elimina, sposta (trascinando o dal menu), cambia colore ed esporta, ognuno come un solo passo della cronologia.
- La nota aperta nella scheda attiva è evidenziata nella sidebar (e una cartella chiusa che la contiene è segnata), e la scheda attiva ha i bordi laterali e una linea sotto le altre schede, così si apre sulla nota.
- Ordinamento dei workspace nella pagina iniziale: ultima modifica, data di creazione o nome, crescente o decrescente; la scelta viene ricordata.
- Il numero di file audio di un gruppo nella sua intestazione (Impostazioni > Note), e linee tra i gruppi di una nota (spente di default).
- Un limite per la cronologia delle azioni annullabili (da 25 a 500, predefinito 50) in Impostazioni > Dati.
- Scorciatoie per spostarsi tra le note aperte: Ctrl+PagGiù / Ctrl+PagSù (modificabili) e Ctrl+Tab / Ctrl+Maiusc+Tab.
- Un pulsante per ripristinare il colore d'accento, accanto al selettore.
- Un backup del database viene fatto prima di migrarlo a una nuova versione dello schema (la copia è nella cartella dei backup; se fallisce l'app parte lo stesso).

### Modificato

- Il colore d'accento predefinito è un arancione più deciso (#f97316): quello pallido si vedeva poco su sfondo chiaro.
- Impostazioni: i pulsanti delle scorciatoie sono solo icone, la pagina Dati ha delle sezioni (importa ed esporta, cartella dati, backup, cronologia) e così la pagina Note.
- L'intestazione della sidebar sinistra, le schede delle note e le linguette del pannello di destra hanno la stessa altezza, e le linee ad albero della sidebar sono centrate sotto le frecce delle cartelle e un po' più visibili.

## [0.3.0] - 2026-10-02

### Aggiunto

- "Sposta su" / "Sposta giù" nel menu di task, sottotask e sezioni ("Sposta a sinistra" / "Sposta a destra" per i gruppi): un'alternativa al trascinamento, usabile anche da tastiera. I task completati nascosti vengono saltati e lo spostamento si può annullare.
- Dialog dei Template: un pulsante "Nuovo template" per creare un template da una qualsiasi nota del workspace (una casella di ricerca elenca le note con la loro cartella), in alternativa al menu della nota.
- Lettore audio: pulsante per ripartire dall'inizio, pulsante per silenziare, pulsante per la velocità di riproduzione (da 0,75x a 2x), `Alt+P` per riprodurre o mettere in pausa da qualsiasi punto del workspace (si può cambiare in Impostazioni > Scorciatoie), e titolo e stato mostrati al sistema (controlli multimediali di Windows).
- Lettore audio: pulsanti per andare indietro e avanti di 15 secondi (i tasti di ricerca del sistema usano lo stesso passo) e controlli di riproduzione su una riga a parte.
- I file audio di un gruppo mostrano cosa stanno facendo: barre mentre suonano, pausa, un quadrato di stop quando il brano è finito.
- "Ripristina tutto" per la pagina Aspetto (tema, colore d'accento, lingua, dimensione di cartelle e note, intensità dei colori), con conferma.

### Modificato

- Cliccando il file audio caricato lo si mette in pausa o lo si riprende, invece di farlo ripartire (a questo serve il nuovo pulsante per ripartire).
- Tutte le conferme (sposta nel cestino, elimina definitivamente, svuota il cestino, ripristina o elimina un backup, sovrascrivi un template, ripristina le scorciatoie o l'aspetto, "file non trovato") sono un'unica dialog con lo stesso aspetto: pulsante di chiusura, "Annulla" a sinistra e l'azione, con un'icona, a destra. Titolo e pulsante sono rossi solo quando si perdono dati. Anche i pulsanti principali delle altre dialog (nuova cartella, nota, workspace, rinomina...) hanno un'icona.
- La descrizione di un task è un'icona accanto al contatore dei sottotask (e la prima icona della barra che compare quando il puntatore è sul task), invece di un'icona isolata su una riga sotto il task.
- I pulsanti della finestra usano il colore del testo invece dell'accento (illeggibile sul tema chiaro), il pulsante ingrandisci diventa "ripristina" mentre la finestra è ingrandita, la chiusura diventa rossa al passaggio del mouse e ci sono i tooltip.
- Lettore audio: il titolo ha una riga tutta sua (al massimo due righe, il nome intero nel tooltip), la maniglia è la stessa dei gruppi e i brani più lunghi di un'ora mostrano le ore.
- Nel lettore audio le frecce spostano la barra di 5 secondi (prima 0,1) e la barra spaziatrice riproduce o mette in pausa; la posizione viene letta a voce.
- Il pulsante "Ripristina tutto" delle sezioni delle Impostazioni (Aspetto, Audio, Scorciatoie) sta sempre nello stesso punto: la riga del titolo della sezione, a destra.
- La finestra delle Impostazioni è più alta (720px, al massimo l'85% della finestra).
- I sottotask sono appesi a linee guida ad albero sotto la casella del loro genitore (niente più separatori a gradini), con una casella un po' più piccola, e un task con sottotask mostra quanti sono completati (es. `1/3`).
- Impostazioni > Note ha un interruttore per mostrare o nascondere il numero di sottotask completati di un task.
- Le linee guida dei sottotask si vedono meglio (contrasto circa 2:1, era 1,3:1) e il contatore di un task con tutti i sottotask completati usa il colore normale del testo invece dell'accento, illeggibile sul tema chiaro.
- I nomi dei gruppi si vedono sempre per intero su una riga: il gruppo si allarga al nome invece di troncarlo.
- Le nuove versioni vengono annunciate in una dialog all'avvio (novità, "Aggiorna ora", "Più tardi", "Salta questa versione") invece di un avviso che spariva dopo 15 secondi.

### Corretto

- Testo e icone sul colore d'accento (pulsanti arancioni, opzioni selezionate, la spunta di un task completato) sono scuri o bianchi a seconda dell'accento, così restano leggibili: il bianco sull'arancione predefinito dava 1,8:1 sul tema chiaro.
- La maniglia di trascinamento di task e sottotask è centrata sulla casella e sulla prima riga di testo, e la lineetta orizzontale delle linee ad albero si dissolve mentre la maniglia è visibile invece di attraversarla.
- Compattare un gruppo e riaprirlo non lo fa più restringere per un istante (con i gruppi vicini che scattano): l'elenco dei suoi file audio compare subito invece di un momento dopo.
- La parte colorata degli slider (barra di avanzamento del lettore, volume e slider delle Impostazioni) poteva fermarsi prima del bordo sinistro negli slider larghi: verso la fine di un brano la prima parte della barra era vuota.
- I bordi di caselle, campi di testo e la traccia degli interruttori raggiungono circa 3:1 di contrasto su entrambi i temi. Sul tema chiaro il colore `--input` era scritto in modo non valido: questi bordi diventavano neri e la traccia di un interruttore spento era trasparente.
- Un gruppo vuoto non si restringe più tagliando la propria intestazione.
- Compattare un gruppo non ne cambia più la larghezza (mantiene quella che aveva da aperto).
- Ricaricare la pagina di un workspace (build di sviluppo) ripristina il workspace dall'indirizzo invece di lasciare una schermata vuota.
- Le build di sviluppo e di test (e ogni avvio con `EASYTASK_DATA_DIR`) possono partire mentre l'app installata è aperta: il blocco di istanza singola vale solo per le build di release sulla cartella dati predefinita.

## [0.2.0] - 2026-10-01

### Aggiunto

- Nascondi i task completati (`Ctrl+Shift+H`).
- Duplica note e sezioni.
- Avviso in Impostazioni > Dati quando la cartella dei dati è sincronizzata da OneDrive, il che può causare errori "database is locked" o copie in conflitto.

### Corretto

- Ripristino di un backup: il backup viene prima validato e poi sostituito in modo atomico, quindi un file danneggiato non può più lasciare il database ripristinato a metà.
- Annulla/ripeti non agisce più su un nuovo elemento che aveva riutilizzato l'id di un elemento eliminato definitivamente dal cestino (la cronologia viene svuotata dopo l'eliminazione definitiva).
- La barra laterale non resta più indietro quando un ricaricamento si sovrappone a un'altra modifica (ad esempio annullando uno spostamento), e l'eliminazione fallita di una nota riapre la sua scheda.
- Doppio invio nelle dialog di creazione (un doppio clic o un doppio Invio veloci creavano due elementi).
- Scorciatoie da tastiera e preferenze vengono validate in lettura, quindi i valori salvati non validi tornano a quelli predefiniti.
- L'importazione di un workspace corregge o rifiuta subito i file non validi (titoli vuoti, nomi duplicati, colori vuoti, file non audio, limiti di dimensione) invece di fallire a metà con un errore generico.
- Eliminare di nuovo un elemento già nel cestino ne conserva la data di eliminazione originale.
- `Esc` durante la modifica di un task ora annulla la modifica.
- Creare un sottotask sotto un genitore eliminato nel frattempo ora mostra un errore invece di fallire in silenzio, e due backup nello stesso secondo non falliscono più.

### Sicurezza

- Content Security Policy più restrittiva (`object-src`, `base-uri`, `form-action` e `frame-ancestors` sono bloccati; il server di sviluppo è ammesso solo nelle build di sviluppo).
- Istanza singola: avviare EasyTask una seconda volta porta in primo piano la finestra già aperta invece di aprirne una seconda sullo stesso database.
- Tutte le GitHub Actions sono fissate a commit precisi e il workflow di release usa permessi minimi.
- La modalità portable non scrive più fuori dalla sua cartella (niente file dello stato della finestra nel profilo utente e niente ripiego delle impostazioni nella cartella dati dell'app).
- `EASYTASK_DATA_DIR` deve essere un percorso assoluto.
- Una dialog nativa spiega perché l'app non può partire quando la cartella dei dati non si può creare.

## [0.1.0] - 2026-10-01

Prima versione pubblica.

[Unreleased]: https://github.com/ivanerricis/easytask-tauri/compare/v0.18.0...HEAD
[0.18.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/ivanerricis/easytask-tauri/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/ivanerricis/easytask-tauri/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/ivanerricis/easytask-tauri/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ivanerricis/easytask-tauri/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ivanerricis/easytask-tauri/releases/tag/v0.1.0
