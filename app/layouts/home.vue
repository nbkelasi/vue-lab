<!--
  首页布局 - Header + 全宽内容（无侧边栏）（TailwindCSS）
-->
<template>
  <div class="min-h-screen flex flex-col">
    <LayoutAppHeader />
    <main class="flex-1 max-w-[1200px] w-full mx-auto px-6">
      <slot />
    </main>
    <LayoutAppFooter />
  </div>
</template>
