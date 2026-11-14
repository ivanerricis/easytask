import { createAudioFileIndexes, createTableAudioFile } from "./audio_file";
import { automationSchema } from "./automation";
import { addFolderArchivedAt, createFolderIndexes, createFolderTable, createFolderTrigger } from "./folder";
import { addNoteArchivedAt, addNoteBackground, addNoteTemplateDraft, createNoteIndexes, createNoteTable, createNoteTrigger } from "./note";
import { createNoteTemplateIndexes, createNoteTemplateTable, createNoteTemplateTrigger } from "./note_template";
import { addSectionArchivedAt, addSectionDefaultFlag, addSectionSharedOrder, makeSectionTitleOptional, createSectionIndexes, createSectionTable, createSectionTrigger } from "./section";
import { addCollapsedColumns } from "./collapsed";
import { addGroupArchivedAt, addGroupColorColumn, addGroupWidthColumn, createSectionGroupIndexes, createSectionGroupTable } from "./section_group";
import { createTaskIndexes, createTaskTable, addTaskArchivedAt, createTaskTrigger, dropTaskArchivedColumn } from "./task";
import { createWorkspaceEditTriggers } from "./workspace_edit";
import { createCustomThemeTable } from "./custom_theme";
import { mediaFileSchema } from "./media_file";
import { tagSchema } from "./tag";
import { trashIndexSchema } from "./trash_index";
import { createWorkspaceIndexes, createWorkspaceTable, createWorkspaceTrigger } from "./workspace";

/**
 * Value stored in PRAGMA application_id by the initial schema ("EASY" in ASCII).
 * It tells the current schema lineage apart from the legacy databases (which have user_version > 0
 * but application_id = 0), because their user_version numbers overlap with the current ones.
 * @category Database Schema
 */
export const APPLICATION_ID = 0x45415359;

/**
 * Statements that create the whole (final) schema on an empty database, in dependency order.
 * Every statement is idempotent (IF NOT EXISTS / DROP TRIGGER IF EXISTS), so a run interrupted
 * halfway can simply be retried.
 * @category Database Schema
 */
export const initialSchema: string[] = [
    createWorkspaceTable,
    createWorkspaceIndexes,
    createFolderTable,
    createFolderIndexes,
    createNoteTable,
    createNoteIndexes,
    createSectionGroupTable,
    createSectionGroupIndexes,
    createSectionTable,
    createSectionIndexes,
    createTaskTable,
    createTaskIndexes,
    createTableAudioFile,
    createAudioFileIndexes,
    createNoteTemplateTable,
    createNoteTemplateIndexes,
    createWorkspaceTrigger,
    createFolderTrigger,
    createNoteTrigger,
    createSectionTrigger,
    createTaskTrigger,
    createNoteTemplateTrigger,
    `PRAGMA application_id = ${APPLICATION_ID}`,
];

/**
 * Migration v4: archive date (`archived_at`) on folders, notes, groups and sections, with the unique names ignoring the
 * archived ones; removes the old unused `archived` flag of sections and tasks.
 * @category Database Schema
 */
export const archiveSchema: string[] = [
    ...addFolderArchivedAt, ...addNoteArchivedAt, ...addGroupArchivedAt, ...addSectionArchivedAt, ...dropTaskArchivedColumn,
]

/**
 * Migration v6: archive date on the tasks.
 * @category Database Schema
 */
export const taskArchiveSchema: string[] = [...addTaskArchivedAt]

/**
 * Migration v7: the title of a section is optional.
 * @category Database Schema
 */
export const sectionTitleSchema: string[] = [...makeSectionTitleOptional]

/**
 * Migration v8: hidden default section per group (tasks directly in the group) and width of the groups.
 * @category Database Schema
 */
export const groupStructureSchema: string[] = [...addSectionDefaultFlag, ...addGroupWidthColumn]

/**
 * Migration v9: the default section takes part in the order of the sections of its group.
 * @category Database Schema
 */
export const sectionOrderSchema: string[] = [...addSectionSharedOrder]

/**
 * Migration v10: saved open/closed state (`collapsed`) of groups, sections and tasks.
 * @category Database Schema
 */
export const collapsedSchema: string[] = [...addCollapsedColumns]

/**
 * Migration v11: the working copy (draft) of a template while it is edited, a note with no workspace (`note.templateID`).
 * @category Database Schema
 */
export const templateDraftSchema: string[] = [...addNoteTemplateDraft]

/**
 * Migration v12: partial indexes on the trashed and archived rows (trash/archive views, auto-empty of the trash).
 * @category Database Schema
 */
export const trashIndexesSchema: string[] = [...trashIndexSchema]

/**
 * Migration v13: background color of the notes (and of the templates, which copy it).
 * @category Database Schema
 */
export const noteBackgroundSchema: string[] = [...addNoteBackground]

/**
 * Migration v14: table of the custom themes.
 * @category Database Schema
 */
export const customThemeSchema: string[] = [...createCustomThemeTable]

/**
 * Migration v15: table of the images and videos linked to the groups.
 * @category Database Schema
 */
export { mediaFileSchema, tagSchema }

/**
 * The whole schema at the latest version (initial schema plus every additive migration), as statements.
 * Used by the tests to build a database in one go: the app itself goes through the migrations in initDb.
 * @category Database Schema
 */
export const latestSchema: string[] = [
    ...initialSchema, addGroupColorColumn, ...createWorkspaceEditTriggers, ...archiveSchema, ...automationSchema, ...taskArchiveSchema, ...sectionTitleSchema, ...groupStructureSchema, ...sectionOrderSchema, ...collapsedSchema, ...templateDraftSchema, ...trashIndexesSchema, ...noteBackgroundSchema, ...customThemeSchema, ...mediaFileSchema, ...tagSchema,
]
