import { common, ui, layout, dnd } from "./common"
import { dialogs } from "./dialogs"
import { audio } from "./audio"
import { media } from "./media"
import { shortcuts } from "./shortcuts"
import { settings } from "./settings"
import { undo, archive, trash, history } from "./archive"
import { errors, crash, errorPage } from "./errors"
import { window, appMenu, textMenu, menu } from "./menus"
import { home, workspace, notes, groups, sidebar, templates, sections } from "./workspace"
import { tasks, transfer, duplicate } from "./tasks"
import { details, rightPanel } from "./details"
import { automations } from "./automations"
import { templateEditor } from "./template-editor"

export const it = {
    common,
    dialogs,
    audio,
    media,
    settings,
    shortcuts,
    undo,
    archive,
    trash,
    errors,
    window,
    appMenu,
    crash,
    errorPage,
    textMenu,
    duplicate,
    menu,
    home,
    workspace,
    notes,
    groups,
    sidebar,
    templates,
    ui,
    sections,
    tasks,
    transfer,
    dnd,
    layout,
    history,
    rightPanel,
    details,
    automations,
    templateEditor,
}

export type Translation = typeof it
