---
version: 1
slug: "docs-index-html"
primary_target: "docs/index.html"
related_targets: []
---

# Browser photo layout

## Scope and mode

The static `/docs/` photo-sheet tool; Operate.

## Audience and job

Inferred from the approved brief: people preparing passport, ID, or visa photos
for printing need a correctly sized sheet without cropping their source.

## Task and proof

Choose one image, set photo and page measurements, review the live Canvas sheet,
and download a full-resolution JPEG. Show the resulting dimensions, grid, copy
count, and print advice beside the preview.

## Constraints

All image processing stays in browser Canvas. Keep the source aspect ratio,
center the grid, distinguish cells from gaps and margins, report copy limits,
respect EXIF orientation, and preserve keyboard access, contrast, and mobile
layout. No uploads, analytics, remote fonts, or image services.

## Direction and moment

Use the approved flat Geti-inspired dark interface and Energy Blue accent. The
defining moment is the immediate, measured sheet preview changing with every
setting while the selected image remains local.

## Open decisions

Country-specific photo requirements are not validated by the tool.
