<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NConfigProvider,
  NGlobalStyle,
  NMessageProvider,
  NDialogProvider,
  darkTheme,
  zhCN,
  enUS,
  dateZhCN,
  dateEnUS,
} from 'naive-ui'
const { locale } = useI18n()
const chinese = computed(() => locale.value === 'zh-CN')
</script>
<template>
  <n-config-provider
    :theme="darkTheme"
    :locale="chinese ? zhCN : enUS"
    :date-locale="chinese ? dateZhCN : dateEnUS"
  >
    <n-global-style />
    <n-message-provider
      ><n-dialog-provider><router-view /></n-dialog-provider
    ></n-message-provider>
  </n-config-provider>
</template>
