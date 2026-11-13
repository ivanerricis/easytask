import { cn } from "@/lib/utils"

type ProgressRingProps = {
    /** Completion, 0-100. */
    value: number
    /** Accessible name (what is completed). */
    "aria-label": string
    /** Diameter in px. */
    size?: number
    /** Color of the arc (and of the full disc at 100%); default the primary color of the theme. */
    color?: string
    className?: string
}

/**
 * The completion of a group or a section as a ring: the arc grows with the percentage, at 100% the ring fills and shows a check.
 * A progressbar for the screen readers, like the bar it replaces. The arc grows with a short transition, none with reduced motion.
 * @category UI
 */
export function ProgressRing({ value, size = 18, color, className, "aria-label": label }: ProgressRingProps) {
    const percent = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
    const stroke = size >= 20 ? 2.5 : 2.25
    const radius = size / 2 - stroke / 2 - 0.5
    const circumference = 2 * Math.PI * radius
    const full = percent >= 100
    const center = size / 2
    const arc = color ?? "var(--color-primary)"

    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            data-slot="progress-ring"
            className={cn("inline-flex shrink-0", className)}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                <circle cx={center} cy={center} r={radius} fill={full ? arc : "none"} stroke="var(--color-border)" strokeWidth={stroke} />
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={arc}
                    strokeWidth={stroke}
                    strokeLinecap={percent > 0 && !full ? "round" : "butt"}
                    strokeDasharray={`${(circumference * percent) / 100} ${circumference}`}
                    transform={`rotate(-90 ${center} ${center})`}
                    className="transition-[stroke-dasharray] duration-200 motion-reduce:transition-none"
                />
                {full && <path
                    d={`M${size * 0.3} ${size * 0.52} l${size * 0.14} ${size * 0.14} l${size * 0.26} ${-size * 0.3}`}
                    fill="none"
                    stroke="var(--color-primary-foreground)"
                    strokeWidth={stroke * 0.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />}
            </svg>
        </div>
    )
}
