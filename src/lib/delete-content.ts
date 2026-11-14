import type { Group, Section } from "@/types/types"

/** A section has content when it holds at least one task. */
export const sectionHasContent = (section: Pick<Section, "tasks">): boolean => (section.tasks?.length ?? 0) > 0

/**
 * A group has content when it has a named section, a task (in a section or directly in the group), an audio file, an image or a video.
 * @param audioFileCount How many linked files (audio, images and videos) the group has.
 */
export const groupHasContent = (group: Pick<Group, "sections" | "defaultSection">, audioFileCount: number): boolean =>
    audioFileCount > 0
    || (group.defaultSection?.tasks?.length ?? 0) > 0
    || (group.sections ?? []).some(section => section.title.trim().length > 0 || sectionHasContent(section))
