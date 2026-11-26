import { onUnmounted, ref } from 'vue'

/**
 * 长按判定：按住不动才触发，一旦移动超过阈值立即取消。
 *
 * <p>uni-app 自带的 `longpress` 在按下滑动时仍可能触发，容易误触；
 * 这里用 touchstart/touchmove/touchend 自己做判定：</p>
 * - 按住 {@link delay} 毫秒才触发；
 * - 手指移动超过 {@link tolerance} 像素即取消；
 * - 触发后吞掉紧随的 click，避免既开菜单又跳详情。
 */
export function useLongPress(options: { delay?: number; tolerance?: number } = {}) {
  const delay = options.delay ?? 520
  const tolerance = options.tolerance ?? 10
  /** 刚刚触发过长按：调用方用它拦截这次 click。 */
  const justLongPressed = ref(false)

  let timer: ReturnType<typeof setTimeout> | undefined
  let startX = 0
  let startY = 0
  let fired = false

  function cancel() {
    clearTimeout(timer)
    timer = undefined
  }

  /** 绑定到元素的 touchstart。 */
  function onTouchStart(event: TouchEvent, action: () => void) {
    const touch = event.touches?.[0]
    if (!touch) return
    cancel()
    fired = false
    startX = touch.clientX
    startY = touch.clientY
    timer = setTimeout(() => {
      fired = true
      justLongPressed.value = true
      action()
    }, delay)
  }

  /** 绑定到 touchmove：超过容差立即取消。 */
  function onTouchMove(event: TouchEvent) {
    const touch = event.touches?.[0]
    if (!touch || !timer) return
    if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > tolerance) cancel()
  }

  /** 绑定到 touchend/touchcancel。 */
  function onTouchEnd() {
    cancel()
  }

  /** 点击前调用：长按刚触发时返回 true 并复位，调用方应直接 return。 */
  function consumeLongPress() {
    if (!justLongPressed.value) return false
    justLongPressed.value = false
    return true
  }

  onUnmounted(cancel)

  return { onTouchStart, onTouchMove, onTouchEnd, consumeLongPress, justLongPressed }
}
