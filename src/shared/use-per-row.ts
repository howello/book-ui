import { onMounted, onUnmounted, ref } from 'vue'

/** 书架每行卡片数：窄屏 2、宽屏 4；层板按实际每行卡片数托底。 */
export function usePerRow() {
  const perRow = ref(2)

  const update = (width: number) => {
    perRow.value = width >= 760 ? 4 : 2
  }

  onMounted(() => {
    // #ifdef H5
    if (typeof window !== 'undefined') {
      update(window.innerWidth)
      const handler = () => update(window.innerWidth)
      window.addEventListener('resize', handler)
      onUnmounted(() => window.removeEventListener('resize', handler))
    }
    // #endif
    // #ifndef H5
    const info = uni.getSystemInfoSync()
    update(info.windowWidth || 0)
    // #endif
  })

  return perRow
}

/** 把卡片按每行数量分组，供书架渲染「一行卡片 + 一块层板」。 */
export function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
}
