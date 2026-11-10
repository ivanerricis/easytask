# Contribuire

Grazie per voler dare una mano. Questa pagina spiega come proporre una modifica.

## Idee e bug

Per un bug o un'idea apri prima una [issue](https://github.com/ivanerricis/easytask/issues). Ci sono modelli per entrambi. Per una modifica grande, discutine in una issue prima di scrivere codice.

## Fare una modifica

1. Fai un fork del repository, oppure crea un branch se hai accesso.
2. Non fare mai commit direttamente su `master`: lavora su un branch come `feat/mia-modifica` o `fix/mio-bug`.
3. Fai la modifica, con i test. Per la configurazione vedi [Sviluppo in locale](./local).
4. Esegui i controlli (qui sotto).
5. Apri una pull request verso `master` e compila il modello.

## Messaggi di commit

Usa i conventional commit: un tipo, un ambito facoltativo, una breve descrizione.

```
feat(settings): settings search, system and data options
fix(audio): adapt the tag reading to the lofty 0.25 API
chore(deps): fix the webpki advisories
docs: release flow through a branch and PR
test(e2e): fix the toast wait
perf: speed up drag & drop
```

Tipi comuni: `feat`, `fix`, `perf`, `docs`, `test`, `chore`. I messaggi del progetto sono in inglese.

## Prima della pull request

```bash
npx eslint .
npx tsc -b
npm test
```

Se hai modificato `src-tauri`, esegui anche questi nella cartella:

```bash
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

La CI esegue gli stessi controlli, più le soglie di copertura e gli audit. Vedi [Test](./tests).

## Regole per il codice

- **Traduzioni:** ogni testo visibile all'utente deve esistere in entrambe le lingue, in `src/i18n/locales/it` e `src/i18n/locales/en`. Una chiave mancante rompe il controllo dei tipi, e una chiave nuova deve essere usata nel codice (altrimenti fallisce il test delle chiavi inutilizzate).
- **Componenti dell'interfaccia:** usa prima i componenti [shadcn/ui](https://ui.shadcn.com/) in `src/components/ui` e aggiungi quelli mancanti con la CLI di shadcn, invece di creare controlli nativi o personalizzati.
- **Database:** aggiungi una nuova migrazione; non modificare mai una già applicata. Vedi [Architettura](./architecture#migrazioni).
- **Test:** aggiungi o aggiorna i test per ciò che modifichi.

## Changelog

Per ogni modifica visibile all'utente aggiungi una riga sotto `## [Unreleased]` sia in `CHANGELOG.md` (inglese) sia in `CHANGELOG.it.md` (italiano). Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/).

## Release

Solo il maintainer pubblica le release. I passaggi sono in [RELEASING.md](https://github.com/ivanerricis/easytask/blob/master/RELEASING.md).

## Sicurezza

Non aprire una issue pubblica per una vulnerabilità. Segnalala in privato come descritto in [SECURITY.md](https://github.com/ivanerricis/easytask/blob/master/SECURITY.md).
