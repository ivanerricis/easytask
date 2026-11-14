export const home = {
    loading: "Caricamento dei workspace…",
    welcome: "Bentornato!",
    import: "Importa un workspace",
    recent: "Apri un workspace recente",
    viewGrid: "Visualizza come griglia",
    viewList: "Visualizza come lista",
    sort: {
        label: "Ordina",
        by: "Ordina per",
        direction: "Direzione",
        edited: "Ultima modifica",
        created: "Data creazione",
        name: "Nome",
        nameAsc: "Dalla A alla Z",
        nameDesc: "Dalla Z alla A",
        dateAsc: "Prima i meno recenti",
        dateDesc: "Prima i più recenti",
    },
    createWorkspace: {
        title: "Crea workspace",
        name: "Nome",
        open: "Nuovo workspace",
    },
    workspace: {
        open: "Apri il workspace {{name}}",
    },
    noWorkspacesHint: "Crea il tuo primo workspace per iniziare.",
}

export const workspace = {
    loading: "Caricamento dati del workspace…",
    combobox: {
        select: "Seleziona workspace…",
        search: "Cerca un workspace…",
        empty: "Nessun workspace trovato.",
        label: "Workspace: {{name}}",
    },
    backHome: "Torna alla home",
}

export const notes = {
    blank: {
        title: "Nessuna nota aperta",
    },
    hints: {
        allShortcuts: "Tutte le scorciatoie",
        newGroup: "Nuovo gruppo o sezione",
        search: "Cerca una nota",
    },
    empty: {
        title: "Nota vuota",
    },
    closeAll: "Chiudi tutte le note",
    split: {
        split: "Dividi in due aree",
        close: "Chiudi la divisione",
        divider: "Ridimensiona le due aree",
        dividerValue: "{{percent}}% a sinistra",
        emptyTitle: "Area vuota",
        emptyHint: "Trascina qui un tab oppure usa \"Apri a destra\" dal menu di una nota.",
        leftPane: "Area sinistra",
        rightPane: "Area destra",
        openTabsPane: "Note aperte, {{pane}}",
    },
    search: {
        placeholder: "Cerca una nota…",
        empty: "Nessun risultato.",
        suggestions: "Suggerimenti",
        short: "Cerca…",
    },
    noteSearch: {
        inNote: "Cerca nella nota",
        placeholder: "Cerca nella nota…",
        counter: "{{current}} di {{total}}",
        next: "Risultato successivo",
        previous: "Risultato precedente",
        close: "Chiudi la ricerca",
    },
    hideCompleted: "Nascondi task completati",
    showCompleted: "Mostra task completati",
    path: {
        label: "Percorso della nota",
        reveal: "Mostra {{name}} nella barra laterale",
    },
    closeCurrent: "Chiudi nota corrente",
    close: "Chiudi nota",
    openTabs: "Note aperte",
    moveTabLeft: "Sposta tab a sinistra",
    moveTabRight: "Sposta tab a destra",
}

export const groups = {
    defaultLabel: "Gruppo {{index}}",
    directTasks: "Task del gruppo",
    addTask: "Nuovo task",
    collapse: "Comprimi gruppo",
    expand: "Espandi gruppo",
    renameAria: "Nome gruppo: {{name}}, premi Invio per rinominare",
    nameLabel: "Nome del gruppo",
    renameError: "Impossibile cambiare il nome del gruppo: {{message}}",
    namePlaceholder: "Nome del gruppo…",
    progress: "Avanzamento del gruppo",
    audioCount_one: "{{count}} file audio",
    audioCount_other: "{{count}} file audio",
    mediaCount_one: "{{count}} immagine o video",
    mediaCount_other: "{{count}} immagini e video",
    width: {
        handle: "Ridimensiona il gruppo",
        value: "{{width}} pixel",
        auto: "larghezza automatica",
    },
}

export const sidebar = {
    addFolder: "Nuova cartella",
    addNote: "Nuova nota",
    addNoteFromTemplate: "Nuova nota da template",
    importItems: "Importa una nota o una cartella",
    trashBadge_one: "{{count}} elemento nel cestino",
    trashBadge_other: "{{count}} elementi nel cestino",
    archiveBadge_one: "{{count}} elemento nell'archivio",
    archiveBadge_other: "{{count}} elementi nell'archivio",
    expandAll: "Espandi tutte le cartelle",
    collapseAll: "Comprimi tutte le cartelle",
    info: {
        description: "Descrizione",
        placeholder: "Scrivi qualcosa per descrivere il task…",
    },
    toggle: "Mostra o nascondi la barra laterale",
    emptyTree: "Nessuna cartella o nota",
    emptyTreeHint: "Crea una nota o una cartella per iniziare.",
    treeLabel: "Cartelle e note",
    holdsOpenNote: "Contiene la nota aperta",
}

export const templates = {
    badge_one: "{{count}} template",
    badge_other: "{{count}} template",
}

export const sections = {
    new: "Nuova sezione",
    titlePlaceholder: "Titolo della sezione…",
    untitled: "Sezione senza titolo",
    renameAria: "Titolo sezione: {{name}}, premi Invio per rinominare",
    titleLabel: "Titolo della sezione",
    renameError: "Impossibile cambiare il titolo della sezione: {{message}}",
    collapse: "Comprimi sezione",
    expand: "Espandi sezione",
    progress: "Avanzamento della sezione",
}
