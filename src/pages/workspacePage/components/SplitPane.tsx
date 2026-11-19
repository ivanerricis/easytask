import { memo, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useLayoutActions, usePane } from "@/contexts/use-layout"
import type { PaneIndex } from "@/contexts/layout-reducer"
import { MIN_PANE_WIDTH } from "@/lib/split-layout"
import { cn } from "@/lib/utils"
import { BlankNote } from "./BlankNote"
import { EmptyPane } from "./EmptyPane"
import { PaneBody } from "./PaneBody"

type SplitPaneProps = {
    pane: PaneIndex
    /**
     * Whether the workspace is split. Not split, the pane is the whole centre of the workspace (no region, no minimum width);
     * split, it takes its share of the container from the `--split-ratio` custom property the container carries (share of the left pane).
     */
    split: boolean
}

/**
 * A pane of the workspace: its tab bar and its note (or the empty placeholder). It is meant to be rendered inside the `PaneProvider` of
 * the same pane, whose root ref it attaches (without one it still renders, but cannot give the pane the focus). A press or the focus inside it gives it the focus. The same component renders the
 * only pane of the unsplit workspace, so the left pane keeps its identity (search, scroll, groups) when the workspace is split.
 * Memoized: its width comes from a CSS variable, so moving the divider or resizing the window does not re-render it.
 */
export const SplitPane = memo(function SplitPane({ pane, split }: SplitPaneProps) {
    const { t } = useTranslation()
    const { focusPane } = useLayoutActions()
    // Without a PaneProvider (no layout) the pane has no root ref to attach and always counts as focused
    const paneContext = usePane()
    const rootRef = paneContext?.rootRef
    const focused = paneContext?.focused ?? true
    const empty = useMemo(() => split ? <EmptyPane pane={pane} /> : <BlankNote />, [split, pane])

    const claimFocus = () => { if (paneContext && !paneContext.isFocused()) focusPane(pane) }

    return (
        <div
            ref={rootRef}
            role={split ? "region" : undefined}
            aria-label={split ? t(pane === 0 ? "notes.split.leftPane" : "notes.split.rightPane") : undefined}
            data-pane={split ? pane : undefined}
            data-focused={split ? focused : undefined}
            className={cn(
                "relative flex min-w-0 flex-col overflow-hidden",
                split ? "border-t-2 border-t-transparent" : "w-full",
                split && focused && "border-t-primary",
            )}
            style={split
                ? {
                    flexBasis: pane === 0 ? "calc(var(--split-ratio) * 100%)" : "calc((1 - var(--split-ratio)) * 100%)",
                    flexGrow: 0,
                    minWidth: MIN_PANE_WIDTH,
                }
                : undefined}
            onPointerDownCapture={split ? claimFocus : undefined}
            onFocusCapture={split ? claimFocus : undefined}
        >
            <PaneBody empty={empty} alwaysTabs={split} dimmed={split && !focused} />
        </div>
    )
})
