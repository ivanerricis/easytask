/**
 * Classes of a trigger in the vertical category lists of a dialog (Settings, trash, archive). Besides the line on the
 * left of the "line" tabs, the open category gets a light accent tint and an accent icon. The background uses the same
 * variant prefix as the base class of `TabsTrigger`, so tailwind-merge replaces its `bg-transparent`.
 */
export const NAV_TAB_TRIGGER =
    "justify-start px-3 py-2 data-[state=active]:font-medium group-data-[variant=line]/tabs-list:data-[state=active]:bg-primary/10 data-[state=active]:[&_svg]:text-primary"
