const video = document.querySelector("#camera");
const hud = document.querySelector("#hud");
const capture = document.querySelector("#capture");
const hctx = hud.getContext("2d");
const cctx = capture.getContext("2d");

const els = {
  placeholder: document.querySelector("#cameraPlaceholder"),
  dot: document.querySelector("#connectionDot"),
  connection: document.querySelector("#connectionLabel"),
  fps: document.querySelector("#frameRate"),
  latency: document.querySelector("#latency"),
  status: document.querySelector("#status"),
  detection: document.querySelector("#detection"),
  confidence: document.querySelector("#confidence"),
  action: document.querySelector("#action"),
  proposed: document.querySelector("#proposedAction"),
  target: document.querySelector("#target"),
  targetSection: document.querySelector("#targetSection"),
  objectMode: document.querySelector("#objectMode"),
  gestureMode: document.querySelector("#gestureMode"),
};

let socket;
let stream;
let mode = "object_hunt";
let lastResult = null;
let inFlight = false;
let receivedFrames = 0;
let fpsStarted = performance.now();

const handConnections = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];

function setConnected(connected) {
  els.dot.classList.toggle("online", connected);
  els.connection.textContent = connected ? "backend online" : "backend offline";
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws/vision`);
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    setConnected(true);
    sendConfig();
  };
  socket.onclose = () => {
    setConnected(false);
    inFlight = false;
    setTimeout(connect, 1200);
  };
  socket.onerror = () => setConnected(false);
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type !== "vision") return;
    lastResult = data;
    inFlight = false;
    receivedFrames += 1;
    updateTelemetry(data);
    drawHud(data);
  };
}

function sendConfig() {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ mode, target: els.target.value }));
}

async function loadClasses() {
  try {
    const response = await fetch("/api/classes");
    const data = await response.json();
    els.target.innerHTML = "";
    for (const name of data.classes) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === "bottle") option.selected = true;
      els.target.appendChild(option);
    }
  } catch (error) {
    console.warn("Não foi possível carregar classes:", error);
  }
}

async function startCamera() {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  els.placeholder.classList.add("hidden");
  els.status.textContent = "Câmera pronta";
  resizeCanvases();
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  video.srcObject = null;
  els.placeholder.classList.remove("hidden");
  lastResult = null;
  inFlight = false;
  clearHud();
  els.status.textContent = "Aguardando câmera";
  els.action.textContent = "IDLE";
}

function resizeCanvases() {
  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  hud.width = Math.round(rect.width * dpr);
  hud.height = Math.round(rect.height * dpr);
  hud.style.width = `${rect.width}px`;
  hud.style.height = `${rect.height}px`;
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

async function sendFrame() {
  if (!stream || inFlight || socket?.readyState !== WebSocket.OPEN || video.readyState < 2) return;

  const sourceW = video.videoWidth;
  const sourceH = video.videoHeight;
  const maxW = 640;
  const scale = Math.min(1, maxW / sourceW);
  capture.width = Math.round(sourceW * scale);
  capture.height = Math.round(sourceH * scale);
  cctx.drawImage(video, 0, 0, capture.width, capture.height);

  inFlight = true;
  capture.toBlob(async (blob) => {
    if (!blob) {
      inFlight = false;
      return;
    }
    try {
      socket.send(await blob.arrayBuffer());
    } catch {
      inFlight = false;
    }
  }, "image/jpeg", 0.72);
}

function updateTelemetry(data) {
  els.latency.textContent = `${Math.round(data.latency_ms)} ms`;
  els.status.textContent = data.status;
  els.action.textContent = data.action;
  els.proposed.textContent = `proposto: ${data.proposed_action}`;

  if (data.mode === "gesture") {
    els.detection.textContent = data.gesture || "NONE";
    els.confidence.textContent = data.hand ? "hand locked" : "--";
  } else if (data.tracked) {
    els.detection.textContent = data.target;
    els.confidence.textContent = `${Math.round(data.tracked.confidence * 100)}%`;
  } else {
    els.detection.textContent = "--";
    els.confidence.textContent = "--";
  }
}

function clearHud() {
  const rect = hud.getBoundingClientRect();
  hctx.clearRect(0, 0, rect.width, rect.height);
}

function drawHud(data) {
  const rect = hud.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  hctx.clearRect(0, 0, w, h);

  hctx.save();
  hctx.setLineDash([7, 9]);
  hctx.lineWidth = 1;
  hctx.strokeStyle = "rgba(97,201,255,.23)";
  for (const x of [w * 0.42, w * 0.58]) {
    hctx.beginPath(); hctx.moveTo(x, 0); hctx.lineTo(x, h); hctx.stroke();
  }
  hctx.restore();

  hctx.strokeStyle = "rgba(64,245,174,.65)";
  hctx.lineWidth = 1;
  hctx.beginPath();
  hctx.moveTo(w/2 - 12, h/2); hctx.lineTo(w/2 + 12, h/2);
  hctx.moveTo(w/2, h/2 - 12); hctx.lineTo(w/2, h/2 + 12);
  hctx.stroke();

  for (const det of data.detections || []) {
    const x = det.x1 * w, y = det.y1 * h;
    const bw = (det.x2 - det.x1) * w, bh = (det.y2 - det.y1) * h;
    const color = det.is_target ? "#40f5ae" : "rgba(97,201,255,.72)";
    hctx.strokeStyle = color;
    hctx.lineWidth = det.is_target ? 2.5 : 1.2;
    hctx.strokeRect(x, y, bw, bh);

    const label = `${det.label} ${Math.round(det.confidence * 100)}%`;
    hctx.font = "600 12px ui-monospace, monospace";
    const tw = hctx.measureText(label).width + 10;
    hctx.fillStyle = det.is_target ? "rgba(20,65,48,.92)" : "rgba(10,32,42,.88)";
    hctx.fillRect(x, Math.max(0, y - 22), tw, 20);
    hctx.fillStyle = color;
    hctx.fillText(label, x + 5, Math.max(14, y - 7));
  }

  if (data.hand) drawHand(data.hand, w, h);

  hctx.fillStyle = "rgba(4,10,12,.72)";
  hctx.fillRect(12, 12, 228, 52);
  hctx.fillStyle = "#779098";
  hctx.font = "700 10px ui-monospace, monospace";
  hctx.fillText(data.mode === "gesture" ? "GESTURE CONTROL" : "OBJECT HUNT", 23, 31);
  hctx.fillStyle = "#40f5ae";
  hctx.font = "800 19px ui-monospace, monospace";
  hctx.fillText(data.action, 23, 53);
}

function drawHand(points, w, h) {
  hctx.strokeStyle = "rgba(255,207,90,.82)";
  hctx.fillStyle = "#ffcf5a";
  hctx.lineWidth = 2;

  for (const [a, b] of handConnections) {
    hctx.beginPath();
    hctx.moveTo(points[a].x * w, points[a].y * h);
    hctx.lineTo(points[b].x * w, points[b].y * h);
    hctx.stroke();
  }
  for (const p of points) {
    hctx.beginPath();
    hctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    hctx.fill();
  }
}

function setMode(nextMode) {
  mode = nextMode;
  els.objectMode.classList.toggle("active", mode === "object_hunt");
  els.gestureMode.classList.toggle("active", mode === "gesture");
  els.targetSection.style.display = mode === "object_hunt" ? "block" : "none";
  sendConfig();
}

document.querySelector("#startCamera").addEventListener("click", () => {
  startCamera().catch((error) => {
    els.status.textContent = `Erro de câmera: ${error.name}`;
  });
});
document.querySelector("#stopCamera").addEventListener("click", stopCamera);
els.objectMode.addEventListener("click", () => setMode("object_hunt"));
els.gestureMode.addEventListener("click", () => setMode("gesture"));
els.target.addEventListener("change", sendConfig);
window.addEventListener("resize", () => {
  resizeCanvases();
  if (lastResult) drawHud(lastResult);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "1") setMode("object_hunt");
  if (event.key === "2") setMode("gesture");
});

setInterval(sendFrame, 100);
setInterval(() => {
  const now = performance.now();
  const elapsed = (now - fpsStarted) / 1000;
  els.fps.textContent = `${(receivedFrames / Math.max(elapsed, .001)).toFixed(1)} FPS`;
  receivedFrames = 0;
  fpsStarted = now;
}, 1000);

loadClasses();
connect();
