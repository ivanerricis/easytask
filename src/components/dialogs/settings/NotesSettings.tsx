import { useTranslation } from "react-i18next"
import { usePreferences } from "@/contexts/use-preferences"
import { SegmentedSetting } from "./SegmentedSetting"
import { SettingsPanel, SettingsSubsection, SettingsSwitchRow } from "./SettingsRow"
import { StartupWorkspaceSetting } from "./StartupWorkspaceSetting"

const TASK_DENSITY_OPTIONS = ["compact", "normal", "large"] as const
const COLLAPSED_GROUP_LAYOUT_OPTIONS = ["vertical", "horizontal"] as const
const NEW_TASK_POSITION_OPTIONS = ["bottom", "top"] as const

export const NotesSettings = () => {
    const { t } = useTranslation()
    const {
        showProgressBar, setShowProgressBar,
        showGroupProgressBar, setShowGroupProgressBar,
        showSectionCount, setShowSectionCount,
        showTaskCount, setShowTaskCount,
        showAudioFileCount, setShowAudioFileCount,
        showGroupSeparators, setShowGroupSeparators,
        showSubtaskCount, setShowSubtaskCount,
        showUnnamedLabels, setShowUnnamedLabels,
        taskBackground, setTaskBackground,
        renameOnClick, setRenameOnClick,
        keepAddingTasks, setKeepAddingTasks,
        showTaskInsertLine, setShowTaskInsertLine,
        liveDrag, setLiveDrag,
        collapsedGroupLayout, setCollapsedGroupLayout,
        taskDensity, setTaskDensity,
        newTaskPosition, setNewTaskPosition,
        spellcheck, setSpellcheck,
        confirmDeleteWithContent, setConfirmDeleteWithContent,
        hideCompletedTasks, setHideCompletedTasks,
        completedTasksLast, setCompletedTasksLast,
        reopenNotes, setReopenNotes,
    } = usePreferences()

    return (
        <SettingsPanel title={t("settings.notes.title")}>
            <SettingsSubsection title={t("settings.notes.sections.progress")}>
                <SettingsSwitchRow label={t("settings.notes.progressBar.label")} description={t("settings.notes.progressBar.description")} checked={showProgressBar} onCheckedChange={setShowProgressBar} />
                <SettingsSwitchRow label={t("settings.notes.groupProgressBar.label")} description={t("settings.notes.groupProgressBar.description")} checked={showGroupProgressBar} onCheckedChange={setShowGroupProgressBar} />
            </SettingsSubsection>
            <SettingsSubsection title={t("settings.notes.sections.counts")}>
                <SettingsSwitchRow label={t("settings.notes.sectionCount")} checked={showSectionCount} onCheckedChange={setShowSectionCount} />
                <SettingsSwitchRow label={t("settings.notes.taskCount")} checked={showTaskCount} onCheckedChange={setShowTaskCount} />
                <SettingsSwitchRow label={t("settings.notes.audioFileCount")} checked={showAudioFileCount} onCheckedChange={setShowAudioFileCount} />
                <SettingsSwitchRow label={t("settings.notes.subtaskCount.label")} description={t("settings.notes.subtaskCount.description")} checked={showSubtaskCount} onCheckedChange={setShowSubtaskCount} />
            </SettingsSubsection>
            <SettingsSubsection title={t("settings.notes.sections.display")}>
                <SettingsSwitchRow label={t("settings.notes.groupSeparators.label")} description={t("settings.notes.groupSeparators.description")} checked={showGroupSeparators} onCheckedChange={setShowGroupSeparators} />
                <SettingsSwitchRow label={t("settings.notes.unnamedLabels.label")} description={t("settings.notes.unnamedLabels.description")} checked={showUnnamedLabels} onCheckedChange={setShowUnnamedLabels} />
                <SettingsSwitchRow label={t("settings.notes.taskBackground.label")} description={t("settings.notes.taskBackground.description")} checked={taskBackground} onCheckedChange={setTaskBackground} />
                <SettingsSwitchRow label={t("settings.notes.hideCompleted.label")} description={t("settings.notes.hideCompleted.description")} checked={hideCompletedTasks} onCheckedChange={setHideCompletedTasks} />
                <SettingsSwitchRow label={t("settings.notes.completedLast.label")} description={t("settings.notes.completedLast.description")} checked={completedTasksLast} onCheckedChange={setCompletedTasksLast} />
                <SegmentedSetting
                    label={t("settings.notes.collapsedGroupLayout.label")}
                    description={t("settings.notes.collapsedGroupLayout.description")}
                    value={collapsedGroupLayout}
                    options={COLLAPSED_GROUP_LAYOUT_OPTIONS.map(value => ({ value, label: t(`settings.notes.collapsedGroupLayout.${value}`) }))}
                    onChange={setCollapsedGroupLayout}
                />
                <SegmentedSetting
                    label={t("settings.notes.taskDensity.label")}
                    description={t("settings.notes.taskDensity.description")}
                    value={taskDensity}
                    options={TASK_DENSITY_OPTIONS.map(value => ({ value, label: t(`settings.notes.taskDensity.${value}`) }))}
                    onChange={setTaskDensity}
                />
            </SettingsSubsection>
            <SettingsSubsection title={t("settings.notes.sections.behavior")}>
                <SettingsSwitchRow label={t("settings.notes.renameOnClick.label")} description={t("settings.notes.renameOnClick.description")} checked={renameOnClick} onCheckedChange={setRenameOnClick} />
                <SettingsSwitchRow label={t("settings.notes.keepAddingTasks.label")} description={t("settings.notes.keepAddingTasks.description")} checked={keepAddingTasks} onCheckedChange={setKeepAddingTasks} />
                <SettingsSwitchRow label={t("settings.notes.showTaskInsertLine.label")} description={t("settings.notes.showTaskInsertLine.description")} checked={showTaskInsertLine} onCheckedChange={setShowTaskInsertLine} />
                <SettingsSwitchRow label={t("settings.notes.liveDrag.label")} description={t("settings.notes.liveDrag.description")} checked={liveDrag} onCheckedChange={setLiveDrag} />
                <SegmentedSetting
                    label={t("settings.notes.newTaskPosition.label")}
                    description={t("settings.notes.newTaskPosition.description")}
                    value={newTaskPosition}
                    options={NEW_TASK_POSITION_OPTIONS.map(value => ({ value, label: t(`settings.notes.newTaskPosition.${value}`) }))}
                    onChange={setNewTaskPosition}
                />
                <SettingsSwitchRow label={t("settings.notes.spellcheck.label")} description={t("settings.notes.spellcheck.description")} checked={spellcheck} onCheckedChange={setSpellcheck} />
                <SettingsSwitchRow label={t("settings.notes.confirmDelete.label")} description={t("settings.notes.confirmDelete.description")} checked={confirmDeleteWithContent} onCheckedChange={setConfirmDeleteWithContent} />
            </SettingsSubsection>
            <SettingsSubsection title={t("settings.notes.sections.startup")}>
                <StartupWorkspaceSetting />
                <SettingsSwitchRow label={t("settings.notes.reopenNotes.label")} description={t("settings.notes.reopenNotes.description")} checked={reopenNotes} onCheckedChange={setReopenNotes} />
            </SettingsSubsection>
        </SettingsPanel>
    )
}
