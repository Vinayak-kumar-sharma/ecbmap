let svg = null;
let currentMarkers = [];
let currentRoutePath = null;
let ROOM_LIST = [];

let viewBox = { x: 0, y: 0, w: 1200, h: 800 };
let isPanning = false;
let startPoint = { x: 0, y: 0 };
let startViewBox = { x: 0, y: 0 };

let lastTap = 0;
let initialPinchDistance = 0;

// let tooltipEl = null;
let movingDot = null;


async function loadMap(file) {
  const res = await fetch(file);
  const text = await res.text();

  document.querySelector(".map-wrapper").innerHTML = text;
  svg = document.getElementById("svgRoot");

  if (!svg) {
    alert("SVG with id='svgRoot' not found!");
    return;
  }

  setupViewBox();
  hideAllHelpers(); 
  generateRoomListFromSVG();
  clearNavigation();

  bindPanZoom();
  bindMobileGestures();
}

/**************** ROOM LIST ****************/

function generateRoomListFromSVG() {
  if (!svg) return;

  const rooms = [...svg.querySelectorAll(".room")];

  ROOM_LIST = rooms.map(r => ({
    id: r.id,
    name: r.id.replace(/[_-]/g, " ")
  }));
}


/**************** AUTOCOMPLETE ****************/

function setupAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  const box = input.nextElementSibling;

  input.addEventListener("input", () => {
    const val = input.value.trim().toLowerCase();
    box.innerHTML = "";
    if (!val) return;

    const matches = ROOM_LIST.filter(r =>
      r.name.toLowerCase().includes(val)
    ).slice(0, 6);

    matches.forEach(room => {
      const div = document.createElement("div");
      div.className = "suggestion";
      div.textContent = room.name;

      div.onclick = () => {
        input.value = room.name;
        box.innerHTML = "";
      };

      box.appendChild(div);
    });
  });

  document.addEventListener("click", e => {
    if (!input.contains(e.target)) box.innerHTML = "";
  });
}

/**************** HELPERS ****************/

function normalize(t) {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hideAllHelpers() {
  if (!svg) return;

  svg.querySelectorAll('[id^="connector-"]').forEach(el => {
    el.style.display = "none";
  });

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
  path.getBoundingClientRect();
  path.style.transition = "stroke-dashoffset 1s ease-out";


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

  // 🔥 padding (important for zoom-out feel)
  const padding = Math.max(routeWidth, routeHeight) * 0.5;

  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  routeWidth = maxX - minX;
  routeHeight = maxY - minY;


  const svgRatio = 1200 / 800;
  const routeRatio = routeWidth / routeHeight;

  if (routeRatio > svgRatio) {
    const newH = routeWidth / svgRatio;
    const diff = newH - routeHeight;
    minY -= diff / 2;
    routeHeight = newH;
  } else {
    const newW = routeHeight * svgRatio;
    const diff = newW - routeWidth;
    minX -= diff / 2;
    routeWidth = newW;
  }

  // ✅ APPLY DIRECTLY (same system as centerOnRoom)
  viewBox = {
    x: minX,
    y: minY,
    w: routeWidth,
    h: routeHeight
  };

  svg.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
  );
}
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

  markRoom(startRoom, "#22c55e");
  markRoom(endRoom, "#ef4444");

  const graph = buildGraph();
  const path = findPath(graph, startNode, endNode);

  if (!path) return alert("No path found");

  drawRoutePath(path);
  fitRouteToView(path);
}

function centerOnRoom(room) {
  if (!svg || !room) return;

  const p = getNodePoint(room.dataset.node || room.id);
  if (!p) return;

  // 🔥 Use SAME logic as your working version
  const scaleFactor = window.innerWidth < 780 ? 2 : 1.5;

  const newW = 1200 / scaleFactor;   // 🔥 fixed base size
  const newH = 800 / scaleFactor;

  viewBox = {
    x: p.x - newW / 2,
    y: p.y - newH / 2,
    w: newW,
    h: newH
  };

  svg.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
  );
}

function animateDotToRoom(room) {
  if (!svg) return;

  if (movingDot) movingDot.remove();

  const box = room.getBBox();
  const targetX = box.x + box.width / 2;
  const targetY = box.y + box.height / 2;

  // start from center of current view
  const startX = viewBox.x + viewBox.w / 2;
  const startY = viewBox.y + viewBox.h / 2;

  movingDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  movingDot.setAttribute("r", 6);
  movingDot.setAttribute("class", "moving-dot");

  svg.appendChild(movingDot);

  const duration = 800;
  const startTime = performance.now();

  function animate(now) {
    const t = Math.min((now - startTime) / duration, 1);

    const x = startX + (targetX - startX) * t;
    const y = startY + (targetY - startY) * t;

    movingDot.setAttribute("cx", x);
    movingDot.setAttribute("cy", y);

    if (t < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
/**************** SEARCH ****************/
// function showTooltip(room, text) {
//   if (tooltipEl) tooltipEl.remove();

//   const container = document.getElementById("mapContainer");

//   const roomBox = room.getBoundingClientRect();
//   const containerBox = container.getBoundingClientRect();

//   tooltipEl = document.createElement("div");
//   tooltipEl.className = "map-tooltip";
//   tooltipEl.innerText = text;

//   tooltipEl.style.left = (roomBox.left - containerBox.left + roomBox.width / 2) + "px";
//   tooltipEl.style.top = (roomBox.top - containerBox.top) + "px";

//   container.appendChild(tooltipEl);
// }

function searchPlace() {
  if (!svg) return alert("Map not loaded");

  clearNavigation();

  const input = document.getElementById("searchInput").value.trim();
  if (!input) return;

  const room = getRoomByName(input);
  if (!room) return alert("Place not found");

  room.classList.add("highlight-room");

  markRoom(room, "#ef4444");

  // 🔵 moving dot
  animateDotToRoom(room);

  // 🧭 zoom + center
  centerOnRoom(room);

  // // 📍 tooltip
  // showTooltip(room, room.id.replace(/[_-]/g, " "));
}


function setupViewBox() {
  viewBox = { x: 0, y: 0, w: 1200, h: 800 };
  svg.setAttribute("viewBox", "0 0 1200 800");

  // Get original SVG viewBox
  const vb = svg.getAttribute("viewBox");

  if (vb) {
    const [x, y, w, h] = vb.split(" ").map(Number);
    MAP_WIDTH = w;
    MAP_HEIGHT = h;
    viewBox = { x, y, w, h };
  } else {
    MAP_WIDTH = 1200;
    MAP_HEIGHT = 800;
    viewBox = { x: 0, y: 0, w: 1200, h: 800 };
    svg.setAttribute("viewBox", "0 0 1200 800");
  }

  // ✅ Make map fill container + maintain aspect ratio
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  applyViewBox(); // update viewBox in SVG

}

function adjustPadding() {
  const container = document.querySelector(".map-wrapper");
  const screenRatio = window.innerWidth / window.innerHeight;
  const mapRatio = MAP_WIDTH / MAP_HEIGHT;

  if (screenRatio < mapRatio) {
    // phone taller than map → add vertical padding
    const extraSpace = (window.innerHeight - (window.innerWidth / mapRatio)) / 2;
    container.style.paddingTop = `${extraSpace}px`;
    container.style.paddingBottom = `${extraSpace}px`;
  } else {
    container.style.paddingTop = "8px";
    container.style.paddingBottom = "8px";
  }
}

// Call on load & resize
window.addEventListener("load", adjustPadding);
window.addEventListener("resize", adjustPadding);
/**************** PAN + ZOOM ****************/

// function bindPanZoom() {

//   svg.onmousedown = startPan;
//   svg.onmousemove = movePan;
//   svg.onmouseup = endPan;
//   svg.onmouseleave = endPan;

//   svg.addEventListener("wheel", (e) => {
//     e.preventDefault();

//     const rect = svg.getBoundingClientRect();

//     const cx = viewBox.x + (e.clientX - rect.left) / rect.width * viewBox.w;
//     const cy = viewBox.y + (e.clientY - rect.top) / rect.height * viewBox.h;

//     zoom(e.deltaY < 0 ? 1 : -1, cx, cy);
//   });
// }
function bindPanZoom() {

  // 🖥️ PC EVENTS
  svg.onmousedown = startPan;
  svg.onmousemove = movePan;
  svg.onmouseup = endPan;
  svg.onmouseleave = endPan;

  // 📱 MOBILE TOUCH EVENTS
  svg.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    startPan({ clientX: touch.clientX, clientY: touch.clientY });
  });

  svg.addEventListener("touchmove", (e) => {
    e.preventDefault(); // 🔥 VERY IMPORTANT (prevents page scroll)
    const touch = e.touches[0];
    movePan({ clientX: touch.clientX, clientY: touch.clientY });
  });

  svg.addEventListener("touchend", endPan);

  // 🖱️ WHEEL ZOOM (PC)
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();

    const rect = svg.getBoundingClientRect();

    const cx = viewBox.x + (e.clientX - rect.left) / rect.width * viewBox.w;
    const cy = viewBox.y + (e.clientY - rect.top) / rect.height * viewBox.h;

    zoom(e.deltaY < 0 ? 1 : -1, cx, cy);
  });
}

function startPan(e) {
  isPanning = true;
  startPoint = { x: e.clientX, y: e.clientY };
  startViewBox = { ...viewBox };
}

function movePan(e) {
  if (!isPanning) return;

  const dx = (startPoint.x - e.clientX) * (viewBox.w / svg.clientWidth);
  const dy = (startPoint.y - e.clientY) * (viewBox.h / svg.clientHeight);

  // ✅ UPDATE REAL STATE (this was missing)
  viewBox.x = startViewBox.x + dx;
  viewBox.y = startViewBox.y + dy;

  svg.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
  );
}
function endPan() {
  isPanning = false;
}

function zoom(dir) {
  if (!svg) return;

  const factor = dir > 0 ? 0.85 : 1.15;

  viewBox.w *= factor;
  viewBox.h *= factor;

  svg.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
  );
}

function clampViewBox() {
  // prevent showing outside map

  if (viewBox.w > MAP_WIDTH) {
    viewBox.x = (MAP_WIDTH - viewBox.w) / 2;
  } else {
    viewBox.x = Math.max(0, Math.min(viewBox.x, MAP_WIDTH - viewBox.w));
  }

  if (viewBox.h > MAP_HEIGHT) {
    viewBox.y = (MAP_HEIGHT - viewBox.h) / 2;
  } else {
    viewBox.y = Math.max(0, Math.min(viewBox.y, MAP_HEIGHT - viewBox.h));
  }
}

function applyViewBox() {
  svg.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
  );
}
/**************** INIT ****************/

window.onload = () => {
  loadMap("College(1).svg");

  setupAutocomplete("searchInput");
  setupAutocomplete("startInput");
  setupAutocomplete("endInput");
};

window.addEventListener("DOMContentLoaded", () => {
  // Open specific drawer section
  function openMobileNav(sectionId) {
    const mobileNav = document.getElementById("mobileNav");
    mobileNav.classList.add("open");

    // Show only the selected section
    ["mobileSearchSection","mobileNavigateSection","mobileFloorSection"].forEach(id => {
      document.getElementById(id).style.display = (id === sectionId) ? "block" : "none";
    });
  }

  // Close drawer
  window.closeMobileNav = function() {
    document.getElementById("mobileNav").classList.remove("open");
  }

  // Hook mobile icons
  document.getElementById("mobileSearch").onclick = () => openMobileNav("mobileSearchSection");
  document.getElementById("mobileNavigate").onclick = () => openMobileNav("mobileNavigateSection");
  document.getElementById("mobileFloor").onclick = () => openMobileNav("mobileFloorSection");

  // Submit search
  window.submitMobileSearch = function() {
    const val = document.getElementById("mobileSearchInput").value.trim();
    if (!val) return alert("Enter room name");
    document.getElementById("searchInput").value = val;
    searchPlace();
    closeMobileNav(); // auto-close
  }

  // Submit navigation
  window.submitMobileNavigate = function() {
    const start = document.getElementById("mobileStartInput").value.trim();
    const end = document.getElementById("mobileEndInput").value.trim();
    if (!start || !end) return alert("Enter start & destination");
    document.getElementById("startInput").value = start;
    document.getElementById("endInput").value = end;
    navigate();
    closeMobileNav(); // auto-close
  }
});