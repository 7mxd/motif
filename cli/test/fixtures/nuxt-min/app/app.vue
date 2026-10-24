<script setup lang="ts">
const strings = useStrings();
useDirection();
</script>

<template>
  <div>
    <nav>
      <NuxtLink to="/">{{ strings.home }}</NuxtLink>
      <NuxtLink to="/settings">{{ strings.settings }}</NuxtLink>
    </nav>
    <NuxtPage />
  </div>
</template>
