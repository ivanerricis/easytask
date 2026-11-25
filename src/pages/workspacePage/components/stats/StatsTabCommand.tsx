import { useTabsActions } from "@/contexts/use-tabs"
import { useAppCommand } from "@/lib/app-commands"
import { STATS_TAB_ID } from "@/lib/tabs/virtual-tabs"

/** Opens the "Statistics" tab when the `open-stats` command is requested (sidebar footer, View menu). Renders nothing. */
export const StatsTabCommand = () => {
    const { openNote } = useTabsActions()
    useAppCommand("open-stats", () => openNote(STATS_TAB_ID))
    return null
}
