<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { checkAndUpdateApp } from './app-update'
import { useTheme } from './shared/store'

onLaunch(() => {
  useTheme()
  void checkAndUpdateApp()
})
</script>

<style lang="scss">
@import './shared/styles/book.scss';
</style>
