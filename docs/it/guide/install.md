# Installazione

Scarica EasyTask dalla [pagina delle Release](https://github.com/ivanerricis/easytask/releases). Scarica i file solo da lì.

## Download

| Piattaforma | File | Note |
| --- | --- | --- |
| Windows | Installer (`EasyTask_<versione>_x64-setup.exe`) | Installa l'app. Può aggiornarsi da sola. |
| Windows | `EasyTask_<versione>_x64_portable.zip` | Nessuna installazione: decomprimi e avvia `EasyTask.exe`. |
| Linux | `.deb` | Debian, Ubuntu e derivate. |
| Linux | `.AppImage` | Già portable: rendilo eseguibile e avvialo. |

Non sono previste build per macOS.

## Windows

L'installer chiede se installare per l'utente corrente o per tutti gli utenti.

Requisiti: Windows 10 o 11 a 64 bit con Microsoft Edge WebView2 Runtime. È già incluso in Windows 11 e nelle versioni recenti di Windows 10. Se l'app non parte, vedi [Risoluzione dei problemi](./troubleshooting).

### SmartScreen

I file per Windows (l'installer e `EasyTask.exe` portable) non sono ancora firmati. La prima volta che li avvii, SmartScreen può mostrare "Windows ha protetto il PC". Non significa che il file sia dannoso: Windows avvisa per i programmi di editori che non conosce.

Per continuare, clicca **Ulteriori informazioni**, poi **Esegui comunque**.

### Versione portable

Lo zip contiene `EasyTask.exe`, `portable.txt` e un breve readme.

- Finché `portable.txt` è accanto all'exe, tutti i dati stanno nella cartella `data` accanto ad esso. Puoi tenere l'app su una chiavetta USB.
- Per aggiornare, chiudi l'app e sostituisci `EasyTask.exe` con quello nuovo. La cartella `data` resta.
- La versione portable non si aggiorna da sola: il controllo degli aggiornamenti mostra un avviso e un link alla pagina delle Release. Vedi [Aggiornamenti](./updates).

## Linux

- `.deb`: installalo con il gestore pacchetti, per esempio `sudo apt install ./<file>.deb`.
- `.AppImage`: rendilo eseguibile (`chmod +x`) e avvialo.

I nomi esatti dei file sono scelti in fase di build: controllali nella pagina delle Release.

## Disinstallazione

Su Windows rimuovi EasyTask dalle app installate come al solito. Il disinstallatore rimuove l'app e lascia la cartella dei dati, così i tuoi workspace restano. Per eliminare anche i dati, cancella la cartella a mano. La posizione è in [Dati e backup](./data-and-backups).

Per la versione portable, elimina la cartella che contiene `EasyTask.exe` e `data`.
