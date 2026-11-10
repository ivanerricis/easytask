# Dati e backup

EasyTask tiene tutto sul tuo computer. Questa pagina spiega dove, come vengono fatti i backup automatici e come ripristinare o spostare i dati.

## Dove sono i tuoi dati

| Modalità | Posizione |
| --- | --- |
| Installata | `Documents/EasyTask` |
| Portable | cartella `data` accanto a `EasyTask.exe` |
| Personalizzata | La cartella indicata dalla variabile d'ambiente `EASYTASK_DATA_DIR` |

La modalità portable è attiva finché accanto a `EasyTask.exe` c'è un file chiamato `portable.txt`. `EASYTASK_DATA_DIR` deve essere un percorso assoluto e ha la precedenza sulle altre due. Si usa soprattutto nei test.

La cartella contiene:

| Cosa | Dove |
| --- | --- |
| Database (workspace, cartelle, note, task) | `easytask.db` |
| Impostazioni | `settings.dat` |
| Backup | `backups/` |
| Copie fatte prima di un aggiornamento del database | `backups/pre-migration/` |
| Log | `logs/` |

Per aprire la cartella vai in **Impostazioni > Dati > Cartella dati > Apri cartella dati** e clicca **Apri**.

![Impostazioni dei dati: backup, esportazione e importazione, cartella dei dati](../../screenshots/it/settings-data-light.png)

::: warning OneDrive
Se la cartella dati è sincronizzata da OneDrive, **Impostazioni > Dati** mostra un avviso. La sincronizzazione può causare errori "database is locked" o copie in conflitto del database. Escludi la cartella da OneDrive oppure usa la modalità portable.
:::

I file audio non sono qui. EasyTask conserva solo il loro percorso. Vedi [File audio](./audio).

## Backup automatici

EasyTask fa un backup del database quando si avvia. Le opzioni sono in **Impostazioni > Dati > Backup**:

| Opzione | Predefinito |
| --- | --- |
| **Backup automatico** | Sì |
| **Frequenza del backup automatico**: ogni giorno, ogni settimana o ogni mese | Ogni giorno |
| **Backup da conservare** (da 1 a 100) | 5 |
| **Cartella dei backup** | `backups` nella cartella dati |

La frequenza decide quando un backup è dovuto. "Ogni giorno" ne fa uno se oggi non ne è stato fatto nessuno. "Ogni settimana" e "Ogni mese" ne fanno uno se negli ultimi 7 o 30 giorni non ce n'è nessuno.

Quando i backup superano **Backup da conservare**, i più vecchi vengono eliminati. Un backup automatico fallito viene solo scritto nel log; non ferma mai l'app.

### Scegliere un'altra cartella

Clicca **Scegli…** accanto a **Cartella dei backup** e seleziona una cartella, per esempio su un altro disco o in una cartella cloud. Clicca **Usa la predefinita** per tornare a `backups`. L'elenco dei backup e **Ripristina** lavorano sulla cartella in uso.

Le copie fatte prima di un aggiornamento del database restano sempre in `backups/pre-migration/`, nella cartella dati.

## Eseguire un backup ora

Clicca **Esegui backup** accanto a **Esegui backup ora**. EasyTask salva una copia consistente del database nella cartella dei backup e mostra "Backup creato". Un backup manuale conta in **Backup da conservare** come quelli automatici.

Ogni backup è un file chiamato `easytask-AAAAMMGG-HHmmss.db`. Puoi copiarlo dove vuoi. **Apri cartella backup** mostra i file nel file manager.

## Ripristinare un backup

L'elenco **Backup disponibili** mostra ogni backup con data e dimensione.

1. Apri **Impostazioni > Dati > Backup**.
2. Nell'elenco, clicca il pulsante di ripristino del backup che vuoi.
3. Leggi il messaggio e clicca **Ripristina e riavvia**.

EasyTask controlla che il file sia un database EasyTask valido, salva una copia dei dati attuali, sostituisce il database con il backup e si riavvia. La copia di sicurezza compare nell'elenco con **(prima del ripristino)**. Ne viene tenuta solo l'ultima.

::: warning Le modifiche successive al backup si perdono
Quello che hai fatto dopo la creazione del backup non è dentro il backup. Se hai dubbi, ripristina, controlla e, se serve, torna alla copia **(prima del ripristino)**.
:::

Per eliminare un backup, clicca il pulsante cestino accanto e conferma.

Un backup contiene solo il database. Le impostazioni e i file audio non ne fanno parte.

## Copie prima di un aggiornamento del database

Quando una nuova versione di EasyTask deve cambiare la struttura del database, prima ne salva una copia in `backups/pre-migration/`, con il nome delle due versioni, per esempio `easytask-pre-migration-v6-to-v7.db`.

Queste copie non seguono **Backup da conservare**: EasyTask ne tiene al massimo 10 ed elimina le più vecchie. Sono elencate sotto **Copie prima dell'aggiornamento del database** in **Impostazioni > Dati > Backup**. Puoi cancellarle a mano quando non servono più.

## Esportare e importare un workspace

L'esportazione salva un workspace in un unico file che puoi conservare, condividere o aprire su un altro computer.

- **Esporta**: apri il workspace, poi usa **Impostazioni > Dati > Importa / Esporta > Esporta workspace corrente** (oppure **File > Esporta workspace…**). Scegli dove salvare `<nome>.easytask.json`.
- **Importa**: usa **Impostazioni > Dati > Importa / Esporta > Importa workspace** e scegli il file. EasyTask crea un nuovo workspace. Quello che hai già non viene modificato.

Il file contiene cartelle, note con il loro contenuto (gruppi, sezioni e task, compresi i task creati direttamente in un gruppo, e la larghezza di ogni gruppo), template e i percorsi dei file audio. Gli elementi nel cestino non vengono esportati.

Il file di export ha una versione del formato (ora la 2). EasyTask importa solo i file della versione attuale: un file esportato da una versione precedente dell'app, quando i task non potevano stare direttamente in un gruppo, viene rifiutato.

Se un file audio non si trova sul computer dove importi, viene saltato ed EasyTask ti dice quanti.

## Spostarsi su un altro computer

Hai due modi.

**Esporta e importa** porta un workspace alla volta e funziona anche tra versione installata e portable.

1. Sul vecchio computer, esporta ogni workspace.
2. Sul nuovo computer, installa EasyTask e importa i file.
3. Copia i file audio e usa **Aggiorna percorso** dove serve. Vedi [File audio](./audio#file-mancanti).

**Copia la cartella dati** sposta tutto, comprese impostazioni e backup.

1. Chiudi EasyTask sul vecchio computer.
2. Copia la cartella dati (vedi [Dove sono i tuoi dati](#dove-sono-i-tuoi-dati)) nella stessa posizione sul nuovo computer. Per la versione portable, copia l'intera cartella con `EasyTask.exe`, `portable.txt` e `data`.
3. Avvia EasyTask sul nuovo computer.

Sul nuovo computer usa la stessa versione di EasyTask o una più recente. Un backup fatto da una versione più nuova non si può ripristinare in una più vecchia.
