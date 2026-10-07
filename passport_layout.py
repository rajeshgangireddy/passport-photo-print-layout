#!/usr/bin/env python3
"""passport_layout.py

Tile a single passport/ID photo onto a 10x15 cm (4x6") print sheet,
suitable for self-service photo kiosks (e.g. Kruidvat, CEWE, dm, etc.)
that print standard "4R" 10x15 cm photo prints.

Everything runs locally with Pillow only -- no cloud/network calls.

Example:
    python3 passport_layout.py photo.jpg -o sheet.jpg

    # Custom sizes / spacing
    python3 passport_layout.py photo.jpg -o sheet.jpg \\
        --photo-width-mm 35 --photo-height-mm 45 \\
        --border-mm 1 --gap-mm 2 --margin-mm 3
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

from PIL import Image, ImageOps

MM_PER_INCH = 25.4


def mm_to_px(mm: float, dpi: int) -> int:
    return round(mm / MM_PER_INCH * dpi)


@dataclass
class Layout:
    cols: int
    rows: int
    cell_w: int  # px, photo + border
    cell_h: int
    grid_w: int  # px, full grid incl. gaps
    grid_h: int
    offset_x: int  # px, top-left of grid on the page
    offset_y: int


def compute_layout(
    page_w: int, page_h: int,
    cell_w: int, cell_h: int,
    gap: int, margin: int,
) -> Layout:
    usable_w = page_w - 2 * margin
    usable_h = page_h - 2 * margin

    cols = max(0, (usable_w + gap) // (cell_w + gap))
    rows = max(0, (usable_h + gap) // (cell_h + gap))

    grid_w = cols * cell_w + max(0, cols - 1) * gap
    grid_h = rows * cell_h + max(0, rows - 1) * gap

    offset_x = (page_w - grid_w) // 2
    offset_y = (page_h - grid_h) // 2

    return Layout(cols, rows, cell_w, cell_h, grid_w, grid_h, offset_x, offset_y)


def fit_photo(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Scale (preserving aspect ratio) to fit exactly inside target box,
    padding with white if the aspect ratio doesn't match exactly."""
    fitted = ImageOps.contain(img, (target_w, target_h), Image.LANCZOS)
    canvas = Image.new("RGB", (target_w, target_h), "white")
    x = (target_w - fitted.width) // 2
    y = (target_h - fitted.height) // 2
    canvas.paste(fitted, (x, y))
    return canvas


def build_sheet(
    photo_path: str,
    out_path: str,
    photo_w_mm: float,
    photo_h_mm: float,
    page_w_mm: float,
    page_h_mm: float,
    border_mm: float,
    gap_mm: float,
    margin_mm: float,
    dpi: int,
    orientation: str,
    copies: int | None,
    border_color: str,
    bg_color: str,
) -> dict:
    src = Image.open(photo_path)
    src = ImageOps.exif_transpose(src)
    if src.mode != "RGB":
        src = src.convert("RGB")

    photo_w = mm_to_px(photo_w_mm, dpi)
    photo_h = mm_to_px(photo_h_mm, dpi)
    border = mm_to_px(border_mm, dpi)
    gap = mm_to_px(gap_mm, dpi)
    margin = mm_to_px(margin_mm, dpi)

    cell_w = photo_w + 2 * border
    cell_h = photo_h + 2 * border

    def layout_for(pw_mm: float, ph_mm: float) -> Layout:
        pw = mm_to_px(pw_mm, dpi)
        ph = mm_to_px(ph_mm, dpi)
        return compute_layout(pw, ph, cell_w, cell_h, gap, margin)

    if orientation == "auto":
        portrait = layout_for(page_w_mm, page_h_mm)
        landscape = layout_for(page_h_mm, page_w_mm)
        if landscape.cols * landscape.rows > portrait.cols * portrait.rows:
            page_w_mm, page_h_mm = page_h_mm, page_w_mm
    elif orientation == "landscape" and page_h_mm > page_w_mm:
        page_w_mm, page_h_mm = page_h_mm, page_w_mm
    elif orientation == "portrait" and page_w_mm > page_h_mm:
        page_w_mm, page_h_mm = page_h_mm, page_w_mm

    page_w = mm_to_px(page_w_mm, dpi)
    page_h = mm_to_px(page_h_mm, dpi)
    layout = compute_layout(page_w, page_h, cell_w, cell_h, gap, margin)

    if layout.cols == 0 or layout.rows == 0:
        raise SystemExit(
            f"Photo + border ({cell_w}x{cell_h}px) does not fit on the "
            f"{page_w_mm}x{page_h_mm}mm page with {margin_mm}mm margins."
        )

    fitted_photo = fit_photo(src, photo_w, photo_h)

    page = Image.new("RGB", (page_w, page_h), bg_color)

    total_slots = layout.cols * layout.rows
    n_photos = total_slots if copies is None else min(copies, total_slots)

    placed = 0
    for r in range(layout.rows):
        for c in range(layout.cols):
            if placed >= n_photos:
                break
            x0 = layout.offset_x + c * (cell_w + gap)
            y0 = layout.offset_y + r * (cell_h + gap)
            if border > 0:
                page.paste(
                    Image.new("RGB", (cell_w, cell_h), border_color),
                    (x0, y0),
                )
            page.paste(fitted_photo, (x0 + border, y0 + border))
            placed += 1
        if placed >= n_photos:
            break

    page.save(out_path, dpi=(dpi, dpi), quality=95)

    return {
        "cols": layout.cols,
        "rows": layout.rows,
        "placed": placed,
        "page_px": (page_w, page_h),
        "page_mm": (page_w_mm, page_h_mm),
        "cell_px": (cell_w, cell_h),
    }


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Tile a passport photo onto a 10x15cm (4x6\") print sheet."
    )
    p.add_argument("photo", help="Path to the source passport photo (JPG/PNG).")
    p.add_argument("-o", "--output", default="print-sheet.jpg", help="Output file path.")

    p.add_argument("--photo-width-mm", type=float, default=35.0, help="Target photo width in mm (default: 35).")
    p.add_argument("--photo-height-mm", type=float, default=45.0, help="Target photo height in mm (default: 45).")

    p.add_argument("--page-width-mm", type=float, default=100.0, help="Print sheet width in mm (default: 100 = 10cm).")
    p.add_argument("--page-height-mm", type=float, default=150.0, help="Print sheet height in mm (default: 150 = 15cm).")

    p.add_argument("--border-mm", type=float, default=0.5, help="Black border thickness around each photo, in mm (default: 0.5).")
    p.add_argument("--gap-mm", type=float, default=1.0, help="Gap between photos for cutting, in mm (default: 1).")
    p.add_argument("--margin-mm", type=float, default=1.5, help="Margin from the page edge, in mm (default: 1.5).")

    p.add_argument("--dpi", type=int, default=300, help="Output resolution in DPI (default: 300).")
    p.add_argument("--orientation", choices=["auto", "portrait", "landscape"], default="auto", help="Page orientation (default: auto = whichever fits more photos).")
    p.add_argument("--copies", type=int, default=None, help="Limit number of photos placed (default: fill the whole sheet).")

    p.add_argument("--border-color", default="black", help="Border color (default: black).")
    p.add_argument("--bg-color", default="white", help="Page background color (default: white).")

    return p.parse_args(argv)


def main(argv=None) -> None:
    args = parse_args(argv)
    info = build_sheet(
        photo_path=args.photo,
        out_path=args.output,
        photo_w_mm=args.photo_width_mm,
        photo_h_mm=args.photo_height_mm,
        page_w_mm=args.page_width_mm,
        page_h_mm=args.page_height_mm,
        border_mm=args.border_mm,
        gap_mm=args.gap_mm,
        margin_mm=args.margin_mm,
        dpi=args.dpi,
        orientation=args.orientation,
        copies=args.copies,
        border_color=args.border_color,
        bg_color=args.bg_color,
    )
    print(f"Saved {args.output}")
    print(f"  Page: {info['page_mm'][0]:.0f}x{info['page_mm'][1]:.0f} mm "
          f"({info['page_px'][0]}x{info['page_px'][1]} px @ {args.dpi} dpi)")
    print(f"  Grid: {info['cols']} cols x {info['rows']} rows "
          f"= {info['placed']} photos placed")
    print(f"  Cell: {info['cell_px'][0]}x{info['cell_px'][1]} px "
          f"(photo {args.photo_width_mm}x{args.photo_height_mm}mm "
          f"+ {args.border_mm}mm border)")


if __name__ == "__main__":
    main()
