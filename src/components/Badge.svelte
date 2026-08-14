<script lang="ts">
  interface Props {
    tone?: 'neutral' | 'core' | 'warn' | 'ok' | 'accent';
    title?: string;
    children: import('svelte').Snippet;
  }
  const { tone = 'neutral', title, children }: Props = $props();
</script>

<span class="badge {tone}" {title}>{@render children()}</span>

<style>
  .badge {
    display: inline-block;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .neutral {
    background: var(--surface-2);
    color: var(--text-muted);
    border-color: var(--border);
  }
  .core {
    background: var(--core-soft);
    color: var(--core);
  }
  .warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .ok {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .accent {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
