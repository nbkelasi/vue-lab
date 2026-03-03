<!--
  默认布局 - Header + Sidebar + Content + Footer（TailwindCSS）
-->
<template>
  <div class="min-h-screen flex flex-col">
    <LayoutAppHeader />
    <div class="flex-1 flex">
      <LayoutAppSidebar />
      <main class="flex-1 min-w-0 max-w-[860px] py-8 px-10 max-md:px-4 max-md:py-5">
        <slot />
      </main>
    </div>
    <LayoutAppFooter />
  </div>
</template>
