# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inferred from the source utility and approved brief: people preparing passport,
ID, or visa photos for print kiosks or printers.

## Product Purpose

Arrange one photo at a chosen physical size on a print sheet, then export a
print-ready image. Success means the requested copies fit, preserve the source
aspect ratio, and print at the selected physical dimensions.

## Positioning

The browser tool lays out photos locally with Canvas; selected images and
generated sheets are not sent to a server.

## Operating Context

Users choose a photo and output dimensions, inspect the sheet, download a JPEG,
then order or print the exact sheet size.

## Capabilities and Constraints

The project also provides a Python/Pillow CLI. The browser surface is static
HTML, CSS, and JavaScript without a build step. Both support physical
dimensions, spacing, borders, DPI, orientation, and copy limits. Browser
dimensions and export resolution are subject to safe local processing limits.
Country-specific photo requirements remain the user's responsibility.

## Brand Commitments

The approved browser interface uses a flat dark palette based on Intel Geti
colors, with Energy Blue as its accent and a system font stack.

## Evidence on Hand

`passport_layout.py` is the existing reference implementation. The repository
contains a synthetic sample image and sheet; no personal passport image is
required or included in the browser tool.

## Product Principles

- Keep selected images and output local to the browser.
- Preserve aspect ratio and avoid cropping.
- Make physical dimensions and print settings explicit.
- Keep the existing CLI available.

## Accessibility & Inclusion

The browser interface must provide labeled controls, keyboard access, visible
focus, readable contrast, and responsive layouts.
