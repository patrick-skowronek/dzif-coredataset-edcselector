<script lang="ts">
  import type { CheckState } from '../lib/selection';

  interface Props {
    checkState: CheckState;
    label: string;
    onchange: (selected: boolean) => void;
  }
  const { checkState, label, onchange }: Props = $props();

  let element: HTMLInputElement | undefined = $state();

  // `indeterminate` is not an attribute, it has to be set on the element.
  $effect(() => {
    if (element) element.indeterminate = checkState === 'partial';
  });
</script>

<input
  bind:this={element}
  type="checkbox"
  checked={checkState === 'all'}
  aria-label={label}
  onclick={(event) => {
    event.stopPropagation();
  }}
  onchange={(event) => onchange(event.currentTarget.checked)}
/>

<style>
  input {
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent);
    flex: none;
    cursor: pointer;
  }
</style>
