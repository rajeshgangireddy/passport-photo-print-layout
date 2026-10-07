import { calculateLayout, fitRect } from "./layout.mjs";

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;
const MAX_OUTPUT_PIXELS = 24_000_000;
const MAX_OUTPUT_EDGE = 10_000;
const MAX_IMAGE_EDGE = 6_000;
const MAX_IMAGE_PIXELS = 24_000_000;
const JPEG_SCAN_BYTES = 2 * 1024 * 1024;
const DEFAULTS = Object.freeze({
  photoWidth: 35,
  photoHeight: 45,
  pageWidth: 100,
  pageHeight: 150,
  borderWidth: 0.5,
  borderColor: "#000000",
  photoGap: 1,
  pageMargin: 1.5,
  resolution: 300,
  orientation: "auto",
  copyCount: 4,
  outputFormat: "jpeg",
});
const OUTPUT_FORMATS = Object.freeze({
  jpeg: {
    label: "JPEG",
    mime: "image/jpeg",
    extension: "jpg",
    quality: 0.95,
    help: "Widely accepted by kiosks; embeds print DPI.",
  },
  png: {
    label: "PNG",
    mime: "image/png",
    extension: "png",
    quality: undefined,
    help: "Lossless quality; embeds print DPI.",
  },
  webp: {
    label: "WebP",
    mime: "image/webp",
    extension: "webp",
    quality: 0.92,
    help: "Compact; some kiosks do not accept it. DPI metadata is not embedded.",
  },
});

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
  outputFormat: document.querySelector("#output-format"),
  webpOption: document.querySelector("#output-format option[value='webp']"),
  formatHelp: document.querySelector("#format-help"),
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
  summaryFormat: document.querySelector("#summary-format"),
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
  elements.summaryFormat.textContent = OUTPUT_FORMATS[elements.outputFormat.value].label;
}

function isSettingDefault(setting) {
  switch (setting) {
    case "photo-preset":
      return elements.photoPreset.value === "35x45";
    case "photo-width":
      return elements.photoWidth.valueAsNumber === DEFAULTS.photoWidth;
    case "photo-height":
      return elements.photoHeight.valueAsNumber === DEFAULTS.photoHeight;
    case "page-preset":
      return elements.pagePreset.value === "100x150";
    case "page-width":
      return elements.pageWidth.valueAsNumber === DEFAULTS.pageWidth;
    case "page-height":
      return elements.pageHeight.valueAsNumber === DEFAULTS.pageHeight;
    case "border-width":
      return elements.borderWidth.valueAsNumber === DEFAULTS.borderWidth;
    case "border-color":
      return elements.borderColor.value.toLowerCase() === DEFAULTS.borderColor;
    case "photo-gap":
      return elements.photoGap.valueAsNumber === DEFAULTS.photoGap;
    case "page-margin":
      return elements.pageMargin.valueAsNumber === DEFAULTS.pageMargin;
    case "resolution":
      return elements.resolution.valueAsNumber === DEFAULTS.resolution;
    case "orientation":
      return elements.orientation.value === DEFAULTS.orientation;
    case "copy-mode":
      return elements.fillSheet.checked && elements.copyCount.valueAsNumber === DEFAULTS.copyCount;
    case "copy-count":
      return elements.copyCount.valueAsNumber === DEFAULTS.copyCount;
    case "format":
      return elements.outputFormat.value === DEFAULTS.outputFormat;
    default:
      throw new Error(`Unknown reset setting: ${setting}`);
  }
}

function updateResetButtons() {
  document.querySelectorAll("[data-reset]").forEach((button) => {
    button.disabled = isSettingDefault(button.dataset.reset);
  });
}

function updateFormatControl() {
  const format = OUTPUT_FORMATS[elements.outputFormat.value];
  elements.formatHelp.textContent = format.help;
  elements.downloadImage.textContent = `Download ${format.label}`;
}

function detectWebpExportSupport() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  if (typeof canvas.toBlob !== "function") return Promise.resolve(false);

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob?.type === "image/webp"), "image/webp", 0.8);
    } catch {
      resolve(false);
    }
  });
}

function setInputValue(input, value) {
  input.value = String(value);
  input.setAttribute("aria-invalid", String(!input.validity.valid));
}

function resetSetting(setting) {
  switch (setting) {
    case "photo-preset":
      elements.photoPreset.value = "35x45";
      toggleCustomFields(elements.photoPreset, elements.photoWidth, elements.photoHeight, false);
      break;
    case "photo-width":
      elements.photoPreset.value = "custom";
      toggleCustomFields(elements.photoPreset, elements.photoWidth, elements.photoHeight, true);
      setInputValue(elements.photoWidth, DEFAULTS.photoWidth);
      break;
    case "photo-height":
      elements.photoPreset.value = "custom";
      toggleCustomFields(elements.photoPreset, elements.photoWidth, elements.photoHeight, true);
      setInputValue(elements.photoHeight, DEFAULTS.photoHeight);
      break;
    case "page-preset":
      elements.pagePreset.value = "100x150";
      toggleCustomFields(elements.pagePreset, elements.pageWidth, elements.pageHeight, false);
      break;
    case "page-width":
      elements.pagePreset.value = "custom";
      toggleCustomFields(elements.pagePreset, elements.pageWidth, elements.pageHeight, true);
      setInputValue(elements.pageWidth, DEFAULTS.pageWidth);
      break;
    case "page-height":
      elements.pagePreset.value = "custom";
      toggleCustomFields(elements.pagePreset, elements.pageWidth, elements.pageHeight, true);
      setInputValue(elements.pageHeight, DEFAULTS.pageHeight);
      break;
    case "border-width":
      setInputValue(elements.borderWidth, DEFAULTS.borderWidth);
      break;
    case "border-color":
      elements.borderColor.value = DEFAULTS.borderColor;
      break;
    case "photo-gap":
      setInputValue(elements.photoGap, DEFAULTS.photoGap);
      break;
    case "page-margin":
      setInputValue(elements.pageMargin, DEFAULTS.pageMargin);
      break;
    case "resolution":
      setInputValue(elements.resolution, DEFAULTS.resolution);
      break;
    case "orientation":
      elements.orientation.value = DEFAULTS.orientation;
      break;
    case "copy-mode":
      elements.fillSheet.checked = true;
      elements.limitCopies.checked = false;
      elements.copyCount.disabled = true;
      setInputValue(elements.copyCount, DEFAULTS.copyCount);
      break;
    case "copy-count":
      setInputValue(elements.copyCount, DEFAULTS.copyCount);
      break;
    case "format":
      elements.outputFormat.value = DEFAULTS.outputFormat;
      break;
    default:
      throw new Error(`Unknown reset setting: ${setting}`);
  }

  setMessage(elements.downloadMessage, "");
  renderLayout();
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
  updateFormatControl();
  updateResetButtons();
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
  widthInput.setAttribute("aria-invalid", String(!widthInput.validity.valid));
  heightInput.setAttribute("aria-invalid", String(!heightInput.validity.valid));
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

function readUint32(bytes, offset) {
  return bytes[offset] * 0x1000000
    + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100
    + bytes[offset + 3];
}

function writeUint32(bytes, offset, value) {
  const unsigned = value >>> 0;
  bytes[offset] = (unsigned >>> 24) & 0xff;
  bytes[offset + 1] = (unsigned >>> 16) & 0xff;
  bytes[offset + 2] = (unsigned >>> 8) & 0xff;
  bytes[offset + 3] = unsigned & 0xff;
}

function pngCrc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngPhysChunk(pixelsPerMeter) {
  const chunk = new Uint8Array(21);
  writeUint32(chunk, 0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  writeUint32(chunk, 8, pixelsPerMeter);
  writeUint32(chunk, 12, pixelsPerMeter);
  chunk[16] = 1;
  writeUint32(chunk, 17, pngCrc32(chunk, 4, 17));
  return chunk;
}

function setPngDensity(png, dpi) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => png[index] === byte)) {
    throw new Error("The browser did not return a valid PNG image.");
  }

  const pixelsPerMeter = Math.round(dpi * 10_000 / 254);
  let offset = signature.length;
  while (offset + 12 <= png.length) {
    const chunkLength = readUint32(png, offset);
    const dataOffset = offset + 8;
    const chunkEnd = dataOffset + chunkLength + 4;
    if (chunkEnd > png.length) throw new Error("The browser returned an incomplete PNG image.");

    const chunkType = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (chunkType === "pHYs") {
      if (chunkLength !== 9) throw new Error("The PNG print-density metadata is invalid.");
      const output = png.slice();
      writeUint32(output, dataOffset, pixelsPerMeter);
      writeUint32(output, dataOffset + 4, pixelsPerMeter);
      output[dataOffset + 8] = 1;
      writeUint32(output, dataOffset + chunkLength, pngCrc32(output, offset + 4, dataOffset + chunkLength));
      return output;
    }

    if (chunkType === "IDAT") {
      const chunk = createPngPhysChunk(pixelsPerMeter);
      const output = new Uint8Array(png.length + chunk.length);
      output.set(png.subarray(0, offset), 0);
      output.set(chunk, offset);
      output.set(png.subarray(offset), offset + chunk.length);
      return output;
    }

    offset = chunkEnd;
  }

  throw new Error("The browser returned a PNG image without image data.");
}

async function downloadSheet() {
  if (!state.source || !state.layout || elements.downloadImage.disabled) return;
  const layout = state.layout;
  const format = OUTPUT_FORMATS[elements.outputFormat.value];
  elements.downloadImage.disabled = true;
  setMessage(elements.downloadMessage, "");

  try {
    const blob = await new Promise((resolve, reject) => {
      elements.canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error(`The browser could not encode the print sheet as ${format.label}.`)),
        format.mime,
        format.quality,
      );
    });
    if (blob.type !== format.mime) {
      throw new Error(`${format.label} export is not supported by this browser. Choose JPEG or PNG instead.`);
    }

    let imageData = new Uint8Array(await blob.arrayBuffer());
    if (elements.outputFormat.value === "jpeg") {
      imageData = setJfifDensity(imageData, layout.dpi);
    } else if (elements.outputFormat.value === "png") {
      imageData = setPngDensity(imageData, layout.dpi);
    }
    const output = new Blob([imageData], { type: format.mime });
    const url = URL.createObjectURL(output);
    const link = document.createElement("a");
    const width = formatNumber(layout.pageWidthMm).replace(".", "p");
    const height = formatNumber(layout.pageHeightMm).replace(".", "p");
    link.href = url;
    link.download = `passport-photo-sheet-${width}x${height}mm-${layout.dpi}dpi.${format.extension}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    const successMessage = elements.outputFormat.value === "webp"
      ? `WebP saved at ${layout.dpi} DPI-equivalent resolution. WebP does not embed print DPI; use JPEG or PNG for kiosks that need it.`
      : `${format.label} saved at ${layout.dpi} DPI with print-density metadata.`;
    setMessage(elements.downloadMessage, successMessage);
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
elements.outputFormat.addEventListener("change", renderLayout);

document.querySelectorAll("[data-reset]").forEach((button) => {
  button.addEventListener("click", () => resetSetting(button.dataset.reset));
});

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
detectWebpExportSupport().then((supported) => {
  elements.webpOption.disabled = !supported;
  elements.webpOption.textContent = supported ? "WebP - compact" : "WebP - unavailable here";
  if (!supported && elements.outputFormat.value === "webp") {
    elements.outputFormat.value = DEFAULTS.outputFormat;
    renderLayout();
  } else {
    updateFormatControl();
  }
});
