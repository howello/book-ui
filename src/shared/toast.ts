import { ref } from 'vue'

/** 全局轻提示文本，空串表示不显示。 */
export const toastText = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

/** 显示一条与 demo 同款的黑底圆角提示，1.7 秒后自动消失。 */
export function toast(message: string) {
  toastText.value = message
  clearTimeout(timer)
  timer = setTimeout(() => { toastText.value = '' }, 1700)
}
