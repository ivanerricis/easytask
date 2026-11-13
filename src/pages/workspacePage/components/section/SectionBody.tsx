import { memo } from "react"
import { useTranslation } from "react-i18next"
import type { Section } from "@/types/types"
import { AddTask } from "../tasks/AddTask"
import { TaskList } from "../tasks/TaskList"

type SectionBodyProps = {
    isOpen: boolean
    section: Section
}

export const SectionBody = memo(({ isOpen, section }: SectionBodyProps) => {
    const { t } = useTranslation()
    return (
    <div className={`flex flex-col w-full bg-body-surface ${isOpen ? 'h-full' : 'hidden'}`}>
        <TaskList tasks={section.tasks} listKey={`s-${section.id}`} sectionId={section.id} clipped label={t("tasks.listOf", { name: section.title })} />
        <AddTask sectionId={section.id} emptySection={section.tasks.length === 0} />
    </div>
    )
})
