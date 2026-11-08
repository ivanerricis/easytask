import { cva } from "class-variance-authority"

export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xs text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/30 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-transparent border-2 border-destructive/70 shadow-xs text-destructive hover:bg-destructive/15",
        destructiveSolid:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        outline:
          "bg-background shadow-xs hover:bg-control-hover hover:text-accent-foreground border",
        buttonIcon:
          "bg-background shadow-xs hover:bg-control-hover hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-control-hover hover:text-accent-foreground",
        link: "text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-xs gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-xs px-6 has-[>svg]:px-4",
        icon: "size-8 [&_svg]:!h-5 [&_svg]:!w-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
