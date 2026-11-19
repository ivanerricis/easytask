/**
 * The three dots after a loading text ("Loading..."), shown one after the other. They are decorative (the text is the
 * announcement), and static when the animations are off: the speed "none" of the app or the reduced motion of the system
 * (index.css).
 */
export const LoadingDots = () => (
    <span aria-hidden="true" data-testid="loading-dots" className="loading-dots">
        <span className="loading-dot">.</span>
        <span className="loading-dot">.</span>
        <span className="loading-dot">.</span>
    </span>
)
