# TASK-315: UI description — '+X sats return' badge

## Where it appears

The badge is purely **display** — no DOM change to existing fields, no breaking
layout. Two surfaces show it, both gated by the new `show_fee_return` setting.

### 1. History screen row (`src/screens/History.svelte`)

Each transaction card has a `tx-header` row at the top. Inside it, next to the
type label and protocol badge (`Lightning` / `Cashu`), a new badge
`.tx-fee-return-badge` is appended **inline** when all of:

- `showFeeReturnSetting` (from `getSettings().show_fee_return`) is `true`
- `tx.type === 'melt'`
- `txFeeReturn(tx) > 0` (i.e. `feeReserve - actualFee > 0`)

```html
<div class="tx-header-left">
  <Body>{typeLabel}</Body>           <!-- "Send" -->
  <span class="tx-protocol-badge">{protocolLabel}</span>  <!-- "Lightning" -->
  {#if showFeeReturnSetting && tx.type === 'melt' && txFeeReturn(tx) > 0}
    <span class="tx-fee-return-badge">
      +{amount} sats return       <!-- en -->
      คืน {amount} sats           <!-- th -->
    </span>
  {/if}
</div>
```

Badge styling: small (`var(--font-size-xs)`), teal background (rgba 20,184,166,22% dark /
14% light), `--color-secondary` text color. Looks similar to the protocol badge but
with a green hue to signal "money back" rather than "protocol".

### 2. Transaction Detail Sheet (`src/lib/components/TransactionDetailSheet.svelte`)

A new "detail-field" row is inserted **after** the existing Fee row (Row 8)
when all of the same conditions are met. It reuses the existing field-label /
field-value pattern so it visually matches the Fee row above it:

```html
{#if showFeeReturnSetting && tx.type === 'melt' && feeReturnAmount > 0}
  <div class="detail-field">
    <span class="field-label">history.fee_return</span>  <!-- "Fee Return" -->
    <span class="field-value">
      <span class="badge badge-success">+X sats return</span>
    </span>
  </div>
{/if}
```

`history.fee_return` is reused for both the field-label and badge body — it
reads naturally in both languages ("Fee Return" / "คืนค่าธรรมเนียม") because
the key's actual content (the "+X sats return" string with amount) is what
the user reads in the badge.

### 3. Settings toggle (`src/screens/Settings.svelte`)

A new "Display" section is added between the existing PIN & Security and
Auto-lock cards. It contains a single toggle row using the existing
`Toggle` UI component:

```html
<Card>
  <Heading>Display</Heading>
  <Body>Control what is shown in transaction history</Body>
  <Divider />
  <Toggle
    checked={showFeeReturn}
    onchange={handleShowFeeReturnToggle}
    ariaLabel="Show fee return indicator"
  />
  <!-- Body: title + description -->
</Card>
```

Default state: **OFF** (per blueprint — no mandatory badge). Setting persists
via the existing `setSettings({ show_fee_return })` path; merging in
`getSettings()` falls back to `DEFAULT_SETTINGS.show_fee_return = false` when
the field is absent (additive, non-breaking for users on older app versions).

## Conditions summary (from `computeFeeReturn`)

```
fee_return > 0  ⟺  (tx.type === 'melt') AND (tx.actual_fee != null) AND (tx.actual_fee < tx.fee)
```

| Scenario | `type` | `fee` | `actual_fee` | `fee_return` | Badge? |
| --- | --- | --- | --- | --- | --- |
| NUT-08 partial refund | `melt` | 10 | 5 | **5** | YES (if setting ON) |
| NUT-08 full refund | `melt` | 10 | 0 | **10** | YES (if setting ON) |
| No NUT-08 / same fee | `melt` | 10 | 10 | **0** | NO |
| Legacy tx (pre-TASK-314) | `melt` | 10 | undefined | **0** | NO |
| Non-melt tx (mint, send, …) | * | * | * | **0** | NO |
| Setting OFF | any | any | any | — | NO (gate) |

## Visual snapshot (text)

> Dark theme, History screen, melt tx with `fee=10, actual_fee=5`, setting ON:
>
> `┌─────────────────────────────────────────────────┐`
> `│  [↗ Send]  [Lightning]  [+5 sats return]    -1,000 sats  │`
> `│  Jan 15, 14:32                  [Confirmed]                │`
> `└─────────────────────────────────────────────────┘`

> Transaction Detail Sheet, same tx:
>
> `FEE                                                    5 sats  (Fee reserve: 10)`
> `FEE RETURN                          [+5 sats return]`  ← new row (teal badge)

> Settings → Display section:
>
> `[○]  Show fee return indicator`
> `     Show '+X sats return' badge in history when mint returns fee (NUT-08)`
