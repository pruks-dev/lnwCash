<script lang="ts">
	/**
	 * SeedGrid — 12-word recovery phrase grid (TASK-208 / D4).
	 *
	 * Renders the 12-word BIP39 recovery phrase as a 3×4 grid (3 columns,
	 * 4 rows) in monospace so word order is unambiguous when the user copies
	 * it to paper. Each cell shows the 1-based position + the word.
	 *
	 * Props:
	 *   words   — ordered words (expected 12 for a BIP39 phrase)
	 *   columns — grid column count (default 3 → 3×4 for 12 words)
	 */
	interface Props {
		words?: string[];
		columns?: number;
	}

	let { words = [], columns = 3 }: Props = $props();
</script>

<div
	class="seed-grid"
	role="list"
	aria-label="Recovery phrase"
	style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
>
	{#each words as word, i (i)}
		<div class="seed-cell" role="listitem">
			<span class="seed-cell-index">{i + 1}</span>
			<span class="seed-cell-word">{word}</span>
		</div>
	{/each}
</div>

<style>
	.seed-grid {
		display: grid;
		gap: var(--space-sm);
		width: 100%;
	}

	.seed-cell {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: var(--space-xs) var(--space-sm);
		background: var(--color-surface-variant);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-family-mono, ui-monospace, 'SF Mono', Menlo, monospace);
		overflow: hidden;
	}

	.seed-cell-index {
		flex: 0 0 auto;
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--color-text-secondary);
		min-width: 18px;
		text-align: right;
		font-family: inherit;
	}

	.seed-cell-word {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: inherit;
	}
</style>
