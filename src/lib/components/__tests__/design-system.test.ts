// @ts-nocheck — test file using @testing-library/svelte v5 with Svelte 5
// Snippet types are branded symbols; runtime behavior is correct via vitest
/**
 * TASK-050 — Design System Component Tests
 * Tests for: Button, Card, Input, Nav, Modal, Badge, Chip, Divider,
 *            ListItem, Toast, Heading, Body, Caption, Icons
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte/svelte5';
import Button from '../ui/Button.svelte';
import Card from '../ui/Card.svelte';
import Input from '../ui/Input.svelte';
import Badge from '../ui/Badge.svelte';
import Chip from '../ui/Chip.svelte';
import Divider from '../ui/Divider.svelte';
import Toast from '../ui/Toast.svelte';
import ListItem from '../ui/ListItem.svelte';
import Modal from '../ui/Modal.svelte';
import Nav from '../ui/Nav.svelte';
import Heading from '../ui/Heading.svelte';
import Body from '../ui/Body.svelte';
import Caption from '../ui/Caption.svelte';
import Wallet from '../icons/Wallet.svelte';
import Icon from '../icons/Icon.svelte';

// ─── Button Tests ───────────────────────────────────────────
describe('Button', () => {
	it('renders primary variant', () => {
		const { container } = render(Button, { variant: 'primary', children: () => 'Click' });
		const btn = container.querySelector('button')!;
		expect(btn).toBeTruthy();
		expect(btn.className).toContain('btn-primary');
		expect(btn.querySelector('.btn-content')).toBeTruthy();
	});

	it('renders secondary variant', () => {
		const { container } = render(Button, { variant: 'secondary', children: () => 'Outline' });
		const btn = container.querySelector('button')!;
		expect(btn.className).toContain('btn-secondary');
	});

	it('renders ghost variant', () => {
		const { container } = render(Button, { variant: 'ghost', children: () => 'Ghost' });
		const btn = container.querySelector('button')!;
		expect(btn.className).toContain('btn-ghost');
	});

	it('renders icon variant with aria-label', () => {
		const { container } = render(Button, { variant: 'icon', ariaLabel: 'Settings', children: () => '⚙' });
		const btn = container.querySelector('button')!;
		expect(btn.className).toContain('btn-icon');
		expect(btn.getAttribute('aria-label')).toBe('Settings');
	});

	it('renders loading state with spinner', () => {
		const { container } = render(Button, { loading: true, children: () => 'Sending' });
		const btn = container.querySelector('button')!;
		expect(btn.className).toContain('btn-loading');
		expect(btn.getAttribute('aria-busy')).toBe('true');
		expect(btn.disabled).toBe(true);
	});

	it('defaults to type=button', () => {
		const { container } = render(Button, { children: () => 'OK' });
		const btn = container.querySelector('button')!;
		expect(btn.getAttribute('type')).toBe('button');
	});
});

// ─── Card Tests ────────────────────────────────────────────
describe('Card', () => {
	it('renders basic variant', () => {
		const { container } = render(Card, { variant: 'basic', children: () => 'Card content' });
		const card = container.querySelector('.card')!;
		expect(card).toBeTruthy();
		expect(card.className).toContain('card-basic');
	});

	it('renders interactive variant with button role', () => {
		const { container } = render(Card, { variant: 'interactive', children: () => 'Click me' });
		const card = container.querySelector('.card')!;
		expect(card.className).toContain('card-interactive');
		expect(card.getAttribute('role')).toBe('button');
		expect(card.getAttribute('tabindex')).toBe('0');
	});
});

// ─── Input Tests ───────────────────────────────────────────
describe('Input', () => {
	it('renders default text input', () => {
		const { container } = render(Input, { placeholder: 'Enter amount' });
		const input = container.querySelector('input')!;
		expect(input).toBeTruthy();
		expect(input.getAttribute('type')).toBe('text');
	});

	it('renders with label', () => {
		render(Input, { label: 'Amount' });
		const label = screen.queryByText('Amount');
		expect(label).toBeTruthy();
	});

	it('shows error message with aria-invalid', () => {
		const { container } = render(Input, { error: 'Invalid amount' });
		const input = container.querySelector('input')!;
		const wrapper = container.querySelector('.input-wrapper')!;
		expect(wrapper.className).toContain('input-error');
		expect(input.getAttribute('aria-invalid')).toBe('true');
		const errText = screen.queryByText('Invalid amount');
		expect(errText).toBeTruthy();
	});

	it('renders disabled state', () => {
		const { container } = render(Input, { disabled: true });
		const wrapper = container.querySelector('.input-wrapper')!;
		expect(wrapper.className).toContain('input-disabled');
		const input = container.querySelector('input')!;
		expect(input.disabled).toBe(true);
	});
});

// ─── Badge Tests ───────────────────────────────────────────
describe('Badge', () => {
	it('renders default badge with content', () => {
		const { container } = render(Badge, { children: () => 'New' });
		const badge = container.querySelector('.badge')!;
		expect(badge).toBeTruthy();
		expect(badge.className).toContain('badge-default');
		expect(badge.getAttribute('role')).toBe('status');
	});

	it('renders success variant', () => {
		const { container } = render(Badge, { variant: 'success', children: () => 'Done' });
		const badge = container.querySelector('.badge')!;
		expect(badge.className).toContain('badge-success');
	});
});

// ─── Chip Tests ────────────────────────────────────────────
describe('Chip', () => {
	it('renders with label', () => {
		const { container } = render(Chip, { children: () => 'Filter' });
		const chip = container.querySelector('.chip')!;
		expect(chip).toBeTruthy();
		expect(chip.className).toContain('chip-default');
		expect(chip.querySelector('.chip-content')).toBeTruthy();
	});

	it('renders active variant', () => {
		const { container } = render(Chip, { variant: 'active', children: () => 'Active' });
		const chip = container.querySelector('.chip')!;
		expect(chip.className).toContain('chip-active');
	});

	it('renders removable with X button', () => {
		const { container } = render(Chip, { removable: true, children: () => 'Tag' });
		const removeBtn = container.querySelector('.chip-remove')!;
		expect(removeBtn).toBeTruthy();
		expect(removeBtn.getAttribute('aria-label')).toBe('Remove');
	});
});

// ─── Divider Tests ─────────────────────────────────────────
describe('Divider', () => {
	it('renders horizontal divider', () => {
		const { container } = render(Divider, { orientation: 'horizontal' });
		const divider = container.querySelector('.divider')!;
		expect(divider).toBeTruthy();
		expect(divider.getAttribute('role')).toBe('separator');
		expect(divider.getAttribute('aria-orientation')).toBe('horizontal');
	});
});

// ─── Toast Tests ───────────────────────────────────────────
describe('Toast', () => {
	it('renders visible toast', () => {
		const { container } = render(Toast, { message: 'Copied!', type: 'success', visible: true, duration: 0 });
		const toast = container.querySelector('.toast')!;
		expect(toast).toBeTruthy();
		expect(toast.className).toContain('toast-success');
	});

	it('does not render when not visible', () => {
		const { container } = render(Toast, { message: 'Hidden', visible: false });
		const toast = container.querySelector('.toast');
		expect(toast).toBeNull();
	});
});

// ─── ListItem Tests ────────────────────────────────────────
describe('ListItem', () => {
	it('renders with title and subtitle', () => {
		render(ListItem, { title: 'Transaction', subtitle: '0.001 BTC' });
		expect(screen.queryByText('Transaction')).toBeTruthy();
		expect(screen.queryByText('0.001 BTC')).toBeTruthy();
	});

	it('renders clickable with button role', () => {
		const handler = vi.fn();
		const { container } = render(ListItem, { title: 'Clickable', onclick: handler });
		const item = container.querySelector('.list-item')!;
		expect(item.getAttribute('role')).toBe('button');
	});
});

// ─── Modal Tests ───────────────────────────────────────────
describe('Modal', () => {
	it('renders dialog variant when open', () => {
		const { container } = render(Modal, {
			open: true,
			title: 'Confirmation',
			children: () => 'Are you sure?'
		});
		const dialog = container.querySelector('[role="dialog"]')!;
		expect(dialog).toBeTruthy();
		expect(dialog.getAttribute('aria-modal')).toBe('true');
	});

	it('does not render when closed', () => {
		const { container } = render(Modal, { open: false });
		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog).toBeNull();
	});
});

// ─── Nav Tests ─────────────────────────────────────────────
describe('Nav', () => {
	it('renders bottom nav with items', () => {
		const { container } = render(Nav, {
			position: 'bottom',
			items: [
				{ label: 'Wallet', icon: () => '' }
			]
		});
		const nav = container.querySelector('.nav-bottom')!;
		expect(nav).toBeTruthy();
		expect(nav.getAttribute('aria-label')).toBe('Navigation');
		const label = screen.queryByText('Wallet');
		expect(label).toBeTruthy();
	});

	it('renders top app bar with title', () => {
		render(Nav, { position: 'top', title: 'LNWCASH' });
		expect(screen.queryByText('LNWCASH')).toBeTruthy();
	});
});

// ─── Heading Tests ─────────────────────────────────────────
describe('Heading', () => {
	it('renders h1', () => {
		const { container } = render(Heading, { level: 'h1', children: () => 'Title' });
		const h1 = container.querySelector('h1')!;
		expect(h1).toBeTruthy();
		expect(h1.className).toContain('heading-h1');
	});

	it('renders h3', () => {
		const { container } = render(Heading, { level: 'h3', children: () => 'Section' });
		const h3 = container.querySelector('h3')!;
		expect(h3).toBeTruthy();
		expect(h3.className).toContain('heading-h3');
	});
});

// ─── Body Tests ────────────────────────────────────────────
describe('Body', () => {
	it('renders paragraph by default', () => {
		const { container } = render(Body, { children: () => 'Text content' });
		const p = container.querySelector('p')!;
		expect(p).toBeTruthy();
		expect(p.className).toContain('body-md');
	});

	it('renders inline span', () => {
		const { container } = render(Body, { inline: true, children: () => 'Inline' });
		const span = container.querySelector('span')!;
		expect(span).toBeTruthy();
	});
});

// ─── Caption Tests ─────────────────────────────────────────
describe('Caption', () => {
	it('renders with text', () => {
		const { container } = render(Caption, { children: () => 'Hint text' });
		const caption = container.querySelector('.caption')!;
		expect(caption).toBeTruthy();
		expect(caption.className).toContain('caption');
	});
});

// ─── Icon Tests ────────────────────────────────────────────
describe('Icons', () => {
	it('renders Wallet icon at default 24x24', () => {
		const { container } = render(Wallet, {});
		const svg = container.querySelector('svg')!;
		expect(svg).toBeTruthy();
		expect(svg.getAttribute('width')).toBe('24');
		expect(svg.getAttribute('height')).toBe('24');
		expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
		expect(svg.getAttribute('aria-hidden')).toBe('true');
	});

	it('renders Wallet icon at custom size', () => {
		const { container } = render(Wallet, { size: 32 });
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('width')).toBe('32');
		expect(svg.getAttribute('height')).toBe('32');
	});

	it('Icon wrapper renders by name', () => {
		const { container } = render(Icon, { name: 'Wallet', size: 28 });
		const svg = container.querySelector('svg')!;
		expect(svg).toBeTruthy();
		expect(svg.getAttribute('width')).toBe('28');
	});
});
