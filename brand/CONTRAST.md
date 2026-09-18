# Contrast

GENERATED, do not edit. Source: `brand/tokens/tokens.json`. Regenerate with
`node brand/tokens/build.mjs`, or check without writing with
`npm run brand:check`.

Every ratio below was computed by `brand/tokens/contrast.mjs`, which
implements the WCAG 2.1 definitions of relative luminance and contrast ratio
and nothing else. Ratios are rounded **toward zero** at two decimals, so a
published figure never reads higher than what was measured.

WCAG 2.1 AA asks for 4.5:1 for body text and 3:1 for non-text interface
boundaries and focus indicators. Pairs are listed by role, in both variants.
A pair that failed would have been changed or removed rather than published
with a caveat; the check below is what enforces that.

- Pairs measured: 52
- Failing: 0

## Light

| Foreground | Background | Use | Requires | Measured | Result |
| --- | --- | --- | --- | --- | --- |
| `--lk-ink` `#1B1C2E` | `--lk-page` `#FAF7F1` | text | 4.5:1 | 15.68:1 | pass |
| `--lk-ink` `#1B1C2E` | `--lk-surface` `#FFFFFF` | text | 4.5:1 | 16.77:1 | pass |
| `--lk-ink` `#1B1C2E` | `--lk-surface-2` `#F0EAE0` | text | 4.5:1 | 14.01:1 | pass |
| `--lk-muted` `#55566B` | `--lk-page` `#FAF7F1` | text | 4.5:1 | 6.70:1 | pass |
| `--lk-muted` `#55566B` | `--lk-surface` `#FFFFFF` | text | 4.5:1 | 7.16:1 | pass |
| `--lk-muted` `#55566B` | `--lk-surface-2` `#F0EAE0` | text | 4.5:1 | 5.99:1 | pass |
| `--lk-accent` `#343A8C` | `--lk-page` `#FAF7F1` | text | 4.5:1 | 9.22:1 | pass |
| `--lk-accent` `#343A8C` | `--lk-surface` `#FFFFFF` | text | 4.5:1 | 9.85:1 | pass |
| `--lk-accent` `#343A8C` | `--lk-surface-2` `#F0EAE0` | text | 4.5:1 | 8.23:1 | pass |
| `--lk-accent-ink` `#FAF7F1` | `--lk-accent` `#343A8C` | text | 4.5:1 | 9.22:1 | pass |
| `--lk-gold` `#8A6212` | `--lk-page` `#FAF7F1` | text | 4.5:1 | 5.11:1 | pass |
| `--lk-gold` `#8A6212` | `--lk-surface` `#FFFFFF` | text | 4.5:1 | 5.47:1 | pass |
| `--lk-gold` `#8A6212` | `--lk-surface-2` `#F0EAE0` | text | 4.5:1 | 4.57:1 | pass |
| `--lk-gold-ink` `#FAF7F1` | `--lk-gold` `#8A6212` | text | 4.5:1 | 5.11:1 | pass |
| `--lk-ok` `#1C6B46` | `--lk-page` `#FAF7F1` | text | 4.5:1 | 6.05:1 | pass |
| `--lk-ok` `#1C6B46` | `--lk-surface` `#FFFFFF` | text | 4.5:1 | 6.47:1 | pass |
| `--lk-ok` `#1C6B46` | `--lk-surface-2` `#F0EAE0` | text | 4.5:1 | 5.41:1 | pass |
| `--lk-no` `#A32A1F` | `--lk-page` `#FAF7F1` | text | 4.5:1 | 6.75:1 | pass |
| `--lk-no` `#A32A1F` | `--lk-surface` `#FFFFFF` | text | 4.5:1 | 7.22:1 | pass |
| `--lk-no` `#A32A1F` | `--lk-surface-2` `#F0EAE0` | text | 4.5:1 | 6.03:1 | pass |
| `--lk-line-strong` `#7D7885` | `--lk-page` `#FAF7F1` | ui | 3:1 | 4.01:1 | pass |
| `--lk-line-strong` `#7D7885` | `--lk-surface` `#FFFFFF` | ui | 3:1 | 4.28:1 | pass |
| `--lk-line-strong` `#7D7885` | `--lk-surface-2` `#F0EAE0` | ui | 3:1 | 3.58:1 | pass |

## Dark

| Foreground | Background | Use | Requires | Measured | Result |
| --- | --- | --- | --- | --- | --- |
| `--lk-ink` `#EDE7DB` | `--lk-page` `#141521` | text | 4.5:1 | 14.71:1 | pass |
| `--lk-ink` `#EDE7DB` | `--lk-surface` `#1C1E2C` | text | 4.5:1 | 13.41:1 | pass |
| `--lk-ink` `#EDE7DB` | `--lk-surface-2` `#262939` | text | 4.5:1 | 11.69:1 | pass |
| `--lk-muted` `#ABA7B8` | `--lk-page` `#141521` | text | 4.5:1 | 7.72:1 | pass |
| `--lk-muted` `#ABA7B8` | `--lk-surface` `#1C1E2C` | text | 4.5:1 | 7.04:1 | pass |
| `--lk-muted` `#ABA7B8` | `--lk-surface-2` `#262939` | text | 4.5:1 | 6.13:1 | pass |
| `--lk-accent` `#99A2F0` | `--lk-page` `#141521` | text | 4.5:1 | 7.57:1 | pass |
| `--lk-accent` `#99A2F0` | `--lk-surface` `#1C1E2C` | text | 4.5:1 | 6.90:1 | pass |
| `--lk-accent` `#99A2F0` | `--lk-surface-2` `#262939` | text | 4.5:1 | 6.01:1 | pass |
| `--lk-accent-ink` `#141521` | `--lk-accent` `#99A2F0` | text | 4.5:1 | 7.57:1 | pass |
| `--lk-gold` `#E2B45C` | `--lk-page` `#141521` | text | 4.5:1 | 9.41:1 | pass |
| `--lk-gold` `#E2B45C` | `--lk-surface` `#1C1E2C` | text | 4.5:1 | 8.58:1 | pass |
| `--lk-gold` `#E2B45C` | `--lk-surface-2` `#262939` | text | 4.5:1 | 7.48:1 | pass |
| `--lk-gold-ink` `#141521` | `--lk-gold` `#E2B45C` | text | 4.5:1 | 9.41:1 | pass |
| `--lk-ok` `#6FD6A0` | `--lk-page` `#141521` | text | 4.5:1 | 10.18:1 | pass |
| `--lk-ok` `#6FD6A0` | `--lk-surface` `#1C1E2C` | text | 4.5:1 | 9.28:1 | pass |
| `--lk-ok` `#6FD6A0` | `--lk-surface-2` `#262939` | text | 4.5:1 | 8.09:1 | pass |
| `--lk-no` `#F2908A` | `--lk-page` `#141521` | text | 4.5:1 | 7.87:1 | pass |
| `--lk-no` `#F2908A` | `--lk-surface` `#1C1E2C` | text | 4.5:1 | 7.18:1 | pass |
| `--lk-no` `#F2908A` | `--lk-surface-2` `#262939` | text | 4.5:1 | 6.26:1 | pass |
| `--lk-line-strong` `#71748F` | `--lk-page` `#141521` | ui | 3:1 | 3.96:1 | pass |
| `--lk-line-strong` `#71748F` | `--lk-surface` `#1C1E2C` | ui | 3:1 | 3.61:1 | pass |
| `--lk-line-strong` `#71748F` | `--lk-surface-2` `#262939` | ui | 3:1 | 3.15:1 | pass |

## Decorative hairlines

`--lk-line` is a decorative rule. It carries no information on its own and is
never the only signal that something is separate, disabled, or selected; a
boundary that must be perceivable uses `--lk-line-strong`, which is measured
against the 3:1 requirement above. These values are recorded for completeness,
not held to a requirement.

### Light

| Foreground | Background | Measured |
| --- | --- | --- |
| `--lk-line` `#E0D8CA` | `--lk-page` `#FAF7F1` | 1.32:1 |
| `--lk-line` `#E0D8CA` | `--lk-surface` `#FFFFFF` | 1.41:1 |
| `--lk-line` `#E0D8CA` | `--lk-surface-2` `#F0EAE0` | 1.18:1 |

### Dark

| Foreground | Background | Measured |
| --- | --- | --- |
| `--lk-line` `#30334A` | `--lk-page` `#141521` | 1.46:1 |
| `--lk-line` `#30334A` | `--lk-surface` `#1C1E2C` | 1.33:1 |
| `--lk-line` `#30334A` | `--lk-surface-2` `#262939` | 1.16:1 |
