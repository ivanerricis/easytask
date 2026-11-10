# Risoluzione dei problemi

I problemi più comuni e come risolverli.

## Windows mostra "Windows ha protetto il PC"

I file per Windows non sono ancora firmati, quindi SmartScreen li segnala. Clicca **Ulteriori informazioni**, poi **Esegui comunque**. Scarica EasyTask solo dalla [pagina delle Release](https://github.com/ivanerricis/easytask/releases). Vedi [Installazione](./install).

## L'app non parte su Windows

EasyTask richiede Microsoft Edge WebView2 Runtime. È già incluso in Windows 11 e nelle versioni recenti di Windows 10. Se il tuo Windows 10 non lo ha, installa il runtime da Microsoft e riavvia l'app.

## "Database di una versione precedente non compatibile"

All'avvio l'app può fermarsi con un messaggio come "Database di una versione precedente non compatibile: elimina il file Documents/EasyTask/easytask.db e riavvia l'app."

Le migrazioni del database sono state riunite in un unico schema iniziale. Un database creato prima di quella modifica non è compatibile e l'app non lo tocca. Per ripartire da zero:

1. Chiudi l'app.
2. Nella cartella dei dati elimina `easytask.db`. Elimina anche `easytask.db-wal` e `easytask.db-shm` se esistono.
3. Riavvia l'app: viene creato un nuovo database vuoto.

::: warning
Questo elimina definitivamente i dati del vecchio database. Se vuoi conservarli, fai prima una copia del file.
:::

Il percorso nel messaggio vale per l'app installata. In modalità portable la cartella è `data` accanto a `EasyTask.exe`.

Un messaggio simile segnala che il database è stato creato da una versione più recente. In quel caso aggiorna EasyTask. Vedi [Aggiornamenti](./updates).

## Ripristinare un backup

1. Apri **Impostazioni > Dati**.
2. In **Backup disponibili** trova il backup che ti serve.
3. Clicca **Ripristina**, poi **Ripristina e riavvia**.

I dati attuali vengono sostituiti dal backup e l'app si riavvia. Prima viene salvata una copia dei dati attuali. Se il backup è stato creato da una versione più recente dell'app, aggiorna EasyTask prima di ripristinarlo. Vedi [Dati e backup](./data-and-backups).

## Log

EasyTask scrive i file di log nella cartella `logs` dentro la cartella dei dati. Per aprirla vai in **Impostazioni > Dati** e clicca **Apri** accanto a **Apri cartella dati**, poi apri `logs`. Allega le righe rilevanti quando segnali un bug.

## L'app è già in esecuzione

EasyTask funziona in una sola istanza. Se lo avvii una seconda volta, viene mostrata e portata in primo piano la finestra della prima. Se non la vedi, guarda nell'area di notifica: con **Riduci nell'area di notifica** attivo, chiudere la finestra lascia l'app in esecuzione lì.

## Segnalare un bug

Apri una issue su [GitHub](https://github.com/ivanerricis/easytask/issues). Indica la versione (**Impostazioni > Informazioni**), il sistema, i passi per riprodurre il problema e, se puoi, il log.

## Segnalare un problema di sicurezza

Non aprire una issue pubblica. Segnalalo in privato con un security advisory di GitHub, come descritto in [SECURITY.md](https://github.com/ivanerricis/easytask/blob/master/SECURITY.md). Solo l'ultima versione rilasciata riceve correzioni di sicurezza, quindi aggiorna prima di segnalare.
