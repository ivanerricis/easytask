import { Briefcase, FileText, Folder, Layers, LayoutList, LayoutTemplate, Images, Music, SquareCheck } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { formatDate } from "@/lib/utils"

/** Icon of every kind of item listed by the trash and the archive dialogs. */
export const ITEM_ICONS = {
    workspace: Briefcase,
    folder: Folder,
    note: FileText,
    section_group: Layers,
    section: LayoutList,
    task: SquareCheck,
    audio_file: Music,
    media_file: Images,
    note_template: LayoutTemplate,
} satisfies Record<string, LucideIcon>

/** "YYYY-MM-DD HH:MM:SS" -> date in the current language + "HH:MM". */
export const formatStoredDate = (value: string) => {
    if (!value) return ""
    const [date, time] = value.split(" ")
    return time ? `${formatDate(date)} ${time.slice(0, 5)}` : formatDate(date)
}
