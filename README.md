# Passport Photo Print Layout

Tile a single passport / ID / visa photo onto a standard **10x15 cm (4x6")**
print sheet, ready to upload to a self-service photo kiosk or print
machine (e.g. Kruidvat, dm, CEWE, Walgreens, etc.) as a normal 10x15 photo.

- **Local processing** — the CLI uses [Pillow](https://pillow.readthedocs.io/); the browser tool uses Canvas. Neither uploads or sends your photo to a server.
- Adds a thin **black border** around each photo.
- Leaves a **tiny gap** between photos so you can cut them apart cleanly.
- Auto-centers the grid on the sheet and picks portrait/landscape automatically to fit as many copies as possible (8x by default for a standard 35x45mm photo).
- Output is a flat JPEG sized exactly 10x15cm at 300 DPI (or whatever DPI/size you choose), so it prints at the correct physical dimensions without any extra scaling/cropping by the kiosk.

## Example

With a standard 35x45mm photo, the defaults produce a 4x2 grid (8 photos)
on a 10x15cm sheet:

![example output](examples/sample-print-sheet.jpg)

(The face above is a synthetic placeholder graphic used for documentation —
not a real photo.)

## Browser tool

The static browser interface is published from `docs/` at
<https://rajeshgangireddy.github.io/passport-photo-print-layout/>.

To run it locally without a build step:

```bash
python3 -m http.server 8000 --directory docs
```

Then open <http://localhost:8000>, choose or drop a JPEG or PNG, set the photo
and sheet dimensions, and download a JPEG, PNG, or WebP. The interface
preserves the source aspect ratio without cropping, centers the layout, and
includes the selected DPI in JPEG and PNG metadata. WebP is compact but does
not embed print DPI and may not be accepted by every kiosk; the format is
offered only when the browser supports WebP export. It supports
standard 35 x 45 mm and US 50.8 x 50.8 mm photo presets, 10 x 15 cm, 13 x 18
cm, A4, and custom sizes.

Your photo never leaves your device. It is processed on your machine, in this
browser, using Canvas only. Nothing is uploaded, sent, or stored by a server;
there are no analytics or external image-processing services. A 30 MB file
limit and browser-safe image/output limits help avoid excessive memory use.

### Enable GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` publishes `docs/` when
changes to the browser tool or workflow are pushed to `master`; it can also be
started manually from the repository's **Actions** tab. GitHub Pages is
configured to use **GitHub Actions** as its build and deployment source.

## Requirements

- Python 3.9+
- Pillow

```bash
pip install -r requirements.txt
```

## Usage

```bash
python3 passport_layout.py path/to/photo.jpg -o print-sheet.jpg
```

This uses sensible defaults:

| Option | Default | Meaning |
|---|---|---|
| `--photo-width-mm` / `--photo-height-mm` | 35 / 45 | Physical size each photo is scaled to fit (standard passport photo size for most countries incl. EU/UK/India; override if your country uses a different spec, e.g. US passport uses 50x50mm/2x2in). |
| `--page-width-mm` / `--page-height-mm` | 100 / 150 | Print sheet size (10x15cm = standard "4R"/4x6" photo print). |
| `--border-mm` | 0.5 | Black border thickness around each photo. |
| `--gap-mm` | 1.0 | Tiny gap between photos, for cutting. |
| `--margin-mm` | 1.5 | Margin from the sheet edge (keeps the grid away from areas some borderless printers trim). |
| `--dpi` | 300 | Output resolution. |
| `--orientation` | auto | `auto` picks whichever of portrait/landscape fits more copies; or force `portrait`/`landscape`. |
| `--copies` | (fill sheet) | Limit the number of photos placed, e.g. `--copies 4`. |
| `--border-color` / `--bg-color` | black / white | Customize colors. |

Run `python3 passport_layout.py --help` for the full list.

### Example: different photo size

```bash
# US passport (2x2 inch = 50.8x50.8mm)
python3 passport_layout.py photo.jpg -o print-sheet.jpg \
  --photo-width-mm 50.8 --photo-height-mm 50.8
```

## How it works

1. The source photo is scaled (preserving aspect ratio, not cropped) to
   exactly fit `--photo-width-mm` x `--photo-height-mm`.
2. A black-bordered "cell" is built around it (`--border-mm` thick).
3. Cells are tiled in a grid with `--gap-mm` spacing and `--margin-mm` page
   margins, centered on a `--page-width-mm` x `--page-height-mm` canvas.
4. The result is saved as a single flat JPEG at `--dpi`, with the DPI tag
   embedded so it prints at the correct physical size.

## Printing at Kruidvat (or similar kiosks)

Upload the generated `print-sheet.jpg` and order a single **10x15cm**
print. Because the file is already sized exactly 10x15cm at 300 DPI, the
kiosk should print it 1:1 without stretching. Some borderless printers trim
a millimeter or two off each edge — the default 1.5mm margin leaves a small
safety buffer for that.

## Privacy

The CLI reads the input photo and writes the output file on your machine. In
the browser tool, your photo never leaves your device: it is processed on
your machine, in this browser, using local Canvas operations. Neither surface
uploads, transmits, or logs the photo, and the browser UI does not include
analytics or remote image-processing services.

## License

MIT
