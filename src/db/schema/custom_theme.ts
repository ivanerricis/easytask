/**
 * Migration v14: the custom themes of the user. They are global (not per workspace), so the table has no foreign keys and
 * the export and import of a workspace never carry it. `colors` is the JSON of the ten editable colors (see ThemeColors).
 * @category Database Schema
 */
export const createCustomThemeTable: string[] = [
    `CREATE TABLE IF NOT EXISTS custom_themes (
        id TEXT PRIMARY KEY CHECK (id LIKE 'custom-%'),
        name TEXT NOT NULL CHECK (LENGTH(name) > 0),
        base TEXT NOT NULL CHECK (base IN ('light', 'dark')),
        colors TEXT NOT NULL CHECK (json_valid(colors)),
        accent TEXT NOT NULL CHECK (LENGTH(accent) > 0),
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );`,
]
