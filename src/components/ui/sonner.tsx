import { useTheme } from "@/components/use-theme"
import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert } from "lucide-react"
import { toast, Toaster as Sonner } from "sonner"
import type { ToasterProps } from "sonner"

// Sonner has one duration for every type: success and info toasts go away quickly (the Toaster default),
// errors stay longer so they can be read. A duration passed to a single toast still wins.
const ERROR_DURATION = 8000
const showError = toast.error
if (typeof showError === "function") {
  toast.error = ((message, data) => showError(message, { duration: ERROR_DURATION, ...data })) as typeof toast.error
}

/**
 * The toasts in the look of the app instead of the one of Sonner: a card with the small corners and the 1px border of the
 * popovers, and the type told by a strip on the left (like the color of a task) and the color of its icon. A plain toast has
 * no strip. The colors are the semantic ones of the theme (success, destructive, info, warning), so every theme, the high
 * contrast ones included, keeps them readable. Buttons are the small buttons of the app.
 */
const TOAST_CLASSES: NonNullable<ToasterProps["toastOptions"]>["classNames"] = {
  // On a dark theme the popover is as dark as the note: the toast takes the lighter surface of the group panels and a brighter
  // border to stand out; the shadow is the light one of the menus
  toast: "group/toast relative flex w-[var(--width)] items-start gap-2.5 rounded-xs border border-l-[3px] bg-popover py-2.5 pl-3 pr-3 font-sans text-sm text-popover-foreground shadow-md dark:bg-secondary dark:border-y-foreground/20 dark:border-r-foreground/20",
  default: "border-l-border",
  success: "border-l-success [&_[data-icon]]:text-success",
  error: "border-l-destructive [&_[data-icon]]:text-destructive",
  info: "border-l-info [&_[data-icon]]:text-info",
  warning: "border-l-warning [&_[data-icon]]:text-warning",
  loading: "border-l-border [&_[data-icon]]:text-muted-foreground",
  // Everything lines up on the first line of text (20px): the icon, the buttons and the X are centered on it, a description goes below
  icon: "mt-0.5 flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
  content: "flex min-w-0 flex-1 flex-col gap-0.5",
  title: "font-semibold leading-5",
  description: "text-xs leading-4 text-muted-foreground",
  actionButton: "shrink-0 -my-1 h-7 rounded-xs bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  cancelButton: "shrink-0 -my-1 h-7 rounded-xs border px-2.5 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  // Inside the toast, last on the right
  closeButton: "order-last -my-0.5 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-xs border-0! bg-transparent! text-muted-foreground hover:bg-foreground/10! hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
}

const TOAST_ICONS: ToasterProps["icons"] = {
  success: <CircleCheck />,
  error: <CircleAlert />,
  info: <Info />,
  warning: <TriangleAlert />,
  loading: <Loader2 className="animate-spin" />,
}

const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      duration={3000}
      icons={TOAST_ICONS}
      toastOptions={{ unstyled: true, ...toastOptions, classNames: { ...TOAST_CLASSES, ...toastOptions?.classNames } }}
      {...props}
    />
  )
}

export { Toaster }
