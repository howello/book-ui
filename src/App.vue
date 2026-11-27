<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { checkAndUpdateApp } from './app-update'
import { initTheme, refreshActiveScope, refreshSystemTheme } from './shared/store'
import { scheduleNoteSync, startNoteSync } from './shared/note-sync'

onLaunch(() => {
  initTheme()
  startNoteSync()
  void checkAndUpdateApp()
})

onShow(() => {
  refreshSystemTheme()
  scheduleNoteSync()
  refreshActiveScope()
})
</script>

<style lang="scss">
@import './shared/styles/book.scss';
</style>
