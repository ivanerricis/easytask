# Scadenze

Un task può avere una scadenza, con un'ora facoltativa. EasyTask la mostra sul task, raccoglie i task in un'agenda e può avvisarti quando scadono.

## Impostare una scadenza

- Apri il menu del task e scegli **Imposta scadenza…**. La voce diventa **Cambia scadenza…** quando il task ne ha già una, e **Rimuovi scadenza** la toglie.
- Oppure usa il campo **Scadenza** nel [pannello dei dettagli](./groups-sections-tasks#il-pannello-dei-dettagli).

La finestra ha un calendario, le scorciatoie **Oggi**, **Domani** e **Settimana prossima**, e un campo **Ora**. L'ora è facoltativa: **Nessuna ora** la toglie. Clicca **Imposta** per salvare. Impostare o rimuovere una scadenza si può annullare con `Ctrl+Z`.

## Il badge sul task

Un task con una scadenza mostra sotto il testo un piccolo badge con la data ("Oggi, 14:30", "Domani", "Ieri", oppure il giorno). Il colore e l'icona dicono a che punto è il task:

| Aspetto | Significato |
| --- | --- |
| Grigio | Scade più avanti |
| Giallo | Scade oggi o domani |
| Rosso | Scaduto |

Ogni stato ha la sua icona, quindi il colore non è mai l'unico segnale, e uno screen reader legge "Scade" o "Scaduto". Un task completato non è mai scaduto: il suo badge resta neutro.

## L'agenda delle scadenze

Apri **Scadenze** dalla sezione **Strumenti** della barra laterale (vedi [La barra laterale](./folders-and-notes#la-barra-laterale)). La finestra mostra i task aperti del workspace come un'agenda, una settimana alla volta, da lunedì a domenica:

- ogni giorno elenca i suoi task con l'ora, il testo e la nota e la sezione a cui appartengono;
- i giorni senza task sono riuniti in una sola riga;
- nella settimana corrente, i task scaduti da prima stanno in un blocco **Scaduti** in cima;
- usa le frecce (o i tasti `←` e `→`) per cambiare settimana, e **Oggi** (o `Home`) per tornare alla settimana corrente.

Clicca un task, o premi `Invio` su di esso: EasyTask apre la sua nota, seleziona il task e scorre fino a lui, anche in un altro workspace. I task completati e quelli nel cestino o nell'archivio non sono elencati.

## Notifiche

EasyTask può avvisarti quando i task scadono:

- un task con un'**ora** di scadenza viene notificato a quell'ora;
- le altre scadenze che contano (scadute e di oggi) arrivano in **un solo riepilogo** all'avvio di EasyTask, e di nuovo ogni mattina;
- ogni scadenza viene notificata una volta sola. Se cambi la data di un task, la nuova data viene notificata di nuovo;
- funziona anche mentre EasyTask resta nell'area di notifica. Clicca una notifica per portare EasyTask in primo piano: se riguardava un solo task, il task si apre.

L'interruttore è **Notifiche delle scadenze** in **Impostazioni > Sistema**. È attivo di default. La prima volta il sistema può chiederti di consentire le notifiche di EasyTask.

## Automazioni e colori

- Il trigger di [automazione](./automations) **un task scade** parte una volta per ogni scadenza, quando il task la supera. Le azioni si applicano al task.
- Il menu colore di un gruppo ha **Scadenze**: il gruppo prende il colore della scadenza più vicina dei suoi task (rosso scaduto, giallo oggi o domani, verde più avanti). Vedi [Colori](./colors#colore-automatico-di-un-gruppo).

## Copie, template ed esportazione

Duplicati, copie e incolla dei task, cestino, annulla ed esportazioni mantengono le scadenze. I [template](./templates) no: una data salvata in un template sarebbe già scaduta quando lo usi, quindi una nota creata da un template parte senza scadenze.

Un file esportato con questa versione si apre in una versione precedente di EasyTask senza le scadenze.
