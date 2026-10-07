const MM_PER_INCH = 25.4;

function roundToEven(value) {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

export function mmToPx(mm, dpi) {
  return roundToEven(mm / MM_PER_INCH * dpi);
}

function orientationSize(width, height, orientation) {
  if (orientation === "portrait") {
    return width <= height ? [width, height] : [height, width];
  }
  return width >= height ? [width, height] : [height, width];
}

function pageMetrics(widthMm, heightMm, cellWidth, cellHeight, gap, margin, dpi) {
  const pageWidth = mmToPx(widthMm, dpi);
  const pageHeight = mmToPx(heightMm, dpi);
  const usableWidth = pageWidth - 2 * margin;
  const usableHeight = pageHeight - 2 * margin;
  const columns = usableWidth >= cellWidth
    ? Math.floor((usableWidth + gap) / (cellWidth + gap))
    : 0;
  const rows = usableHeight >= cellHeight
    ? Math.floor((usableHeight + gap) / (cellHeight + gap))
    : 0;

  return {
    widthMm,
    heightMm,
    width: pageWidth,
    height: pageHeight,
    columns,
    rows,
    capacity: columns * rows,
  };
}

export function calculateLayout(settings) {
  const photoWidth = mmToPx(settings.photoWidthMm, settings.dpi);
  const photoHeight = mmToPx(settings.photoHeightMm, settings.dpi);
  const border = mmToPx(settings.borderMm, settings.dpi);
  const gap = mmToPx(settings.gapMm, settings.dpi);
  const margin = mmToPx(settings.marginMm, settings.dpi);
  if (photoWidth < 1 || photoHeight < 1) {
    throw new Error("Photo width and height must each render to at least one pixel at the selected DPI.");
  }
  const cellWidth = photoWidth + border * 2;
  const cellHeight = photoHeight + border * 2;

  const portraitSize = orientationSize(settings.pageWidthMm, settings.pageHeightMm, "portrait");
  const landscapeSize = orientationSize(settings.pageWidthMm, settings.pageHeightMm, "landscape");
  const portrait = pageMetrics(...portraitSize, cellWidth, cellHeight, gap, margin, settings.dpi);
  const landscape = pageMetrics(...landscapeSize, cellWidth, cellHeight, gap, margin, settings.dpi);

  let page;
  if (settings.orientation === "auto") {
    page = landscape.capacity > portrait.capacity ? landscape : portrait;
  } else {
    const size = orientationSize(settings.pageWidthMm, settings.pageHeightMm, settings.orientation);
    page = pageMetrics(...size, cellWidth, cellHeight, gap, margin, settings.dpi);
  }

  const requestedCopies = settings.copyMode === "limit"
    ? settings.maxCopies
    : page.capacity;
  const copies = Math.min(requestedCopies, page.capacity);
  const columns = copies > 0 ? Math.min(page.columns, copies) : 0;
  const rows = columns > 0 ? Math.ceil(copies / columns) : 0;
  const gridWidth = columns > 0 ? columns * cellWidth + (columns - 1) * gap : 0;
  const gridHeight = rows > 0 ? rows * cellHeight + (rows - 1) * gap : 0;

  return {
    dpi: settings.dpi,
    orientation: page.widthMm === page.heightMm
      ? "square"
      : page.widthMm > page.heightMm ? "landscape" : "portrait",
    pageWidthMm: page.widthMm,
    pageHeightMm: page.heightMm,
    pageWidthPx: page.width,
    pageHeightPx: page.height,
    photoWidthMm: settings.photoWidthMm,
    photoHeightMm: settings.photoHeightMm,
    photoWidthPx: photoWidth,
    photoHeightPx: photoHeight,
    borderMm: settings.borderMm,
    borderPx: border,
    cellWidthPx: cellWidth,
    cellHeightPx: cellHeight,
    cellWidthMm: cellWidth / settings.dpi * MM_PER_INCH,
    cellHeightMm: cellHeight / settings.dpi * MM_PER_INCH,
    gapMm: settings.gapMm,
    gapPx: gap,
    marginMm: settings.marginMm,
    marginPx: margin,
    capacity: page.capacity,
    requestedCopies,
    copies,
    limitedByCapacity: requestedCopies > page.capacity,
    columns,
    rows,
    gridWidthPx: gridWidth,
    gridHeightPx: gridHeight,
    offsetX: Math.floor((page.width - gridWidth) / 2),
    offsetY: Math.floor((page.height - gridHeight) / 2),
    portraitCapacity: portrait.capacity,
    landscapeCapacity: landscape.capacity,
  };
}

export function fitRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = Math.min(targetWidth, Math.round(sourceWidth * scale));
  const height = Math.min(targetHeight, Math.round(sourceHeight * scale));

  return {
    x: Math.floor((targetWidth - width) / 2),
    y: Math.floor((targetHeight - height) / 2),
    width,
    height,
  };
}
