import { useTheme } from "@/components/use-theme"
import { toast, Toaster as Sonner } from "sonner"
import type { ToasterProps } from "sonner"

// Sonner has one duration for every type: success and info toasts go away quickly (the Toaster default),
// errors stay longer so they can be read. A duration passed to a single toast still wins.
const ERROR_DURATION = 8000
const showError = toast.error
if (typeof showError === "function") {
  toast.error = ((message, data) => showError(message, { duration: ERROR_DURATION, ...data })) as typeof toast.error
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      duration={3000}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
