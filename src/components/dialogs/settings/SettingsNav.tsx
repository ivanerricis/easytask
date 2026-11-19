import { useTranslation } from "react-i18next"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { NAV_TAB_TRIGGER } from "../nav-tab"
import type { SettingsCategory } from "./categories"

type SettingsNavProps = {
    categories: SettingsCategory[]
    /** Called when a category is chosen, also when it is the active one (the dialog clears the search). */
    onSelect?: () => void
}

/** The categories of the settings: the vertical tab list of the dialog (arrows move between them). Must be inside a `Tabs`. */
export const SettingsNav = ({ categories, onSelect }: SettingsNavProps) => {
    const { t } = useTranslation()
    return (
        <TabsList
            variant="line"
            aria-label={t("settings.nav")}
            className="w-full shrink-0 h-fit justify-start self-start gap-1 p-0"
        >
            {categories.map(({ id, labelKey, icon: Icon }) => (
                <TabsTrigger
                    key={id}
                    value={id}
                    onClick={onSelect}
                    className={cn("flex-1", NAV_TAB_TRIGGER)}
                >
                    <Icon />
                    {t(labelKey)}
                </TabsTrigger>
            ))}
        </TabsList>
    )
}
