<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { checkAndUpdateApp } from './app-update'
import { refreshActiveScope, useTheme } from './shared/store'
import { scheduleNoteSync, startNoteSync } from './shared/note-sync'

onLaunch(() => {
  useTheme()
  startNoteSync()
  void checkAndUpdateApp()
})

onShow(() => { scheduleNoteSync(); refreshActiveScope() })
</script>

<style lang="scss">
@import './shared/styles/book.scss';
</style>
