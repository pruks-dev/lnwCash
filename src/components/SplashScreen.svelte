<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		/** Whether to show the splash screen */
		show?: boolean;
	}

	let { show = true }: Props = $props();
</script>

{#if show}
	<div class="splash-screen" role="status" aria-label={$_('app.name')}>
		<div class="splash-content">
			<div class="splash-logo">
				<span class="logo-icon">&#9889;</span>
			</div>
			<h1 class="splash-title">{$_('app.name')}</h1>
			<p class="splash-tagline">{$_('app.tagline')}</p>
			<div class="splash-loader">
				<span class="loader-dot"></span>
				<span class="loader-dot"></span>
				<span class="loader-dot"></span>
			</div>
		</div>
	</div>
{/if}

<style>
	.splash-screen {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.splash-content {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.splash-logo {
		width: 80px;
		height: 80px;
		background: linear-gradient(135deg, #f7931a 0%, #ffab40 100%);
		border-radius: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8px 32px rgba(247, 147, 26, 0.4);
	}

	.logo-icon {
		font-size: 2.5rem;
		color: white;
	}

	.splash-title {
		margin: 0;
		font-size: 1.8rem;
		font-weight: 800;
		color: white;
		letter-spacing: -0.02em;
	}

	.splash-tagline {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.splash-loader {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}

	.loader-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #f7931a;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.loader-dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.loader-dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes pulse {
		0%, 80%, 100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		40% {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
