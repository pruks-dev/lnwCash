<script lang="ts">
	// _ import removed — using hardcoded Thai fallback for resilience

	let hasError: boolean = $state(false);
	let errorMessage: string = $state('');

	function handleError(event: ErrorEvent) {
		hasError = true;
		errorMessage = event.message || event.error?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
		console.error('[ErrorBoundary]', event.error || event.message);
		event.preventDefault();
	}

	function handlePromiseRejection(event: PromiseRejectionEvent) {
		hasError = true;
		errorMessage = event.reason?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
		console.error('[ErrorBoundary] Unhandled rejection:', event.reason);
		event.preventDefault();
	}

	function retry() {
		window.location.reload();
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		window.addEventListener('error', handleError);
		window.addEventListener('unhandledrejection', handlePromiseRejection);
		return () => {
			window.removeEventListener('error', handleError);
			window.removeEventListener('unhandledrejection', handlePromiseRejection);
		};
	});
</script>

{#if hasError}
	<div class="error-boundary" role="alert">
		<div class="error-content">
			<div class="error-icon">&#9888;</div>
			<h2 class="error-title">ข้อผิดพลาด</h2>
			<p class="error-message">{errorMessage}</p>
			<button type="button" class="retry-btn" onclick={retry}>
				ลองใหม่
			</button>
		</div>
	</div>
{/if}

<style>
	.error-boundary {
		position: fixed;
		inset: 0;
		z-index: 999;
		background: #1a1a2e;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.error-content {
		text-align: center;
		max-width: 360px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.error-icon {
		font-size: 3rem;
		color: #f7931a;
	}

	.error-title {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 700;
		color: white;
	}

	.error-message {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.5;
		word-break: break-word;
	}

	.retry-btn {
		padding: 0.75rem 2rem;
		font-size: 1rem;
		font-weight: 700;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: background 0.2s;
	}

	.retry-btn:hover {
		background: #e6821a;
	}
</style>
