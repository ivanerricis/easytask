import { Navbar } from "@/components/navbar"
import { ShortcutsHelpButton } from "@/components/shortcuts-help-button"
import { AppMenu } from "@/components/app-menu"
import { DialogSettings } from "@/components/dialogs/dialog-settings"

type MainPageLayoutProps = {
    children: React.ReactNode
}

export const MainPageLayout = ({ children }: MainPageLayoutProps) => {
    return (
        <div className="relative flex flex-col h-full w-full">
            <Navbar leftContainer={<AppMenu page="home" />} rightContainer={<ShortcutsHelpButton />} />
            <main className="flex flex-col w-full h-full items-center justify-center">
                {children}
            </main>
            <DialogSettings className="absolute left-1 bottom-1" />
        </div>
    )
}