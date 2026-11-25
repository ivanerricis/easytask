import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import { DialogCreateWorkspace } from "./components/DialogCreateWorkspace"
import { Loader2, LayoutGrid, LayoutList, Download, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/contexts/use-workspace"
import { ErrorPage } from "@/components/pages/error-page"
import { LoadingPage } from "@/components/pages/loading-page"
import { MainPageLayout } from "./MainPageLayout"
import { WorkspacesContainer } from "./components/WorkspacesContainer"
import { ButtonTrashWorkspaces } from "./components/ButtonTrashWorkspaces"
import { TooltipCustom } from "@/components/tooltip-custom"
import { usePreferences } from "@/contexts/use-preferences"
import { useWorkspaceTransfer } from "@/hooks/use-workspace-transfer"
import { reportError } from "@/lib/report-error"
import { useStartupRestore } from "./startup-restore"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { WorkspaceSortBy, WorkspaceSortDir } from "@/lib/store/preferences"

const WorkspaceSortMenu = () => {
    const { t } = useTranslation()
    const { workspaceSort, setWorkspaceSort } = usePreferences()
    const isNameSort = workspaceSort.by === "name"
    return (
        <DropdownMenu>
            <TooltipCustom text={t("home.sort.label")}>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label={t("home.sort.label")}>
                        <ArrowUpDown />
                    </Button>
                </DropdownMenuTrigger>
            </TooltipCustom>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("home.sort.by")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={workspaceSort.by}
                    onValueChange={(by) => setWorkspaceSort({ ...workspaceSort, by: by as WorkspaceSortBy })}>
                    <DropdownMenuRadioItem value="edited">{t("home.sort.edited")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="created">{t("home.sort.created")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name">{t("home.sort.name")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("home.sort.direction")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={workspaceSort.dir}
                    onValueChange={(dir) => setWorkspaceSort({ ...workspaceSort, dir: dir as WorkspaceSortDir })}>
                    <DropdownMenuRadioItem value="asc">
                        {t(isNameSort ? "home.sort.nameAsc" : "home.sort.dateAsc")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="desc">
                        {t(isNameSort ? "home.sort.nameDesc" : "home.sort.dateDesc")}
                    </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

const MainPage = () => {
    const { t } = useTranslation()
    const { workspaces, getWorkspaces, error } = useWorkspace()
    const [loaded, setLoaded] = useState(false)
    const { workspaceView, setWorkspaceView, workspaceSort, reopenLastWorkspace } = usePreferences()
    const { importWorkspace, isBusy: isImporting } = useWorkspaceTransfer()
    const isList = workspaceView === "list"
    const { pending: restorePending } = useStartupRestore(loaded)

    useEffect(() => {
        getWorkspaces().catch(error => reportError(error)).finally(() => setLoaded(true))
    }, [getWorkspaces])

    // reopenLastWorkspace comes from the preferences context here, while startup-restore.ts reads the store directly (it runs
    // before the context may be ready); both read the same persisted preference.
    // When the last workspace is going to be reopened the home page is not shown at all (it would only flash): a loading
    // page until the check is done. Otherwise the page is shown at once, with the workspaces drawn as skeletons until
    // they are loaded. Only the first load counts: later operations (e.g. restoring a workspace from the trash) must not
    // unmount the page, or the open trash dialog would be closed
    if (restorePending && reopenLastWorkspace) {
        return (
            <MainPageLayout>
                <LoadingPage text={t("home.loading")}/>
            </MainPageLayout>
        )
    }

    if (loaded && error && workspaces.length === 0) {
        return (
            <MainPageLayout>
                <ErrorPage error={error} onRetry={() => { getWorkspaces().catch(err => reportError(err)) }} />
            </MainPageLayout>
        )
    }

    return (
        <MainPageLayout>
            <div className="flex flex-col w-full max-w-[600px] px-4 h-full items-center justify-center gap-8">
                <h1 className="text-4xl">{t("home.welcome")}</h1>
                {/* The two actions side by side, same width */}
                <div className="grid w-full grid-cols-2 gap-3">
                    <DialogCreateWorkspace />
                    <Button
                        variant="outline"
                        onClick={() => void importWorkspace()}
                        disabled={isImporting}
                        className="flex items-center justify-center w-full min-w-0 p-6 rounded-xs gap-2 text-lg border-primary transition-all"
                    >
                        {isImporting ? <Loader2 className="h-5! w-5! animate-spin" /> : <Download className="h-5! w-5!" />}
                        {t("home.import")}
                    </Button>
                </div>
                <div className="flex flex-col items-center justify-center w-full p-2 gap-2 border rounded-xs">
                    <div className="flex items-center justify-between w-full">
                        <h2 className="text-lg w-full ml-2">
                            {t("home.recent")}
                        </h2>
                        <div className="flex items-center gap-1">
                            <TooltipCustom text={isList ? t("home.viewGrid") : t("home.viewList")}>
                                <Button
                                    onClick={() => setWorkspaceView(isList ? "grid" : "list")}
                                    variant="outline"
                                    size="icon"
                                    aria-label={isList ? t("home.viewGrid") : t("home.viewList")}>
                                    {isList ? <LayoutGrid /> : <LayoutList />}
                                </Button>
                            </TooltipCustom>
                            <WorkspaceSortMenu />
                            <ButtonTrashWorkspaces />
                        </div>
                    </div>
                    <WorkspacesContainer workspaces={workspaces} view={workspaceView} sort={workspaceSort} loading={!loaded} />
                </div>
            </div>
        </MainPageLayout>
    )
}

export default MainPage;