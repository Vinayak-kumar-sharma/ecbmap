/**************** GLOBALS ****************/

let svg = null;     // active svg reference
let currentMarkers = [];
let currentRoutePath = null;

let viewBox = { x: 0, y: 0, w: 1200, h: 800 };
let isPanning = false;
let startPoint = { x: 0, y: 0 };
let startViewBox = { x: 0, y: 0 };

/**************** LOAD MAP ****************/

async function loadMap(file) {
  const res = await fetch(file);
  const text = await res.text();

  document.getElementById("mapContainer").innerHTML = text;

  svg = document.getElementById("svgRoot");

  if (!svg) {
    alert("SVG with id='svgRoot' not found!");
    return;
  }

  setupViewBox();
  hideAllHelpers();
  clearNavigation();
  bindPanZoom();
}

/**************** HELPERS ****************/

function normalize(t) {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**************** HIDE CONNECTORS ****************/

function hideAllHelpers() {
  if (!svg) return;

  // hide connectors
  svg.querySelectorAll('[id^="connector-"]').forEach(el => {
    el.style.display = "none";
  });

  // hide nodes
  svg.querySelectorAll('[id^="node-"]').forEach(el => {
    el.style.display = "none";
  });
}


/**************** CLEAR ****************/

function clearNavigation() {
  if (!svg) return;

  currentMarkers.forEach(m => m.remove());
  currentMarkers = [];

  if (currentRoutePath) {
    currentRoutePath.remove();
    currentRoutePath = null;
  }

  svg.querySelectorAll(".start-room,.end-room,.highlight-room")
    .forEach(r => r.classList.remove("start-room","end-room","highlight-room"));

  hideAllHelpers();
}

/**************** GRAPH ****************/

function buildGraph() {
  if (!svg) return {};

  const graph = {};
  svg.querySelectorAll("[id^='node-']").forEach(n => {
    graph[n.id] = (n.dataset.connect || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  });
  return graph;
}

/**************** BFS ****************/

function findPath(graph, start, end) {
  const queue = [[start]];
  const visited = new Set();

  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];

    if (last === end) return path;
    if (visited.has(last)) continue;

    visited.add(last);
    (graph[last] || []).forEach(n => queue.push([...path, n]));
  }
  return null;
}

/**************** NODE POSITION ****************/

function getNodePoint(nodeId) {
  if (!svg) return null;

  const n = svg.getElementById(nodeId);
  if (!n) return null;

  if (n.tagName === "circle" || n.tagName === "ellipse") {
    return {
      x: parseFloat(n.getAttribute("cx")),
      y: parseFloat(n.getAttribute("cy"))
    };
  }

  const b = n.getBBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/**************** DRAW ROUTE ****************/

function drawRoutePath(nodePath) {
  if (!svg) return;

  const points = nodePath.map(id => getNodePoint(id)).filter(Boolean);
  if (points.length < 2) return;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("class", "route-path");

  svg.appendChild(path);

  const length = path.getTotalLength();
  path.style.strokeDasharray = length;
  path.style.strokeDashoffset = length;
  path.getBoundingClientRect();
  path.style.transition = "stroke-dashoffset 1s ease-out";
  path.style.strokeDashoffset = "0";

  currentRoutePath = path;
}

/**************** ROOMS ****************/

function getRoomByName(name) {
  if (!svg) return null;

  return [...svg.querySelectorAll("g[data-node]")]
    .find(r => normalize(r.id) === normalize(name));
}

/**************** MARKER ****************/

function markRoom(room, color) {
  if (!svg) return;

  const b = room.getBBox();

  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", b.x + b.width / 2);
  c.setAttribute("cy", b.y + b.height / 2);
  c.setAttribute("r", 9);
  c.setAttribute("fill", color);
  c.setAttribute("stroke", "white");
  c.setAttribute("stroke-width", "3");

  svg.appendChild(c);
  currentMarkers.push(c);
}

/**************** NAVIGATE ****************/

function navigate() {
  if (!svg) return alert("Map not loaded");

  clearNavigation();

  const s = document.getElementById("startInput").value.trim();
  const e = document.getElementById("endInput").value.trim();

  if (!s || !e) return alert("Enter start and destination");

  const startRoom = getRoomByName(s);
  const endRoom = getRoomByName(e);

  if (!startRoom || !endRoom) return alert("Room not found");

  const startNode = startRoom.dataset.node;
  const endNode = endRoom.dataset.node;

  if (!startNode || !endNode) return alert("Room not linked to node");

  startRoom.classList.add("start-room");
  endRoom.classList.add("end-room");

  markRoom(startRoom, "#22c55e");
  markRoom(endRoom, "#ef4444");

  const graph = buildGraph();
  const path = findPath(graph, startNode, endNode);

  if (!path) return alert("No path found");

  drawRoutePath(path);

  fitRouteToView(path); // expeiement

  if (window.innerWidth <= 768) {
  toggleSidebar(true);
}

}

/**************** SEARCH ****************/

function searchPlace() {
  if (!svg) return alert("Map not loaded");

  clearNavigation();

  const input = document.getElementById("searchInput").value.trim();
  if (!input) return;

  const room = getRoomByName(input);
  if (!room) return alert("Place not found");

  room.classList.add("highlight-room");
  markRoom(room, "#ef4444");
  
  centerOnRoom(room);


  if (window.innerWidth <= 768) {
  toggleSidebar(true);
}

}

/**************** VIEWBOX ****************/

function setupViewBox() {
  viewBox = { x: 0, y: 0, w: 1200, h: 800 };
  svg.setAttribute("viewBox", "0 0 1200 800");
}

/**************** PAN + ZOOM ****************/

function bindPanZoom() {
  svg.onmousedown = startPan;
  svg.onmousemove = movePan;
  svg.onmouseup = endPan;
  svg.onmouseleave = endPan;

  svg.ontouchstart = startPan;
  svg.ontouchmove = movePan;
  svg.ontouchend = endPan;
}

function getPoint(evt) {
  return evt.touches ? evt.touches[0] : evt;
}

function startPan(e) {
  isPanning = true;
  const p = getPoint(e);
  startPoint = { x: p.clientX, y: p.clientY };
  startViewBox = { x: viewBox.x, y: viewBox.y };
}

function movePan(e) {
  if (!isPanning) return;

  const p = getPoint(e);
  const dx = (startPoint.x - p.clientX) * (viewBox.w / svg.clientWidth);
  const dy = (startPoint.y - p.clientY) * (viewBox.h / svg.clientHeight);

  viewBox.x = startViewBox.x + dx;
  viewBox.y = startViewBox.y + dy;

  svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
}

function endPan() {
  isPanning = false;
}

function zoom(dir) {
  if (!svg) return;

  const factor = dir > 0 ? 0.85 : 1.15;
  viewBox.w *= factor;
  viewBox.h *= factor;

  svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
}

/**************** AUTO LOAD FIRST MAP ****************/

loadMap("College(1).svg");   // change filename if needed



// new

function toggleSidebar(forceClose = false) {
  const sidebar = document.querySelector(".sidebar");

  if (forceClose) {
    sidebar.classList.remove("open");
    return;
  }

  sidebar.classList.toggle("open");
}


function fitRouteToView(nodePath) {
  if (!svg || nodePath.length < 2) return;

  const points = nodePath.map(id => getNodePoint(id)).filter(Boolean);
  if (points.length < 2) return;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  let routeWidth = maxX - minX;
  let routeHeight = maxY - minY;

  // Container dimensions
  const container = document.getElementById("mapContainer");
  const contW = container.clientWidth;
  const contH = container.clientHeight;
  const contRatio = contW / contH;

  // Screen factor adjusts zoom out for smaller screens
  const screenFactor = window.innerWidth < 780 ? 0.8 : 0.45;
  const padding = Math.max(routeWidth, routeHeight) * screenFactor;

  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  routeWidth = maxX - minX;
  routeHeight = maxY - minY;

  // Adjust aspect ratio to container
  const routeRatio = routeWidth / routeHeight;
  if (routeRatio > contRatio) {
    const newH = routeWidth / contRatio;
    const diff = newH - routeHeight;
    minY -= diff / 2;
    routeHeight = newH;
  } else {
    const newW = routeHeight * contRatio;
    const diff = newW - routeWidth;
    minX -= diff / 2;
    routeWidth = newW;
  }

  animateViewBox({
    x: minX,
    y: minY,
    w: routeWidth,
    h: routeHeight
  });
}



function animateViewBox(target) {
  const start = { ...viewBox };
  const duration = 600;
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min((now - startTime) / duration, 1);

    viewBox.x = start.x + (target.x - start.x) * t;
    viewBox.y = start.y + (target.y - start.y) * t;
    viewBox.w = start.w + (target.w - start.w) * t;
    viewBox.h = start.h + (target.h - start.h) * t;

    svg.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
    );

    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}


function centerOnRoom(room) {
  if (!svg || !room) return;

  const p = getNodePoint(room.dataset.node || room.id);
  if (!p) return;

  const container = document.getElementById("mapContainer");
  const contW = container.clientWidth;
  const contH = container.clientHeight;

  // Smaller screens need more zoom-out
  const scaleFactor = window.innerWidth < 780 ? 2 : 1.5;

  const target = {
    x: p.x - contW / 2 / scaleFactor,
    y: p.y - contH / 2 / scaleFactor,
    w: contW / scaleFactor,
    h: contH / scaleFactor
  };

  animateViewBox(target);
}

// let lastTap = 0;

// function handleDoubleTap(e) {
//   const currentTime = new Date().getTime();
//   const tapLength = currentTime - lastTap;

//   if (tapLength < 300 && tapLength > 0) {
//     // Double tap detected
//     zoom(1); // zoom in
//   }

//   lastTap = currentTime;
// }

// // Bind double-tap
// svg.addEventListener("touchend", handleDoubleTap);

// let initialDistance = 0;

// function getDistance(touches) {
//   const dx = touches[0].clientX - touches[1].clientX;
//   const dy = touches[0].clientY - touches[1].clientY;
//   return Math.sqrt(dx*dx + dy*dy);
// }

// // Pinch start
// svg.addEventListener("touchstart", e => {
//   if (e.touches.length === 2) {
//     initialDistance = getDistance(e.touches);
//   }
// });

// // Pinch move
// svg.addEventListener("touchmove", e => {
//   if (e.touches.length === 2 && initialDistance > 0) {
//     const newDistance = getDistance(e.touches);
//     const scale = newDistance / initialDistance;

//     if (scale > 1.05) zoom(1);    // pinch out → zoom in
//     else if (scale < 0.95) zoom(-1); // pinch in → zoom out

//     initialDistance = newDistance; // update for next move
//     e.preventDefault(); // prevent page scroll
//   }
// });

// ----------------------
// Mobile Gesture Variables
// ----------------------
let lastTap = 0;
let initialPinchDistance = 0;

// Helper: distance between two touches
function getDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

// ----------------------
// DOUBLE-TAP TO ZOOM
// ----------------------
function handleDoubleTap(e) {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTap;

  if (tapLength < 300 && tapLength > 0) {
    // Double tap detected → zoom in
    zoom(1);
    e.preventDefault();
  }

  lastTap = currentTime;
}

// ----------------------
// PINCH-TO-ZOOM
// ----------------------
function handleTouchStart(e) {
  if (e.touches.length === 2) {
    initialPinchDistance = getDistance(e.touches);
  } else if (e.touches.length === 1) {
    // Single finger pan
    startPan(e);
  }
}

function handleTouchMove(e) {
  if (e.touches.length === 2 && initialPinchDistance > 0) {
    const newDistance = getDistance(e.touches);
    const scale = newDistance / initialPinchDistance;

    if (scale > 1.05) zoom(1);    // pinch out → zoom in
    else if (scale < 0.95) zoom(-1); // pinch in → zoom out

    initialPinchDistance = newDistance;
    e.preventDefault(); // prevent scrolling
  } else if (e.touches.length === 1) {
    // Single finger pan
    movePan(e);
  }
}

function handleTouchEnd(e) {
  if (e.touches.length < 2) {
    initialPinchDistance = 0;
  }
  isPanning = false;
}

// ----------------------
// BIND TO SVG
// ----------------------
function bindMobileGestures() {
  if (!svg) return;

  svg.addEventListener("touchstart", handleTouchStart, { passive: false });
  svg.addEventListener("touchmove", handleTouchMove, { passive: false });
  svg.addEventListener("touchend", handleTouchEnd, { passive: false });
  svg.addEventListener("touchend", handleDoubleTap);
}

// Call this function **after loading your SVG**
// Example:
bindMobileGestures();
