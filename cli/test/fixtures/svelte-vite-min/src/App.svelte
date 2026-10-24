<script lang="ts">
  import { prefersReducedMotion, Spring } from 'svelte/motion'
  import { spring } from './lib/design/motion'
  import { strings } from './strings'

  let name = $state('')

  // A Spring that keeps turning, still when the viewer asks for reduced motion.
  const turn = new Spring(0, spring.smooth)
  $effect(() => {
    if (prefersReducedMotion.current) return
    const timer = setInterval(() => (turn.target += 90), 300)
    return () => clearInterval(timer)
  })
</script>

<main>
  <h1>{strings.pantry}</h1>
  <section class="card">
    <p>{strings.items}</p>
  </section>
  <label>
    <span>{strings.name}</span>
    <input bind:value={name} />
  </label>
  {#if name}
    <p>{strings.hello} {name}</p>
  {/if}
  <div class="spinner" style:rotate="{turn.current}deg"></div>
</main>
