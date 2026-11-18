import { ItemMenuButton } from "@/components/item-menu"
import { useItemSize } from "./item-size"
import { stopDragActivation } from "./tree-row"

/** The menu button at the end of a tree row, shown on hover or focus; its events do not start a drag of the row. */
export const TreeRowMenu = ({ name, tabStop }: { name: string, tabStop: boolean }) => {
    const size = useItemSize()
    return (
        <div className={`flex items-center leading-none shrink-0 px-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100`} {...stopDragActivation}>
            <ItemMenuButton size={size.menu} name={name} tabIndex={tabStop ? undefined : -1} />
        </div>
    )
}
