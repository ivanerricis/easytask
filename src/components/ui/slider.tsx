import * as React from "react"
import { cn } from "@/lib/utils"
import * as SliderPrimitive from "@radix-ui/react-slider"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-valuetext": ariaValuetext,
  onValueChange,
  onValueDrag,
  deferChange = false,
  thumbClassName,
  onValueCommit,
  onPointerDown,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  "aria-valuetext"?: string
  /** Called on every move of a pointer drag, for a cheap local preview (a label); never for the keys. */
  onValueDrag?: (value: number[]) => void
  /** The owner hears of a pointer drag only when the thumb is released (the keys still apply at once). */
  deferChange?: boolean
  /** Classes of the thumb(s), over the default ones (e.g. a bigger one). */
  thumbClassName?: string
}) {
  // While the thumb is dragged it follows the pointer from a local value, and the owner is told at most once per frame:
  // a controlled value that is stored (and re-renders a tree of consumers) on every pointer move made the thumb lag
  const [dragValue, setDragValue] = React.useState<number[] | null>(null)
  const frame = React.useRef<number | null>(null)
  const pointerDown = React.useRef(false)
  const latest = React.useRef<number[] | null>(null)
  const onChangeRef = React.useRef(onValueChange)
  React.useEffect(() => { onChangeRef.current = onValueChange })

  const flush = React.useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    const next = latest.current
    latest.current = null
    if (next) onChangeRef.current?.(next)
  }, [])
  React.useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])

  const shown = value !== undefined ? (dragValue ?? value) : value
  const _values = React.useMemo(
    () =>
      Array.isArray(shown)
        ? shown
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [shown, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={shown}
      onValueChange={(next) => {
        // Keys (and a controlled-less slider) apply at once; only the pointer drag is coalesced
        if (value === undefined || !pointerDown.current) return onValueChange?.(next)
        setDragValue(next)
        onValueDrag?.(next)
        latest.current = next
        if (!deferChange) frame.current ??= requestAnimationFrame(() => { frame.current = null; flush() })
      }}
      onPointerDown={(e) => { pointerDown.current = true; onPointerDown?.(e) }}
      onValueCommit={(next) => {
        pointerDown.current = false
        flush()
        setDragValue(null)
        onValueCommit?.(next)
      }}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          aria-valuetext={ariaValuetext}
          className={cn("block size-4 shrink-0 rounded-full border border-primary bg-thumb shadow-sm ring-ring transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50", thumbClassName)}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
