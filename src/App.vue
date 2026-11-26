<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { checkAndUpdateApp } from './app-update'
import { useTheme } from './shared/store'
import { scheduleNoteSync, startNoteSync } from './shared/note-sync'

onLaunch(() => {
  useTheme()
  startNoteSync()
  void checkAndUpdateApp()
})

onShow(() => scheduleNoteSync())
</script>

<style lang="scss">
@import './shared/styles/book.scss';
</style>
