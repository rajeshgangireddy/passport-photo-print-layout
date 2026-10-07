# Design system

## Visual direction

The browser tool uses a flat, dark, Geti-inspired interface for a focused
print-preparation task. Panels are distinct through a small surface-color
shift and hairline stroke, not shadows or gradients. Energy Blue marks primary
actions, focus, and the local-processing indicator; coral is reserved for
clear and error states.

## Color

| Role | Value |
|---|---|
| Page | `#313236` |
| Panel | `#3c3e42` |
| Energy Blue | `#00c7fd` |
| Accent shade | `#0095ca` |
| Subtle stroke | `#c9cace` at reduced opacity |
| Error and reset | `#ff5662` |
| Accessible coral text | `#ff8990` |
| Primary text | `#f4f5f6` |
| Secondary text | `#c9cace` |

The print sheet itself is white, separate from the dark application surface.

## Typography

Inter leads a system sans-serif stack. Headings use compact, semibold sizing;
measurements use tabular numerals for quick comparison. No font or other asset
is fetched remotely.

## Layout and controls

Settings and upload occupy the left column on wide screens; the print preview,
dimensions, and download occupy the right. At narrower widths the interface
stacks into a single column, with paired measurement fields retained where
they remain legible. Controls use crisp borders, compact spacing, and a visible
Energy Blue keyboard-focus outline.

The live Canvas preview is the primary output. Its summary names sheet pixels
and physical dimensions, grid, copy count, photo box, cut cell, gap, margin,
and orientation. Warnings and errors use text in addition to color.

## Accessibility and responsive behavior

Every input has a label or accessible name. File selection works from a
keyboard-operable button; drag and drop is an additional path. Focus is visible,
text contrast is high, reduced-motion preferences are respected, and layouts
adapt down to narrow mobile viewports without horizontal page overflow.
