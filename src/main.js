// Materials data
const MATERIALS = {
  nylon: { name: "Nylon", density: 1150, strength: 75e6 }, // 75 MPa
  fluorocarbon: { name: "Fluorocarbon", density: 1780, strength: 250e6 }, // 250 MPa
  gut: { name: "Gut", density: 1300, strength: 350e6 }, // 350 MPa
  nylgut: { name: "Nylgut", density: 1325, strength: 510e6 }, // 510 MPa
  wound: { name: "Classical Wound", density: 4915, strength: 290e6 }, // 290 MPa
  steel: { name: "Steel", density: 7850, strength: 1500e6 }, // 1500 MPa
  hc_steel: { name: "High Carbon Steel", density: 7850, strength: 2600e6 }, // 2600 MPa
  phosphor_bronze: { name: "Phosphor Bronze", density: 8830, strength: 900e6 }, // 900 MPa
  brass: { name: "Brass", density: 8600, strength: 600e6 }, // 600 MPa
  copper: { name: "Copper (soft)", density: 8940, strength: 220e6 }, // 220 MPa
};

// Note frequencies
const NOTE_REGEX = /^([A-G])(#|b)?(\d)$/i;
const SEMITONES = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

function getFrequency(noteStr) {
  const match = noteStr.match(NOTE_REGEX);
  if (!match) return null;
  const note = match[1].toUpperCase();
  const acc = match[2];
  const oct = parseInt(match[3], 10);

  let semi = SEMITONES[note];
  if (acc === "#") semi += 1;
  if (acc === "b") semi -= 1;

  // A4 is octave 4, semi 0
  const n = semi + (oct - 4) * 12;
  return 440 * Math.pow(2, n / 12);
}

// State
const state = {
  pxPerCm: 10,
  viewZoom: 1,
  offsetX: 0, // Pan X
  offsetY: 0, // Pan Y
  bgImage: null,
  bgImageBase64: null,
  bgScale: 1,
  bgOpacity: 0.5,
  bgX: 0,
  bgY: 0,
  bgEditMode: false,
  strings: [],
  selection: { type: null, ids: [] },
  draggingPoint: null, // { stringId, point }
  closestDistances: [],
  isPanning: false,
  isDraggingBg: false,
  isSelecting: false,
  isDraggingScale: false,
  isScaleLocked: true,
  isMeasuringMode: false,
  measureStart: null,
  measureCurrent: null,
  selectionBox: { startX: 0, startY: 0, endX: 0, endY: 0 },
  lastMouseX: 0,
  lastMouseY: 0,
};

// DOM Elements
const canvas = document.getElementById("main-canvas");
const ctx = canvas.getContext("2d");
const container = document.getElementById("canvas-container");

// Controls
const bgUpload = document.getElementById("bg-upload");
const btnUploadBg = document.getElementById("btn-upload-bg");
const btnAddString = document.getElementById("btn-add-string");
const viewZoomInput = document.getElementById("view-zoom");

// BG Controls
const bgControlsPanel = document.getElementById("bg-controls");
const btnLockBg = document.getElementById("btn-lock-bg");
const bgOpacityInput = document.getElementById("bg-opacity");
const btnMeasure = document.getElementById("btn-measure");
const btnExport = document.getElementById("btn-export");
const btnImport = document.getElementById("btn-import");
const importUpload = document.getElementById("import-upload");

// Render Controls
const btnRenderOpen = document.getElementById("btn-render-open");
const btnRenderClose = document.getElementById("btn-render-close");
const btnRenderExecute = document.getElementById("btn-render-execute");
const renderModal = document.getElementById("render-modal");

// Scale Controls
const scaleHandle = document.getElementById("scale-handle");
const scaleTooltip = document.getElementById("scale-tooltip");
const scaleValueInput = document.getElementById("scale-value-input");
const btnResetScale = document.getElementById("btn-reset-scale");

// Sidebar Elements
const propertiesCard = document.getElementById("properties-card");
const stringEditor = document.getElementById("string-properties");
const multiSelectionUi = document.getElementById("multi-selection-ui");
const strNoteName = document.getElementById("str-note-name");
const strNoteOctave = document.getElementById("str-note-octave");
const strMaterial = document.getElementById("str-material");
const strDiameter = document.getElementById("str-diameter");
const outLength = document.getElementById("out-length");
const outFreq = document.getElementById("out-freq");
const outTension = document.getElementById("out-tension");
const outStress = document.getElementById("out-stress");
const btnDeleteString = document.getElementById("btn-delete-string");

// Initialization
function init() {
  // Populate material dropdown
  strMaterial.innerHTML = Object.entries(MATERIALS)
    .map(([key, mat]) => `<option value="${key}">${mat.name}</option>`)
    .join("");

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Event Listeners
  btnUploadBg.addEventListener("click", () => bgUpload.click());
  bgUpload.addEventListener("change", handleBgUpload);

  let startX, startPxPerCm;
  let tooltipHideTimeout;

  function showTooltip() {
    clearTimeout(tooltipHideTimeout);
    scaleTooltip.classList.remove("hidden");
    updateScaleIndicator();
  }

  function hideTooltip() {
    tooltipHideTimeout = setTimeout(() => {
      if (
        !state.isDraggingScale &&
        document.activeElement !== scaleValueInput &&
        !scaleHandle.matches(":hover") &&
        !scaleTooltip.matches(":hover")
      ) {
        scaleTooltip.classList.add("hidden");
      }
    }, 300);
  }

  scaleHandle.addEventListener("mousedown", (e) => {
    e.preventDefault(); // Prevent text selection
    e.stopPropagation();

    state.isDraggingScale = true;
    startX = e.clientX;
    startPxPerCm = state.pxPerCm;
    document.body.style.cursor = "ew-resize";
    document.body.classList.add("is-dragging");
    showTooltip();
  });

  scaleHandle.addEventListener("mouseenter", showTooltip);
  scaleHandle.addEventListener("mouseleave", hideTooltip);

  scaleTooltip.addEventListener("mouseenter", showTooltip);
  scaleTooltip.addEventListener("mouseleave", hideTooltip);

  btnResetScale.addEventListener("click", (e) => {
    e.stopPropagation();
    state.pxPerCm = 10;
    updateScaleIndicator();
    updateSidebar();
    draw();
    scheduleSave();
  });

  scaleValueInput.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      state.pxPerCm = val;
      updateScaleIndicator();
      updateSidebar();
      draw();
      scheduleSave();
    }
  });

  scaleValueInput.addEventListener("blur", hideTooltip);

  window.addEventListener("mousemove", (e) => {
    if (state.isDraggingScale) {
      const dx = e.clientX - startX;
      const currentWidth = startPxPerCm * 10 * state.viewZoom;
      const newWidth = Math.max(10, currentWidth + dx);
      state.pxPerCm = newWidth / (10 * state.viewZoom);
      updateScaleIndicator();
      updateSidebar();
      draw();
    }
  });

  window.addEventListener("mouseup", () => {
    if (state.isDraggingScale) {
      state.isDraggingScale = false;
      document.body.style.cursor = "";
      document.body.classList.remove("is-dragging");
      scheduleSave();
      hideTooltip();
    }
  });

  viewZoomInput.addEventListener("input", (e) => {
    const newZoom = parseFloat(e.target.value);
    const mouseX = canvas.width / 2;
    const mouseY = canvas.height / 2;
    const worldX = (mouseX - state.offsetX) / state.viewZoom;
    const worldY = (mouseY - state.offsetY) / state.viewZoom;

    state.viewZoom = newZoom;
    state.offsetX = mouseX - worldX * state.viewZoom;
    state.offsetY = mouseY - worldY * state.viewZoom;

    updateScaleIndicator();
    draw();
  });

  btnLockBg.addEventListener("click", () => {
    state.bgEditMode = !state.bgEditMode;
    updateBgLockIcon();
    canvas.style.cursor = state.bgEditMode ? "move" : "crosshair";
  });

  bgOpacityInput.addEventListener("input", (e) => {
    state.bgOpacity = parseFloat(e.target.value);
    draw();
    scheduleSave();
  });

  btnMeasure.addEventListener("click", () => {
    state.isMeasuringMode = !state.isMeasuringMode;
    if (state.isMeasuringMode) {
      btnMeasure.style.backgroundColor = "var(--accent)";
      btnMeasure.style.color = "#fff";
      canvas.style.cursor = "crosshair";
      state.bgEditMode = false;
      updateBgLockIcon();
    } else {
      btnMeasure.style.backgroundColor = "";
      btnMeasure.style.color = "";
      canvas.style.cursor = "crosshair";
      state.measureStart = null;
      state.measureCurrent = null;
    }
    draw();
  });

  btnExport.addEventListener("click", exportDesign);

  btnRenderOpen.addEventListener("click", () => {
    renderModal.classList.remove("hidden");
  });

  btnRenderClose.addEventListener("click", () => {
    renderModal.classList.add("hidden");
  });

  btnRenderExecute.addEventListener("click", executeRender);

  // Close modal on outside click
  renderModal.addEventListener("click", (e) => {
    if (e.target === renderModal) {
      renderModal.classList.add("hidden");
    }
  });

  // Toggle DPI visibility based on format
  document.querySelectorAll('input[name="render-format"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const dpiContainer = document.getElementById("dpi-container");
      if (e.target.value === "png") {
        dpiContainer.style.display = "block";
      } else {
        dpiContainer.style.display = "none";
      }
    });
  });

  btnImport.addEventListener("click", () => {
    importUpload.click();
  });

  importUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        loadStateFromData(data);
      } catch (err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  btnDeleteString.addEventListener("click", deleteSelectedString);

  // Multi-selection UI
  document
    .getElementById("btn-distribute-x")
    .addEventListener("click", () => distributeSelection("x"));
  document
    .getElementById("btn-distribute-y")
    .addEventListener("click", () => distributeSelection("y"));

  strNoteName.addEventListener("change", (e) => {
    const note = e.target.value + strNoteOctave.value;
    updateSelectedString("note", note);
  });

  strNoteOctave.addEventListener("change", (e) => {
    const note = strNoteName.value + e.target.value;
    updateSelectedString("note", note);
  });

  strMaterial.addEventListener("change", (e) =>
    updateSelectedString("material", e.target.value),
  );
  strDiameter.addEventListener("input", (e) =>
    updateSelectedString("diameter", parseFloat(e.target.value)),
  );

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("dblclick", handleDoubleClick);
  window.addEventListener("keydown", handleKeyDown);

  // Add an initial string
  if (state.strings.length === 0) addString();

  updateScaleIndicator();
  draw();
}

function resizeCanvas() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  draw();
}

let saveTimeout;
function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 1000);
}

function saveState() {
  const data = {
    pxPerCm: state.pxPerCm,
    viewZoom: state.viewZoom,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    bgScale: state.bgScale,
    bgOpacity: state.bgOpacity,
    bgX: state.bgX,
    bgY: state.bgY,
    strings: state.strings,
    bgImageBase64: state.bgImageBase64,
  };
  localStorage.setItem("instrumentMakerState", JSON.stringify(data));
}

function loadStateFromData(data) {
  state.pxPerCm = data.pxPerCm || 10;
  state.viewZoom = data.viewZoom || 1;
  state.offsetX = data.offsetX || 0;
  state.offsetY = data.offsetY || 0;
  state.bgScale = data.bgScale || 1;
  state.bgOpacity = data.bgOpacity !== undefined ? data.bgOpacity : 0.5;
  state.bgX = data.bgX || 0;
  state.bgY = data.bgY || 0;
  state.strings = data.strings || [];
  state.bgImageBase64 = data.bgImageBase64 || null;

  viewZoomInput.value = state.viewZoom;
  bgOpacityInput.value = state.bgOpacity;

  if (state.bgImageBase64) {
    const img = new Image();
    img.onload = () => {
      state.bgImage = img;
      bgControlsPanel.classList.add("visible");
      draw();
    };
    img.src = state.bgImageBase64;
  } else {
    state.bgImage = null;
    bgControlsPanel.classList.remove("visible");
  }

  updateScaleIndicator();
  updateSidebar();
  updateBgLockIcon();
  draw();
  scheduleSave();
}

function loadState() {
  const saved = localStorage.getItem("instrumentMakerState");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      loadStateFromData(data);
    } catch (e) {
      console.error("Failed to load state", e);
    }
  }
}

function handleBgUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.bgImage = img;

    // Convert to base64 for saving
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    state.bgImageBase64 = c.toDataURL("image/png");

    // Center the image
    state.bgX = (canvas.width - img.width) / 2 - state.offsetX;
    state.bgY = (canvas.height - img.height) / 2 - state.offsetY;

    bgControlsPanel.classList.add("visible");
    state.bgEditMode = true;
    updateBgLockIcon();
    canvas.style.cursor = "move";

    draw();
    scheduleSave();
  };
  img.src = url;
}

function select(type, id, shiftKey) {
  if (shiftKey) {
    if (state.selection.type === type) {
      if (!state.selection.ids.includes(id)) {
        state.selection.ids.push(id);
      } else {
        state.selection.ids = state.selection.ids.filter((i) => i !== id);
        if (state.selection.ids.length === 0) state.selection.type = null;
      }
    } else {
      state.selection.type = type;
      state.selection.ids = [id];
    }
  } else {
    state.selection.type = type;
    state.selection.ids = [id];
  }
}

function addString(x, y) {
  const id = Date.now().toString();
  // Place at specific position or center
  const cx =
    x !== undefined ? x : (canvas.width / 2 - state.offsetX) / state.viewZoom;
  const cy =
    y !== undefined ? y : (canvas.height / 2 - state.offsetY) / state.viewZoom;

  state.strings.push({
    id,
    p1: { x: cx, y: cy - 100 },
    p2: { x: cx, y: cy + 100 },
    bridgeDist: 150,
    note: "A4",
    material: "nylon",
    diameter: 0.8, // mm
  });

  select("string", id, false);
  updateSidebar();
  draw();
  scheduleSave();
}

function handleDoubleClick(e) {
  if (state.bgEditMode || state.isMeasuringMode) return;

  const pos = getMousePos(e);
  const worldPos = screenToWorld(pos.x, pos.y);

  // Check if we clicked on existing item (to avoid creating string on top of another)
  const HIT_RADIUS = 8 / state.viewZoom;
  for (const str of state.strings) {
    if (Math.hypot(str.p1.x - worldPos.x, str.p1.y - worldPos.y) < HIT_RADIUS)
      return;
    if (Math.hypot(str.p2.x - worldPos.x, str.p2.y - worldPos.y) < HIT_RADIUS)
      return;
    if (distToSegment(worldPos, str.p1, str.p2) < 5 / state.viewZoom) return;
  }

  addString(worldPos.x, worldPos.y);
}

function handleKeyDown(e) {
  if (e.key === "Delete" || e.key === "Backspace") {
    // Only delete if we are not editing an input field
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "SELECT" ||
      e.target.tagName === "TEXTAREA"
    )
      return;

    deleteSelectedString();
  }
}

function deleteSelectedString() {
  if (state.selection.ids.length === 0) return;
  state.strings = state.strings.filter(
    (s) => !state.selection.ids.includes(s.id),
  );
  state.selection = { type: null, ids: [] };
  updateSidebar();
  draw();
  scheduleSave();
}

function updateSelectedString(key, value) {
  if (state.selection.ids.length !== 1) return;
  const str = state.strings.find((s) => s.id === state.selection.ids[0]);
  if (str) {
    str[key] = value;
    updateSidebar();
    draw();
    scheduleSave();
  }
}

function getStringMetrics(str) {
  const dx = str.p2.x - str.p1.x;
  const dy = str.p2.y - str.p1.y;
  const totalLengthPx = Math.sqrt(dx * dx + dy * dy);
  const lengthPx = Math.min(str.bridgeDist || 150, totalLengthPx);
  const lengthCm = lengthPx / state.pxPerCm;
  const lengthM = lengthCm / 100;

  const freq = getFrequency(str.note);
  const mat = MATERIALS[str.material];
  const dM = (str.diameter || 0.1) / 1000;

  let tensionN = 0;
  let stressPa = 0;
  let stressPct = 0;

  if (freq && mat && lengthM > 0) {
    // mu = rho * pi * r^2
    const r = dM / 2;
    const area = Math.PI * r * r;
    const mu = mat.density * area;

    // T = mu * (2 * L * f)^2
    tensionN = mu * Math.pow(2 * lengthM * freq, 2);

    // stress = T / Area
    stressPa = tensionN / area;
    stressPct = (stressPa / mat.strength) * 100;
  }

  return { lengthCm, lengthM, freq, tensionN, stressPa, stressPct, mat };
}

function updateSidebar() {
  if (state.selection.ids.length === 1) {
    propertiesCard.classList.remove("hidden");
    stringEditor.classList.remove("hidden");
    multiSelectionUi.classList.add("hidden");

    const str = state.strings.find((s) => s.id === state.selection.ids[0]);
    if (!str) return;

    if (
      document.activeElement !== strNoteName &&
      document.activeElement !== strNoteOctave
    ) {
      const match = str.note.match(NOTE_REGEX);
      if (match) {
        strNoteName.value = match[1].toUpperCase() + (match[2] || "");
        strNoteOctave.value = match[3];
      }
    }
    if (document.activeElement !== strMaterial)
      strMaterial.value = str.material;
    if (document.activeElement !== strDiameter)
      strDiameter.value = str.diameter;

    const metrics = getStringMetrics(str);

    outLength.textContent = metrics.lengthCm.toFixed(1) + " cm";
    outFreq.textContent = metrics.freq
      ? metrics.freq.toFixed(1) + " Hz"
      : "Invalid Note";

    const tensionKg = metrics.tensionN / 9.81;
    outTension.textContent = tensionKg.toFixed(2) + " kg";

    // Tension Color Coding (Structural limits for light instruments like lyres/harps)
    outTension.className = "metric-value badge ";
    if (tensionKg > 25 || tensionKg < 0.5) {
      outTension.classList.add("danger"); // Too tight (breaks instrument) or too loose (unplayable)
    } else if (tensionKg > 15 || tensionKg < 1.5) {
      outTension.classList.add("warning"); // Getting heavy or a bit floppy
    } else {
      outTension.classList.add("success"); // Ideal range
    }

    outStress.textContent = metrics.stressPct.toFixed(1) + "%";

    // Stress Color Coding (Material limits for the string itself)
    outStress.className = "metric-value badge ";
    if (metrics.stressPct > 90) {
      outStress.classList.add("danger");
    } else if (metrics.stressPct > 70) {
      outStress.classList.add("warning");
    } else if (metrics.stressPct < 5) {
      outStress.classList.add("danger");
    } else if (metrics.stressPct < 15) {
      outStress.classList.add("warning");
    } else {
      outStress.classList.add("success");
    }
  } else if (state.selection.ids.length > 1) {
    propertiesCard.classList.remove("hidden");
    stringEditor.classList.add("hidden");
    multiSelectionUi.classList.remove("hidden");

    const typeName =
      state.selection.type === "p1"
        ? "tuning pins"
        : state.selection.type === "p2"
          ? "eyelets"
          : state.selection.type === "bridge"
            ? "bridges"
            : "strings";
    document.getElementById("multi-selection-info").textContent =
      `${state.selection.ids.length} ${typeName} selected`;
  } else {
    propertiesCard.classList.add("hidden");
    stringEditor.classList.add("hidden");
    multiSelectionUi.classList.add("hidden");
  }
}

// Canvas Interaction
function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function screenToWorld(x, y) {
  return {
    x: (x - state.offsetX) / state.viewZoom,
    y: (y - state.offsetY) / state.viewZoom,
  };
}

function handleMouseDown(e) {
  e.preventDefault(); // Prevent text selection
  const pos = getMousePos(e);
  const worldPos = screenToWorld(pos.x, pos.y);

  document.body.classList.add("is-dragging"); // Prevent text selection during drag

  if (state.isMeasuringMode && e.button === 0) {
    state.measureStart = worldPos;
    state.measureCurrent = worldPos;
    return;
  }

  if (state.bgEditMode && e.button === 0) {
    state.isDraggingBg = true;
    state.lastMouseX = pos.x;
    state.lastMouseY = pos.y;
    return;
  }

  if (e.button === 1 || e.button === 2) {
    state.isPanning = true;
    state.lastMouseX = pos.x;
    state.lastMouseY = pos.y;
    canvas.style.cursor = "grabbing";
    return;
  }

  // Check points
  const HIT_RADIUS = 8 / state.viewZoom;
  for (let i = state.strings.length - 1; i >= 0; i--) {
    const str = state.strings[i];

    // Check bridge
    const totalDist = Math.hypot(str.p2.x - str.p1.x, str.p2.y - str.p1.y);
    const ratio =
      totalDist === 0
        ? 0
        : Math.min(str.bridgeDist || 150, totalDist) / totalDist;
    const bx = str.p1.x + (str.p2.x - str.p1.x) * ratio;
    const by = str.p1.y + (str.p2.y - str.p1.y) * ratio;

    if (Math.hypot(bx - worldPos.x, by - worldPos.y) < HIT_RADIUS) {
      state.draggingPoint = { stringId: str.id, point: "bridge" };
      state.isDraggingSelection = false;
      if (
        !state.selection.ids.includes(str.id) ||
        state.selection.type !== "bridge" ||
        e.shiftKey
      ) {
        select("bridge", str.id, e.shiftKey);
      }
      updateSidebar();
      draw();
      return;
    }

    if (Math.hypot(str.p1.x - worldPos.x, str.p1.y - worldPos.y) < HIT_RADIUS) {
      state.draggingPoint = { stringId: str.id, point: "p1" };
      state.isDraggingSelection = false;
      if (
        !state.selection.ids.includes(str.id) ||
        state.selection.type !== "p1" ||
        e.shiftKey
      ) {
        select("p1", str.id, e.shiftKey);
      }
      updateSidebar();
      draw();
      return;
    }
    if (Math.hypot(str.p2.x - worldPos.x, str.p2.y - worldPos.y) < HIT_RADIUS) {
      state.draggingPoint = { stringId: str.id, point: "p2" };
      state.isDraggingSelection = false;
      if (
        !state.selection.ids.includes(str.id) ||
        state.selection.type !== "p2" ||
        e.shiftKey
      ) {
        select("p2", str.id, e.shiftKey);
      }
      updateSidebar();
      draw();
      return;
    }
  }

  // Check lines
  for (let i = state.strings.length - 1; i >= 0; i--) {
    const str = state.strings[i];
    const dist = distToSegment(worldPos, str.p1, str.p2);
    if (dist < 5 / state.viewZoom) {
      state.draggingPoint = { stringId: str.id, point: "body" };
      state.isDraggingSelection = false;
      if (
        !state.selection.ids.includes(str.id) ||
        state.selection.type !== "string" ||
        e.shiftKey
      ) {
        select("string", str.id, e.shiftKey);
      }
      state.lastMouseX = pos.x;
      state.lastMouseY = pos.y;
      updateSidebar();
      draw();
      return;
    }
  }

  if (!e.shiftKey) {
    state.selection = { type: null, ids: [] };
    updateSidebar();
  }

  if (e.button === 0 && !state.bgEditMode) {
    state.isSelecting = true;
    state.selectionBox.startX = worldPos.x;
    state.selectionBox.startY = worldPos.y;
    state.selectionBox.endX = worldPos.x;
    state.selectionBox.endY = worldPos.y;
  }

  draw();
}

function distributeSelection(axis) {
  if (state.selection.ids.length < 2) return;

  const spacingMm = parseFloat(
    document.getElementById(`distribute-spacing-${axis}`).value,
  );
  if (isNaN(spacingMm)) return;

  const dir = document.querySelector(`input[name="dir-${axis}"]:checked`).value;
  const spacingPx = (spacingMm / 10) * state.pxPerCm;
  const type = state.selection.type;

  // Get objects to sort
  const items = state.selection.ids.map((id) => {
    const str = state.strings.find((s) => s.id === id);
    let val;
    if (type === "p1") val = str.p1[axis];
    else if (type === "p2") val = str.p2[axis];
    else if (type === "string" || type === "bridge") val = str.p1[axis]; // sort by p1 for strings and bridges
    return { str, val };
  });

  items.sort((a, b) => a.val - b.val);

  const totalWidth = (items.length - 1) * spacingPx;
  let startVal;

  if (dir === "left" || dir === "top") {
    startVal = items[0].val;
  } else if (dir === "right" || dir === "bottom") {
    startVal = items[items.length - 1].val - totalWidth;
  } else if (dir === "center") {
    const centerVal = (items[0].val + items[items.length - 1].val) / 2;
    startVal = centerVal - totalWidth / 2;
  }

  items.forEach((item, index) => {
    const newVal = startVal + index * spacingPx;
    const diff = newVal - item.val;

    if (type === "p1") {
      item.str.p1[axis] += diff;
    } else if (type === "p2") {
      item.str.p2[axis] += diff;
    } else if (type === "string") {
      item.str.p1[axis] += diff;
      item.str.p2[axis] += diff;
    } else if (type === "bridge") {
      item.str.p1[axis] += diff;
      item.str.p2[axis] += diff;
    }
  });

  draw();
}

function handleMouseMove(e) {
  const pos = getMousePos(e);
  const worldPos = screenToWorld(pos.x, pos.y);

  if (state.isDraggingBg) {
    state.bgX += pos.x - state.lastMouseX;
    state.bgY += pos.y - state.lastMouseY;
    state.lastMouseX = pos.x;
    state.lastMouseY = pos.y;
    draw();
    return;
  }

  if (state.isMeasuringMode && state.measureStart) {
    state.measureCurrent = worldPos;
    draw();
    return;
  }

  if (state.isPanning) {
    state.offsetX += pos.x - state.lastMouseX;
    state.offsetY += pos.y - state.lastMouseY;
    state.lastMouseX = pos.x;
    state.lastMouseY = pos.y;
    draw();
    return;
  }

  if (state.isSelecting) {
    state.selectionBox.endX = worldPos.x;
    state.selectionBox.endY = worldPos.y;

    const minX = Math.min(state.selectionBox.startX, state.selectionBox.endX);
    const maxX = Math.max(state.selectionBox.startX, state.selectionBox.endX);
    const minY = Math.min(state.selectionBox.startY, state.selectionBox.endY);
    const maxY = Math.max(state.selectionBox.startY, state.selectionBox.endY);

    let p1s = [];
    let p2s = [];
    let strings = [];

    state.strings.forEach((str) => {
      const p1InBox =
        str.p1.x >= minX &&
        str.p1.x <= maxX &&
        str.p1.y >= minY &&
        str.p1.y <= maxY;
      const p2InBox =
        str.p2.x >= minX &&
        str.p2.x <= maxX &&
        str.p2.y >= minY &&
        str.p2.y <= maxY;

      if (p1InBox && p2InBox) {
        strings.push(str.id);
      } else {
        if (p1InBox) p1s.push(str.id);
        if (p2InBox) p2s.push(str.id);
      }
    });

    if (strings.length > 0) {
      state.selection = { type: "string", ids: strings };
    } else if (p1s.length > 0) {
      state.selection = { type: "p1", ids: p1s };
    } else if (p2s.length > 0) {
      state.selection = { type: "p2", ids: p2s };
    } else {
      state.selection = { type: null, ids: [] };
    }

    updateSidebar();
    draw();
    return;
  }

  if (state.draggingPoint) {
    state.isDraggingSelection = true;
    const str = state.strings.find(
      (s) => s.id === state.draggingPoint.stringId,
    );
    if (str) {
      const worldPos = screenToWorld(pos.x, pos.y);
      if (state.draggingPoint.point === "bridge") {
        const v = str.p1;
        const w = str.p2;
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 !== 0) {
          let t =
            ((worldPos.x - v.x) * (w.x - v.x) +
              (worldPos.y - v.y) * (w.y - v.y)) /
            l2;
          t = Math.max(0, Math.min(1, t));
          str.bridgeDist = t * Math.sqrt(l2);
        }
      } else if (state.draggingPoint.point === "body") {
        const dx = (pos.x - state.lastMouseX) / state.viewZoom;
        const dy = (pos.y - state.lastMouseY) / state.viewZoom;

        // Move all selected strings
        if (
          state.selection.type === "string" &&
          state.selection.ids.includes(str.id)
        ) {
          state.selection.ids.forEach((id) => {
            const s = state.strings.find((string) => string.id === id);
            if (s) {
              s.p1.x += dx;
              s.p1.y += dy;
              s.p2.x += dx;
              s.p2.y += dy;
            }
          });
        } else {
          str.p1.x += dx;
          str.p1.y += dy;
          str.p2.x += dx;
          str.p2.y += dy;
        }

        state.lastMouseX = pos.x;
        state.lastMouseY = pos.y;
      } else {
        let newPos = worldPos;
        if (
          !e.ctrlKey &&
          (state.draggingPoint.point === "p1" ||
            state.draggingPoint.point === "p2")
        ) {
          const type = state.draggingPoint.point;
          const fixedPoint = type === "p1" ? str.p2 : str.p1;
          const dx = worldPos.x - fixedPoint.x;
          const dy = worldPos.y - fixedPoint.y;
          const angle = Math.atan2(dy, dx);
          const dist = Math.hypot(dx, dy);
          const snappedAngle =
            Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
          newPos = {
            x: fixedPoint.x + Math.cos(snappedAngle) * dist,
            y: fixedPoint.y + Math.sin(snappedAngle) * dist,
          };
        }

        // Move all selected points
        if (
          (state.selection.type === "p1" || state.selection.type === "p2") &&
          state.selection.ids.includes(str.id)
        ) {
          const dx = newPos.x - str[state.draggingPoint.point].x;
          const dy = newPos.y - str[state.draggingPoint.point].y;

          state.selection.ids.forEach((id) => {
            const s = state.strings.find((string) => string.id === id);
            if (s) {
              s[state.draggingPoint.point].x += dx;
              s[state.draggingPoint.point].y += dy;
            }
          });
        } else {
          str[state.draggingPoint.point] = newPos;
        }
      }

      // Calculate closest distances
      state.closestDistances = [];
      const type = state.draggingPoint.point;

      if (type === "p1" || type === "p2") {
        let closestStr = null;
        let minDist = Infinity;
        state.strings.forEach((s) => {
          if (s.id === str.id) return;
          const dist = Math.hypot(
            s[type].x - str[type].x,
            s[type].y - str[type].y,
          );
          if (dist < minDist) {
            minDist = dist;
            closestStr = s;
          }
        });
        if (closestStr) {
          state.closestDistances.push({
            pA: str[type],
            pB: closestStr[type],
            distPx: minDist,
          });
        }
      } else if (type === "body") {
        let closestP1 = null,
          minDistP1 = Infinity;
        let closestP2 = null,
          minDistP2 = Infinity;
        state.strings.forEach((s) => {
          if (s.id === str.id) return;
          const d1 = Math.hypot(s.p1.x - str.p1.x, s.p1.y - str.p1.y);
          if (d1 < minDistP1) {
            minDistP1 = d1;
            closestP1 = s;
          }

          const d2 = Math.hypot(s.p2.x - str.p2.x, s.p2.y - str.p2.y);
          if (d2 < minDistP2) {
            minDistP2 = d2;
            closestP2 = s;
          }
        });

        if (closestP1) {
          state.closestDistances.push({
            pA: str.p1,
            pB: closestP1.p1,
            distPx: minDistP1,
          });
        }
        if (closestP2) {
          state.closestDistances.push({
            pA: str.p2,
            pB: closestP2.p2,
            distPx: minDistP2,
          });
        }
      }

      updateSidebar();
      draw();
    }
  }
}

function handleMouseUp(e) {
  document.body.classList.remove("is-dragging");

  if (state.draggingPoint && !state.isDraggingSelection && !e.shiftKey) {
    // If we just clicked without dragging, select only this item
    const type =
      state.draggingPoint.point === "body"
        ? "string"
        : state.draggingPoint.point;
    select(type, state.draggingPoint.stringId, false);
    updateSidebar();
  }

  state.isPanning = false;
  state.isDraggingBg = false;
  state.draggingPoint = null;
  state.isSelecting = false;
  state.closestDistances = [];
  canvas.style.cursor = state.isMeasuringMode
    ? "crosshair"
    : state.bgEditMode
      ? "move"
      : "crosshair";
  draw();
  scheduleSave();
}

function handleWheel(e) {
  e.preventDefault();
  const pos = getMousePos(e);

  if (state.bgEditMode) {
    const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;

    // Zoom around mouse position for better UX
    const mouseX = pos.x - state.offsetX;
    const mouseY = pos.y - state.offsetY;

    const bgRelX = mouseX - state.bgX;
    const bgRelY = mouseY - state.bgY;

    state.bgScale *= zoomFactor;

    state.bgX = mouseX - bgRelX * zoomFactor;
    state.bgY = mouseY - bgRelY * zoomFactor;

    draw();
    return;
  }

  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const mouseX = pos.x;
  const mouseY = pos.y;
  const worldX = (mouseX - state.offsetX) / state.viewZoom;
  const worldY = (mouseY - state.offsetY) / state.viewZoom;

  state.viewZoom = Math.max(0.1, Math.min(10, state.viewZoom * zoomFactor));
  viewZoomInput.value = state.viewZoom;

  state.offsetX = mouseX - worldX * state.viewZoom;
  state.offsetY = mouseY - worldY * state.viewZoom;

  updateScaleIndicator();
  draw();
}

// Math helpers
function distToSegment(p, v, w) {
  const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(
    p.x - (v.x + t * (w.x - v.x)),
    p.y - (v.y + t * (w.y - v.y)),
  );
}

// Drawing
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(state.offsetX, state.offsetY);
  ctx.scale(state.viewZoom, state.viewZoom);

  // Draw Grid
  drawGrid();

  // Draw Background
  if (state.bgImage) {
    ctx.globalAlpha = state.bgOpacity;
    const w = state.bgImage.width * state.bgScale;
    const h = state.bgImage.height * state.bgScale;
    ctx.drawImage(state.bgImage, state.bgX, state.bgY, w, h);
    ctx.globalAlpha = 1.0;

    // Draw bounding box if in edit mode
    if (state.bgEditMode) {
      ctx.strokeStyle = "#8c5a35";
      ctx.lineWidth = 2 / state.viewZoom;
      ctx.setLineDash([5 / state.viewZoom, 5 / state.viewZoom]);
      ctx.strokeRect(state.bgX, state.bgY, w, h);
      ctx.setLineDash([]);
    }
  }

  // Draw Strings
  state.strings.forEach((str) => {
    const isSelected = state.selection.ids.includes(str.id);
    const metrics = getStringMetrics(str);

    const totalDist = Math.hypot(str.p2.x - str.p1.x, str.p2.y - str.p1.y);
    const ratio =
      totalDist === 0
        ? 0
        : Math.min(str.bridgeDist || 150, totalDist) / totalDist;
    const bx = str.p1.x + (str.p2.x - str.p1.x) * ratio;
    const by = str.p1.y + (str.p2.y - str.p1.y) * ratio;

    const tensionKg = metrics.tensionN / 9.81;

    // Determine stress color
    let stressColor = "#529e36"; // success (green)
    if (metrics.stressPct > 90 || metrics.stressPct < 5)
      stressColor = "#d93829"; // danger (red)
    else if (metrics.stressPct > 70 || metrics.stressPct < 15)
      stressColor = "#e88d14"; // warning (orange)

    // Determine tension color
    let tensionColor = "#529e36"; // success (green)
    if (tensionKg > 25 || tensionKg < 0.5)
      tensionColor = "#d93829"; // danger (red)
    else if (tensionKg > 15 || tensionKg < 1.5) tensionColor = "#e88d14"; // warning (orange)

    const pr = 5 / state.viewZoom;

    // Draw selection highlight underneath everything
    if (isSelected) {
      ctx.strokeStyle = "#3d3125"; // thin dark outline
      ctx.lineWidth = 4 / state.viewZoom;
      const hr = 6 / state.viewZoom; // highlight radius
      ctx.fillStyle = "#3d3125";

      if (
        state.selection.type === "string" ||
        state.selection.type === "bridge"
      ) {
        // Highlight lines
        ctx.beginPath();
        ctx.moveTo(str.p1.x, str.p1.y);
        ctx.lineTo(bx, by);
        ctx.lineTo(str.p2.x, str.p2.y);
        ctx.stroke();

        // Highlight points
        ctx.beginPath();
        ctx.arc(str.p1.x, str.p1.y, hr, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(str.p2.x, str.p2.y, hr, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, hr * 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (state.selection.type === "p1") {
        ctx.beginPath();
        ctx.arc(str.p1.x, str.p1.y, hr, 0, Math.PI * 2);
        ctx.fill();
      } else if (state.selection.type === "p2") {
        ctx.beginPath();
        ctx.arc(str.p2.x, str.p2.y, hr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Non-vibrating part (Bridge to Eyelet p2)
    ctx.strokeStyle = "rgba(61, 49, 37, 0.3)";
    ctx.lineWidth = 2 / state.viewZoom;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(str.p2.x, str.p2.y);
    ctx.stroke();

    // Vibrating part (Tuning Pin p1 to Bridge)
    ctx.strokeStyle = stressColor;
    ctx.lineWidth = 2 / state.viewZoom;
    ctx.beginPath();
    ctx.moveTo(str.p1.x, str.p1.y);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Eyelet (p2)
    ctx.fillStyle = "#a39171";
    ctx.beginPath();
    ctx.arc(str.p2.x, str.p2.y, pr, 0, Math.PI * 2);
    ctx.fill();

    // Tuning Pin (p1) - Colored by Tension
    ctx.fillStyle = tensionColor;
    ctx.beginPath();
    ctx.arc(str.p1.x, str.p1.y, pr, 0, Math.PI * 2);
    ctx.fill();

    // Bridge
    ctx.fillStyle = "#5c4033";
    ctx.strokeStyle = "#d4c5b0";
    ctx.lineWidth = 1.5 / state.viewZoom;
    ctx.beginPath();
    ctx.arc(bx, by, pr * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Draw temporary distance segments
  if (state.closestDistances && state.closestDistances.length > 0) {
    ctx.strokeStyle = "#d93829"; // dark red
    ctx.fillStyle = "#d93829";
    ctx.lineWidth = 1.5 / state.viewZoom;
    ctx.setLineDash([4 / state.viewZoom, 4 / state.viewZoom]);
    ctx.font = `${12 / state.viewZoom}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    state.closestDistances.forEach((cd) => {
      ctx.beginPath();
      ctx.moveTo(cd.pA.x, cd.pA.y);
      ctx.lineTo(cd.pB.x, cd.pB.y);
      ctx.stroke();

      const mx = (cd.pA.x + cd.pB.x) / 2;
      const my = (cd.pA.y + cd.pB.y) / 2;
      const distMm = (cd.distPx / state.pxPerCm) * 10;

      ctx.fillText(`${distMm.toFixed(1)} mm`, mx, my - 4 / state.viewZoom);
    });
    ctx.setLineDash([]);
  }

  if (state.isSelecting) {
    ctx.fillStyle = "rgba(140, 90, 53, 0.2)";
    ctx.strokeStyle = "#8c5a35";
    ctx.lineWidth = 1 / state.viewZoom;
    const x = Math.min(state.selectionBox.startX, state.selectionBox.endX);
    const y = Math.min(state.selectionBox.startY, state.selectionBox.endY);
    const w = Math.abs(state.selectionBox.startX - state.selectionBox.endX);
    const h = Math.abs(state.selectionBox.startY - state.selectionBox.endY);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  // Draw measure line
  if (state.isMeasuringMode && state.measureStart && state.measureCurrent) {
    ctx.strokeStyle = "#d93829";
    ctx.lineWidth = 2 / state.viewZoom;
    ctx.beginPath();
    ctx.moveTo(state.measureStart.x, state.measureStart.y);
    ctx.lineTo(state.measureCurrent.x, state.measureCurrent.y);
    ctx.stroke();

    const distPx = Math.hypot(
      state.measureCurrent.x - state.measureStart.x,
      state.measureCurrent.y - state.measureStart.y,
    );
    const distMm = (distPx / state.pxPerCm) * 10;

    const mx = (state.measureStart.x + state.measureCurrent.x) / 2;
    const my = (state.measureStart.y + state.measureCurrent.y) / 2;

    ctx.fillStyle = "rgba(244, 240, 230, 0.9)";
    ctx.font = `${14 / state.viewZoom}px Inter, sans-serif`;
    const text = `${distMm.toFixed(1)} mm`;
    const textWidth = ctx.measureText(text).width;

    ctx.fillRect(
      mx - textWidth / 2 - 4 / state.viewZoom,
      my - 16 / state.viewZoom,
      textWidth + 8 / state.viewZoom,
      20 / state.viewZoom,
    );

    ctx.fillStyle = "#d93829";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, mx, my - 6 / state.viewZoom);
  }

  ctx.restore();

  state.strings.forEach((str) => {
    const totalDist = Math.hypot(str.p2.x - str.p1.x, str.p2.y - str.p1.y);
    const ratio =
      totalDist === 0
        ? 0
        : Math.min(str.bridgeDist || 150, totalDist) / totalDist;
    const bx = str.p1.x + (str.p2.x - str.p1.x) * ratio;
    const by = str.p1.y + (str.p2.y - str.p1.y) * ratio;

    const mx = (str.p1.x + bx) / 2;
    const my = (str.p1.y + by) / 2;

    const screenX = mx * state.viewZoom + state.offsetX;
    const screenY = my * state.viewZoom + state.offsetY;

    ctx.font = '12px "Inter", sans-serif';
    const textWidth = ctx.measureText(str.note).width;

    ctx.fillStyle = "rgba(244, 240, 230, 0.8)";
    ctx.fillRect(screenX + 8, screenY - 10, textWidth + 8, 16);

    ctx.fillStyle = "#3d3125";
    ctx.fillText(str.note, screenX + 12, screenY + 2);
  });
}

function updateScaleIndicator() {
  const ruler = document.getElementById("scale-ruler");
  if (ruler) {
    // 10 cm = state.pxPerCm * 10 pixels * state.viewZoom
    const width = state.pxPerCm * 10 * state.viewZoom;
    ruler.style.width = `${width}px`;

    if (scaleTooltip) {
      scaleTooltip.style.left = `${width}px`;
    }

    if (scaleValueInput && document.activeElement !== scaleValueInput) {
      scaleValueInput.value = state.pxPerCm.toFixed(1);
    }
  }
}

function drawGrid() {
  const step = state.pxPerCm;
  if (step * state.viewZoom < 5) return; // Too dense

  const left = -state.offsetX / state.viewZoom;
  const top = -state.offsetY / state.viewZoom;
  const right = left + canvas.width / state.viewZoom;
  const bottom = top + canvas.height / state.viewZoom;

  ctx.strokeStyle = "rgba(61, 49, 37, 0.05)";
  ctx.lineWidth = 1 / state.viewZoom;

  ctx.beginPath();
  for (let x = Math.floor(left / step) * step; x < right; x += step) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = Math.floor(top / step) * step; y < bottom; y += step) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();

  // Draw axes
  ctx.strokeStyle = "rgba(61, 49, 37, 0.15)";
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(0, bottom);
  ctx.moveTo(left, 0);
  ctx.lineTo(right, 0);
  ctx.stroke();
}

function exportDesign() {
  const data = {
    pxPerCm: state.pxPerCm,
    viewZoom: state.viewZoom,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    bgScale: state.bgScale,
    bgOpacity: state.bgOpacity,
    bgX: state.bgX,
    bgY: state.bgY,
    strings: state.strings,
    bgImageBase64: state.bgImageBase64,
  };

  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lyre-design-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function executeRender() {
  const format = document.querySelector(
    'input[name="render-format"]:checked',
  ).value;
  const options = {
    incStrings: document.getElementById("render-inc-strings").checked,
    incPins: document.getElementById("render-inc-pins").checked,
    incEyelets: document.getElementById("render-inc-eyelets").checked,
    incBridges: document.getElementById("render-inc-bridges").checked,
    incLabels: document.getElementById("render-inc-labels").checked,
    incColors: document.getElementById("render-inc-colors").checked,
    incBg: document.getElementById("render-inc-bg").checked,
    incGrid: document.getElementById("render-inc-grid").checked,
    margin: parseInt(document.getElementById("render-margin").value) || 50,
    dpi: parseInt(document.getElementById("render-dpi").value) || 96,
  };

  if (format === "png") {
    renderPNG(options);
  } else {
    const svgString = renderSVG(options);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lyre-render-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  renderModal.classList.add("hidden");
}

function getBoundingBox() {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  if (state.strings.length === 0 && !state.bgImage) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  state.strings.forEach((str) => {
    const totalDist = Math.hypot(str.p2.x - str.p1.x, str.p2.y - str.p1.y);
    const ratio =
      totalDist === 0
        ? 0
        : Math.min(str.bridgeDist || 150, totalDist) / totalDist;
    const bx = str.p1.x + (str.p2.x - str.p1.x) * ratio;
    const by = str.p1.y + (str.p2.y - str.p1.y) * ratio;

    minX = Math.min(minX, str.p1.x, str.p2.x, bx);
    minY = Math.min(minY, str.p1.y, str.p2.y, by);
    maxX = Math.max(maxX, str.p1.x, str.p2.x, bx);
    maxY = Math.max(maxY, str.p1.y, str.p2.y, by);
  });

  if (state.bgImage) {
    const w = state.bgImage.width * state.bgScale;
    const h = state.bgImage.height * state.bgScale;
    minX = Math.min(minX, state.bgX);
    minY = Math.min(minY, state.bgY);
    maxX = Math.max(maxX, state.bgX + w);
    maxY = Math.max(maxY, state.bgY + h);
  }

  // Add a small buffer for point radii
  const buffer = 10;
  return {
    x: minX - buffer,
    y: minY - buffer,
    width: maxX - minX + buffer * 2,
    height: maxY - minY + buffer * 2,
  };
}

function renderPNG(options) {
  const bbox = getBoundingBox();
  const margin = options.margin;
  const dpiScale = options.dpi / 96;
  const canvasWidth = (bbox.width + margin * 2) * dpiScale;
  const canvasHeight = (bbox.height + margin * 2) * dpiScale;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvasWidth;
  tempCanvas.height = canvasHeight;
  const tctx = tempCanvas.getContext("2d");

  const offsetX = (-bbox.x + margin) * dpiScale;
  const offsetY = (-bbox.y + margin) * dpiScale;

  tctx.save();
  tctx.translate(offsetX, offsetY);
  tctx.scale(dpiScale, dpiScale);

  // Draw Grid
  if (options.incGrid) {
    const step = state.pxPerCm;
    const left = bbox.x - margin;
    const top = bbox.y - margin;
    const right = bbox.x + bbox.width + margin;
    const bottom = bbox.y + bbox.height + margin;

    tctx.strokeStyle = "rgba(61, 49, 37, 0.05)";
    tctx.lineWidth = 1;
    tctx.beginPath();
    for (let x = Math.floor(left / step) * step; x < right; x += step) {
      tctx.moveTo(x, top);
      tctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top / step) * step; y < bottom; y += step) {
      tctx.moveTo(left, y);
      tctx.lineTo(right, y);
    }
    tctx.stroke();

    tctx.strokeStyle = "rgba(61, 49, 37, 0.15)";
    tctx.beginPath();
    tctx.moveTo(0, top);
    tctx.lineTo(0, bottom);
    tctx.moveTo(left, 0);
    tctx.lineTo(right, 0);
    tctx.stroke();
  }

  // Draw Background
  if (options.incBg && state.bgImage) {
    tctx.globalAlpha = state.bgOpacity;
    const w = state.bgImage.width * state.bgScale;
    const h = state.bgImage.height * state.bgScale;
    tctx.drawImage(state.bgImage, state.bgX, state.bgY, w, h);
    tctx.globalAlpha = 1.0;
  }

  // Draw Strings
  state.strings.forEach((str) => {
    const metrics = getStringMetrics(str);
    const totalDist = Math.hypot(str.p2.x - str.p1.x, str.p2.y - str.p1.y);
    const ratio =
      totalDist === 0
        ? 0
        : Math.min(str.bridgeDist || 150, totalDist) / totalDist;
    const bx = str.p1.x + (str.p2.x - str.p1.x) * ratio;
    const by = str.p1.y + (str.p2.y - str.p1.y) * ratio;

    const tensionKg = metrics.tensionN / 9.81;
    let stressColor = options.incColors
      ? metrics.stressPct > 90 || metrics.stressPct < 5
        ? "#d93829"
        : metrics.stressPct > 70 || metrics.stressPct < 15
          ? "#e88d14"
          : "#529e36"
      : "#3d3125";
    let tensionColor = options.incColors
      ? tensionKg > 25 || tensionKg < 0.5
        ? "#d93829"
        : tensionKg > 15 || tensionKg < 1.5
          ? "#e88d14"
          : "#529e36"
      : "#3d3125";

    const pr = 5;

    if (options.incStrings) {
      tctx.strokeStyle = "rgba(61, 49, 37, 0.3)";
      tctx.lineWidth = 2;
      tctx.beginPath();
      tctx.moveTo(bx, by);
      tctx.lineTo(str.p2.x, str.p2.y);
      tctx.stroke();

      tctx.strokeStyle = stressColor;
      tctx.lineWidth = 2;
      tctx.beginPath();
      tctx.moveTo(str.p1.x, str.p1.y);
      tctx.lineTo(bx, by);
      tctx.stroke();
    }

    if (options.incEyelets) {
      tctx.fillStyle = "#a39171";
      tctx.beginPath();
      tctx.arc(str.p2.x, str.p2.y, pr, 0, Math.PI * 2);
      tctx.fill();
    }

    if (options.incPins) {
      tctx.fillStyle = tensionColor;
      tctx.beginPath();
      tctx.arc(str.p1.x, str.p1.y, pr, 0, Math.PI * 2);
      tctx.fill();
    }

    if (options.incBridges) {
      tctx.fillStyle = "#5c4033";
      tctx.strokeStyle = "#d4c5b0";
      tctx.lineWidth = 1.5;
      tctx.beginPath();
      tctx.arc(bx, by, pr * 1.2, 0, Math.PI * 2);
      tctx.fill();
      tctx.stroke();
    }

    if (options.incLabels) {
      const mx = (str.p1.x + bx) / 2;
      const my = (str.p1.y + by) / 2;
      tctx.font = '12px "Inter", sans-serif';
      const textWidth = tctx.measureText(str.note).width;
      tctx.fillStyle = "rgba(244, 240, 230, 0.8)";
      tctx.fillRect(mx + 8, my - 10, textWidth + 8, 16);
      tctx.fillStyle = "#3d3125";
      tctx.fillText(str.note, mx + 12, my + 2);
    }
  });

  tctx.restore();

  const url = tempCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `lyre-render-${Date.now()}.png`;
  a.click();
}

function renderSVG(options) {
  const bbox = getBoundingBox();
  const margin = options.margin;
  const width = bbox.width + margin * 2;
  const height = bbox.height + margin * 2;
  const offsetX = -bbox.x + margin;
  const offsetY = -bbox.y + margin;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  // Grid
  if (options.incGrid) {
    const step = state.pxPerCm;
    const left = bbox.x - margin;
    const top = bbox.y - margin;
    const right = bbox.x + bbox.width + margin;
    const bottom = bbox.y + bbox.height + margin;

    let gridPath = "";
    for (let x = Math.floor(left / step) * step; x < right; x += step) {
      gridPath += `M ${x + offsetX} ${top + offsetY} L ${x + offsetX} ${bottom + offsetY} `;
    }
    for (let y = Math.floor(top / step) * step; y < bottom; y += step) {
      gridPath += `M ${left + offsetX} ${y + offsetY} L ${right + offsetX} ${y + offsetY} `;
    }
    svg += `<path d="${gridPath}" stroke="rgb(61, 49, 37)" stroke-opacity="0.05" stroke-width="1" />`;

    svg += `<line x1="${0 + offsetX}" y1="${top + offsetY}" x2="${0 + offsetX}" y2="${bottom + offsetY}" stroke="rgb(61, 49, 37)" stroke-opacity="0.15" stroke-width="1" />`;
    svg += `<line x1="${left + offsetX}" y1="${0 + offsetY}" x2="${right + offsetX}" y2="${0 + offsetY}" stroke="rgb(61, 49, 37)" stroke-opacity="0.15" stroke-width="1" />`;
  }

  // Background Image
  if (options.incBg && state.bgImageBase64) {
    const w = state.bgImage.width * state.bgScale;
    const h = state.bgImage.height * state.bgScale;
    svg += `<image href="${state.bgImageBase64}" x="${state.bgX + offsetX}" y="${state.bgY + offsetY}" width="${w}" height="${h}" opacity="${state.bgOpacity}" />`;
  }

  // Strings
  state.strings.forEach((str) => {
    const metrics = getStringMetrics(str);
    const totalDist = Math.hypot(str.p2.x - str.p1.x, str.p2.y - str.p1.y);
    const ratio =
      totalDist === 0
        ? 0
        : Math.min(str.bridgeDist || 150, totalDist) / totalDist;
    const bx = str.p1.x + (str.p2.x - str.p1.x) * ratio;
    const by = str.p1.y + (str.p2.y - str.p1.y) * ratio;

    const tensionKg = metrics.tensionN / 9.81;
    let stressColor = options.incColors
      ? metrics.stressPct > 90 || metrics.stressPct < 5
        ? "#d93829"
        : metrics.stressPct > 70 || metrics.stressPct < 15
          ? "#e88d14"
          : "#529e36"
      : "#3d3125";
    let tensionColor = options.incColors
      ? tensionKg > 25 || tensionKg < 0.5
        ? "#d93829"
        : tensionKg > 15 || tensionKg < 1.5
          ? "#e88d14"
          : "#529e36"
      : "#3d3125";

    if (options.incStrings) {
      svg += `<line x1="${bx + offsetX}" y1="${by + offsetY}" x2="${str.p2.x + offsetX}" y2="${str.p2.y + offsetY}" stroke="rgb(61, 49, 37)" stroke-opacity="0.3" stroke-width="2" />`;
      svg += `<line x1="${str.p1.x + offsetX}" y1="${str.p1.y + offsetY}" x2="${bx + offsetX}" y2="${by + offsetY}" stroke="${stressColor}" stroke-width="2" />`;
    }

    if (options.incEyelets) {
      svg += `<circle cx="${str.p2.x + offsetX}" cy="${str.p2.y + offsetY}" r="5" fill="#a39171" />`;
    }

    if (options.incPins) {
      svg += `<circle cx="${str.p1.x + offsetX}" cy="${str.p1.y + offsetY}" r="5" fill="${tensionColor}" />`;
    }

    if (options.incBridges) {
      svg += `<circle cx="${bx + offsetX}" cy="${by + offsetY}" r="6" fill="#5c4033" stroke="#d4c5b0" stroke-width="1.5" />`;
    }

    if (options.incLabels) {
      const mx = (str.p1.x + bx) / 2;
      const my = (str.p1.y + by) / 2;
      const textWidth = str.note.length * 7 + 8;
      svg += `<rect x="${mx + offsetX + 8}" y="${my + offsetY - 10}" width="${textWidth}" height="16" fill="rgba(244, 240, 230, 0.8)" />`;
      svg += `<text x="${mx + offsetX + 12}" y="${my + offsetY + 2}" font-family="Inter, sans-serif" font-size="12" fill="#3d3125">${str.note}</text>`;
    }
  });

  svg += `</svg>`;
  return svg;
}

function updateBgLockIcon() {
  const icon = document.getElementById("icon-lock-bg");
  if (state.bgEditMode) {
    // Unlocked icon
    icon.innerHTML =
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>';
    btnLockBg.style.backgroundColor = "var(--accent)";
    btnLockBg.style.color = "#fff";
  } else {
    // Locked icon
    icon.innerHTML =
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>';
    btnLockBg.style.backgroundColor = "";
    btnLockBg.style.color = "";
  }
}

// Prevent context menu on canvas
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

init();
loadState();
