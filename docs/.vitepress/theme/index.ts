import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { useRoute } from 'vitepress'
import mediumZoom from 'medium-zoom'
import { nextTick, onMounted, watch } from 'vue'
import './custom.css'

// Click a screenshot to see it at full size. The pictures are 1440 px wide and
// get small on a phone, so this is the only way to read the text in them.
const ZOOMABLE = '.vp-doc img, .home-shot img'

export default {
  extends: DefaultTheme,
  setup() {
    // VitePress composable (Vue), not a React hook: the React rules do not apply here
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const route = useRoute()
    const init = () => mediumZoom(ZOOMABLE, { background: 'var(--vp-c-bg)' })
    onMounted(init)
    watch(
      () => route.path,
      () => nextTick(init),
    )
  },
} satisfies Theme
