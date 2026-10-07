import { calculateLayout, fitRect } from "./layout.mjs";

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;
const MAX_OUTPUT_PIXELS = 24_000_000;
const MAX_OUTPUT_EDGE = 10_000;
const MAX_IMAGE_EDGE = 6_000;
const MAX_IMAGE_PIXELS = 24_000_000;
const JPEG_SCAN_BYTES = 2 * 1024 * 1024;

const elements = {
  imageFile: document.querySelector("#image-file"),
  chooseImage: document.querySelector("#choose-image"),
  clearPhoto: document.querySelector("#clear-photo"),
  dropZone: document.querySelector("#drop-zone"),
  fileMeta: document.querySelector("#file-meta"),
  photoPreset: document.querySelector("#photo-preset"),
  photoWidth: document.querySelector("#photo-width"),
  photoHeight: document.querySelector("#photo-height"),
  pagePreset: document.querySelector("#page-preset"),
  pageWidth: document.querySelector("#page-width"),
  pageHeight: document.querySelector("#page-height"),
  borderWidth: document.querySelector("#border-width"),
  borderColor: document.querySelector("#border-color"),
  photoGap: document.querySelector("#photo-gap"),
  pageMargin: document.querySelector("#page-margin"),
  resolution: document.querySelector("#resolution"),
  orientation: document.querySelector("#orientation"),
  copyCount: document.querySelector("#copy-count"),
  fillSheet: document.querySelector("#fill-sheet"),
  limitCopies: document.querySelector("#limit-copies"),
  downloadImage: document.querySelector("#download-image"),
  canvas: document.querySelector("#sheet-canvas"),
  emptyPreview: document.querySelector("#empty-preview"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyCaption: document.querySelector("#empty-caption"),
  layoutMessage: document.querySelector("#layout-message"),
  downloadMessage: document.querySelector("#download-message"),
  summarySheet: document.querySelector("#summary-sheet"),
  summaryResolution: document.querySelector("#summary-resolution"),
  summaryCount: document.querySelector("#summary-count"),
  summaryGrid: document.querySelector("#summary-grid"),
  summaryPhoto: document.querySelector("#summary-photo"),
  summaryCell: document.querySelector("#summary-cell"),
  summarySpacing: document.querySelector("#summary-spacing"),
  summaryOrientation: document.querySelector("#summary-orientation"),
};

const state = {
  source: null,
  sourceWidth: 0,
  sourceHeight: 0,
  loading: false,
  loadError: "",
  uploadSequence: 0,
  layout: null,
  outputError: "",
};

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatSize(width, height, unit = "mm") {
  return `${formatNumber(width)} x ${formatNumber(height)} ${unit}`;
}

function readNumber(input, label, { integer = false } = {}) {
  const value = input.valueAsNumber;
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  if (!Number.isFinite(value)) throw new Error(`${label} is required.`);
  if (value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  if (integer && !Number.isInteger(value)) throw new Error(`${label} must be a whole number.`);
  if (!input.validity.valid) throw new Error(`${label} must use increments of ${input.step}.`);
  return value;
}

function readSettings() {
  const copyMode = elements.limitCopies.checked ? "limit" : "fill";
  return {
    photoWidthMm: readNumber(elements.photoWidth, "Photo width"),
    photoHeightMm: readNumber(elements.photoHeight, "Photo height"),
    pageWidthMm: readNumber(elements.pageWidth, "Sheet width"),
    pageHeightMm: readNumber(elements.pageHeight, "Sheet height"),
    borderMm: readNumber(elements.borderWidth, "Border width"),
    gapMm: readNumber(elements.photoGap, "Photo gap"),
    marginMm: readNumber(elements.pageMargin, "Page margin"),
    dpi: readNumber(elements.resolution, "Resolution", { integer: true }),
    orientation: elements.orientation.value,
    copyMode,
    maxCopies: copyMode === "limit"
      ? readNumber(elements.copyCount, "Maximum copies", { integer: true })
      : 0,
  };
}

function setMessage(element, text, kind = "") {
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle("is-warning", kind === "warning");
  element.classList.toggle("is-error", kind === "error");
}

function showEmptyPreview(title, caption) {
  elements.emptyTitle.textContent = title;
  elements.emptyCaption.textContent = caption;
  elements.emptyPreview.hidden = false;
  elements.canvas.hidden = true;
  elements.canvas.width = 1;
  elements.canvas.height = 1;
}

function updateSummary(layout) {
  elements.summarySheet.textContent =
    `${formatSize(layout.pageWidthMm, layout.pageHeightMm)} (${layout.orientation})`;
  elements.summaryResolution.textContent =
    `${layout.pageWidthPx} x ${layout.pageHeightPx} px @ ${layout.dpi} DPI`;
  elements.summaryCount.textContent = `${layout.copies} placed / ${layout.capacity} fit`;
  elements.summaryGrid.textContent = layout.copies > 0
    ? `${layout.columns} ${layout.columns === 1 ? "column" : "columns"} x ${layout.rows} ${layout.rows === 1 ? "row" : "rows"}`
    : "No fit";
  elements.summaryPhoto.textContent =
    `${formatSize(layout.photoWidthMm, layout.photoHeightMm)} · ${formatSize(layout.photoWidthPx, layout.photoHeightPx, "px")}`;
  elements.summaryCell.textContent =
    `${formatSize(layout.cellWidthMm, layout.cellHeightMm)} · includes border`;
  elements.summarySpacing.textContent =
    `${formatNumber(layout.gapMm)} mm gap · ${formatNumber(layout.marginMm)} mm margin`;
  const orientationSource = elements.orientation.value === "auto" ? "automatic" : "forced";
  elements.summaryOrientation.textContent =
    `${layout.orientation} · ${orientationSource}`;
}

function outputDimensionsExceedLimit(layout) {
  const pixels = layout.pageWidthPx * layout.pageHeightPx;
  return pixels > MAX_OUTPUT_PIXELS
    || layout.pageWidthPx > MAX_OUTPUT_EDGE
    || layout.pageHeightPx > MAX_OUTPUT_EDGE;
}

function outputLimitMessage(layout) {
  return `This sheet would render at ${layout.pageWidthPx} x ${layout.pageHeightPx} pixels. Reduce the DPI or sheet size to stay within the safe browser output limit.`;
}

function updateNotice(layout) {
  if (state.loading) {
    setMessage(elements.layoutMessage, "Preparing the image locally in this browser...");
  } else if (state.loadError) {
    setMessage(elements.layoutMessage, state.loadError, "error");
  } else if (state.outputError) {
    setMessage(elements.layoutMessage, state.outputError, "error");
  } else if (layout.capacity === 0) {
    setMessage(elements.layoutMessage, "No photos fit. Reduce the photo size, border, or margin, or choose a larger sheet.", "error");
  } else if (layout.limitedByCapacity) {
    setMessage(
      elements.layoutMessage,
      `You requested ${layout.requestedCopies} copies, but only ${layout.capacity} fit. The sheet is limited to ${layout.copies} copies; choose a larger sheet or smaller photo size for more.`,
      "warning",
    );
  } else if (elements.orientation.value === "auto") {
    const otherCapacity = layout.orientation === "portrait"
      ? layout.landscapeCapacity
      : layout.portraitCapacity;
    const chosenCapacity = layout.orientation === "portrait"
      ? layout.portraitCapacity
      : layout.landscapeCapacity;
    const tieNote = chosenCapacity === otherCapacity ? " Both orientations fit the same number; portrait is used for ties." : "";
    setMessage(elements.layoutMessage, `Auto orientation selected ${layout.orientation} to fit ${chosenCapacity} photo${chosenCapacity === 1 ? "" : "s"}.${tieNote}`);
  } else {
    setMessage(elements.layoutMessage, "");
  }
}

function drawSheet(layout) {
  elements.canvas.width = layout.pageWidthPx;
  elements.canvas.height = layout.pageHeightPx;
  const context = elements.canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not create a Canvas for the print sheet.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, layout.pageWidthPx, layout.pageHeightPx);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  for (let index = 0; index < layout.copies; index += 1) {
    const row = Math.floor(index / layout.columns);
    const column = index % layout.columns;
    const x = layout.offsetX + column * (layout.cellWidthPx + layout.gapPx);
    const y = layout.offsetY + row * (layout.cellHeightPx + layout.gapPx);
    const photoX = x + layout.borderPx;
    const photoY = y + layout.borderPx;

    if (layout.borderPx > 0) {
      context.fillStyle = elements.borderColor.value;
      context.fillRect(x, y, layout.cellWidthPx, layout.cellHeightPx);
    }
    context.fillStyle = "#ffffff";
    context.fillRect(photoX, photoY, layout.photoWidthPx, layout.photoHeightPx);

    const fitted = fitRect(
      state.sourceWidth,
      state.sourceHeight,
      layout.photoWidthPx,
      layout.photoHeightPx,
    );
    context.drawImage(
      state.source,
      photoX + fitted.x,
      photoY + fitted.y,
      fitted.width,
      fitted.height,
    );
  }

  elements.canvas.setAttribute(
    "aria-label",
    `Print sheet preview, ${layout.copies} photos on a ${formatSize(layout.pageWidthMm, layout.pageHeightMm)} sheet.`,
  );
}

function updateDownloadState() {
  elements.downloadImage.disabled = !state.source
    || state.loading
    || !state.layout
    || Boolean(state.outputError)
    || state.layout.capacity === 0;
}

function renderLayout() {
  try {
    state.layout = calculateLayout(readSettings());
  } catch (error) {
    state.layout = null;
    state.outputError = "";
    showEmptyPreview("Check the sheet settings", "Correct the highlighted size or resolution value to continue.");
    setMessage(elements.layoutMessage, error.message, "error");
    updateDownloadState();
    return;
  }

  const layout = state.layout;
  updateSummary(layout);
  state.outputError = outputDimensionsExceedLimit(layout) ? outputLimitMessage(layout) : "";
  updateNotice(layout);

  if (state.outputError || layout.capacity === 0) {
    showEmptyPreview(
      state.outputError ? "Output is too large" : "No photos fit this sheet",
      state.outputError
        ? "Lower the resolution or choose a smaller sheet."
        : "Change the photo, border, or sheet dimensions.",
    );
  } else if (state.source && !state.loading) {
    try {
      drawSheet(layout);
      elements.canvas.hidden = false;
      elements.emptyPreview.hidden = true;
    } catch (error) {
      state.outputError = error instanceof Error ? error.message : "The print sheet could not be rendered.";
      showEmptyPreview("The sheet could not be rendered", "Try a smaller page or lower resolution.");
      setMessage(elements.layoutMessage, state.outputError, "error");
    }
  } else if (state.loading) {
    showEmptyPreview("Preparing your photo...", "Your image is being handled only in this browser.");
  } else {
    showEmptyPreview("Your sheet will appear here", "Add a photo to create the print layout.");
  }

  updateDownloadState();
}

function toggleCustomFields(preset, widthInput, heightInput, isCustom) {
  widthInput.disabled = !isCustom;
  heightInput.disabled = !isCustom;
  if (isCustom) return;
  const [width, height] = preset.value.split("x").map(Number);
  widthInput.value = String(width);
  heightInput.value = String(height);
}

function resizeDimensions(width, height) {
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(width, height),
    Math.sqrt(MAX_IMAGE_PIXELS / (width * height)),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 4 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (sofMarkers.has(marker) && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

async function readImageDimensions(file) {
  const buffer = await file.slice(0, Math.min(file.size, JPEG_SCAN_BYTES)).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (
    bytes.length >= 24
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    const view = new DataView(buffer);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  return jpegDimensions(bytes);
}

function checkInputDimensions(dimensions) {
  if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height)) {
    throw new Error("This file does not contain a readable JPEG or PNG image.");
  }
  if (dimensions.width * dimensions.height > MAX_INPUT_PIXELS || Math.max(dimensions.width, dimensions.height) > 12_000) {
    throw new Error("This image is too large to open safely in the browser. Choose a smaller JPEG or PNG file.");
  }
}

async function decodeWithBitmap(file) {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      // imageOrientation defaults to from-image in createImageBitmap.
      return await createImageBitmap(file);
    } catch {
      throw new Error("This JPEG or PNG could not be decoded by the browser. Try exporting it again as a standard image.");
    }
  }
}

async function decodeWithImageElement(file) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    // Image decoding in current browsers applies JPEG EXIF orientation.
    image.src = imageUrl;
    await image.decode();
    return image;
  } catch (error) {
    throw new Error("This JPEG or PNG could not be decoded by the browser. Try exporting it again as a standard image.");
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function normalizeDecodedSource(decoded) {
  const width = decoded.width || decoded.naturalWidth;
  const height = decoded.height || decoded.naturalHeight;
  if (!width || !height) throw new Error("The browser returned an empty image.");
  const resized = resizeDimensions(width, height);
  if (resized.width === width && resized.height === height) return decoded;

  const canvas = document.createElement("canvas");
  canvas.width = resized.width;
  canvas.height = resized.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the source image safely.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
  if (typeof decoded.close === "function") decoded.close();
  return canvas;
}

async function loadPhoto(file) {
  const sequence = ++state.uploadSequence;
  if (state.source && typeof state.source.close === "function") state.source.close();
  state.source = null;
  state.sourceWidth = 0;
  state.sourceHeight = 0;
  state.loading = true;
  state.loadError = "";
  elements.clearPhoto.disabled = true;
  elements.fileMeta.textContent = `Preparing ${file.name} locally...`;
  setMessage(elements.downloadMessage, "");
  renderLayout();

  try {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("This file is larger than 30 MB. Choose a smaller JPEG or PNG.");
    }
    const dimensions = await readImageDimensions(file);
    checkInputDimensions(dimensions);
    const decoded = await decodeWithBitmap(file)
      || await decodeWithImageElement(file);
    const source = normalizeDecodedSource(decoded);
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;

    if (sequence !== state.uploadSequence) {
      if (typeof source.close === "function") source.close();
      return;
    }

    state.source = source;
    state.sourceWidth = width;
    state.sourceHeight = height;
    state.loading = false;
    state.loadError = "";
    elements.clearPhoto.disabled = false;
    elements.fileMeta.textContent = `${file.name} · ${width} x ${height} px prepared locally`;
    setMessage(elements.downloadMessage, "");
    renderLayout();
  } catch (error) {
    if (sequence !== state.uploadSequence) return;
    state.loading = false;
    state.loadError = error instanceof Error ? error.message : "The selected image could not be prepared.";
    elements.clearPhoto.disabled = true;
    elements.fileMeta.textContent = "Maximum file size: 30 MB";
    renderLayout();
  }
}

function clearPhoto() {
  state.uploadSequence += 1;
  if (state.source && typeof state.source.close === "function") state.source.close();
  state.source = null;
  state.sourceWidth = 0;
  state.sourceHeight = 0;
  state.loading = false;
  state.loadError = "";
  elements.imageFile.value = "";
  elements.fileMeta.textContent = "Maximum file size: 30 MB";
  elements.clearPhoto.disabled = true;
  setMessage(elements.downloadMessage, "");
  renderLayout();
}

function writeUint16(bytes, offset, value) {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function setJfifDensity(jpeg, dpi) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error("The browser did not return a valid JPEG image.");
  }

  let offset = 2;
  while (offset + 4 < jpeg.length && jpeg[offset] === 0xff) {
    let markerOffset = offset + 1;
    while (jpeg[markerOffset] === 0xff) markerOffset += 1;
    const marker = jpeg[markerOffset];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = markerOffset + 1;
      continue;
    }

    const lengthOffset = markerOffset + 1;
    if (lengthOffset + 2 > jpeg.length) break;
    const segmentLength = (jpeg[lengthOffset] << 8) | jpeg[lengthOffset + 1];
    const payloadOffset = lengthOffset + 2;
    if (segmentLength < 2 || lengthOffset + segmentLength > jpeg.length) break;

    if (
      marker === 0xe0
      && segmentLength >= 16
      && jpeg[payloadOffset] === 0x4a
      && jpeg[payloadOffset + 1] === 0x46
      && jpeg[payloadOffset + 2] === 0x49
      && jpeg[payloadOffset + 3] === 0x46
      && jpeg[payloadOffset + 4] === 0
    ) {
      jpeg[payloadOffset + 7] = 1;
      writeUint16(jpeg, payloadOffset + 8, dpi);
      writeUint16(jpeg, payloadOffset + 10, dpi);
      return jpeg;
    }
    offset = lengthOffset + segmentLength;
  }

  const segment = new Uint8Array(18);
  segment.set([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01]);
  writeUint16(segment, 12, dpi);
  writeUint16(segment, 14, dpi);
  segment[16] = 0;
  segment[17] = 0;

  const output = new Uint8Array(jpeg.length + segment.length);
  output.set(jpeg.subarray(0, 2), 0);
  output.set(segment, 2);
  output.set(jpeg.subarray(2), 2 + segment.length);
  return output;
}

async function downloadSheet() {
  if (!state.source || !state.layout || elements.downloadImage.disabled) return;
  const layout = state.layout;
  elements.downloadImage.disabled = true;
  setMessage(elements.downloadMessage, "");

  try {
    const blob = await new Promise((resolve, reject) => {
      elements.canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("The browser could not encode the print sheet as JPEG.")),
        "image/jpeg",
        0.95,
      );
    });
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const taggedJpeg = setJfifDensity(jpeg, layout.dpi);
    const output = new Blob([taggedJpeg], { type: "image/jpeg" });
    const url = URL.createObjectURL(output);
    const link = document.createElement("a");
    const width = formatNumber(layout.pageWidthMm).replace(".", "p");
    const height = formatNumber(layout.pageHeightMm).replace(".", "p");
    link.href = url;
    link.download = `passport-photo-sheet-${width}x${height}mm-${layout.dpi}dpi.jpg`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(
      elements.downloadMessage,
      `JPEG saved at ${layout.dpi} DPI with the sheet dimensions embedded in its image data.`,
    );
  } catch (error) {
    setMessage(
      elements.downloadMessage,
      error instanceof Error ? error.message : "The print sheet could not be downloaded.",
      "error",
    );
  } finally {
    updateDownloadState();
  }
}

elements.chooseImage.addEventListener("click", () => elements.imageFile.click());
elements.imageFile.addEventListener("change", () => {
  const [file] = elements.imageFile.files || [];
  if (file) loadPhoto(file);
});
elements.clearPhoto.addEventListener("click", clearPhoto);
elements.downloadImage.addEventListener("click", downloadSheet);

elements.dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
});
elements.dropZone.addEventListener("dragover", (event) => event.preventDefault());
elements.dropZone.addEventListener("dragleave", (event) => {
  if (!elements.dropZone.contains(event.relatedTarget)) {
    elements.dropZone.classList.remove("is-dragging");
  }
});
elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
  const [file] = event.dataTransfer?.files || [];
  if (file) loadPhoto(file);
});

elements.photoPreset.addEventListener("change", () => {
  toggleCustomFields(elements.photoPreset, elements.photoWidth, elements.photoHeight, elements.photoPreset.value === "custom");
  renderLayout();
});
elements.pagePreset.addEventListener("change", () => {
  toggleCustomFields(elements.pagePreset, elements.pageWidth, elements.pageHeight, elements.pagePreset.value === "custom");
  renderLayout();
});
elements.fillSheet.addEventListener("change", () => {
  elements.copyCount.disabled = true;
  renderLayout();
});
elements.limitCopies.addEventListener("change", () => {
  elements.copyCount.disabled = false;
  renderLayout();
});

[
  elements.photoWidth,
  elements.photoHeight,
  elements.pageWidth,
  elements.pageHeight,
  elements.borderWidth,
  elements.borderColor,
  elements.photoGap,
  elements.pageMargin,
  elements.resolution,
  elements.orientation,
  elements.copyCount,
].forEach((input) => {
  input.addEventListener("input", renderLayout);
  input.addEventListener("change", renderLayout);
});

document.querySelectorAll("input[type='number']").forEach((input) => {
  input.addEventListener("input", () => input.setAttribute("aria-invalid", String(!input.validity.valid)));
});

showEmptyPreview("Your sheet will appear here", "Add a photo to create the print layout.");
renderLayout();
