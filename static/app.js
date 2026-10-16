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
  movementCard: document.querySelector("#movementCard"),
  directionArrow: document.querySelector("#directionArrow"),
  directionLabel: document.querySelector("#directionLabel"),
  directionText: document.querySelector("#directionText"),
};

let socket;
let reconnectTimer;
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

const actionLabels = {
  IDLE: { label: "Aguardando", arrow: "•", text: "Sem comando no momento.", css: "idle" },
  SEARCH: { label: "Procurar", arrow: "⟳", text: "Varredura visual em busca do objeto alvo.", css: "search" },
  FORWARD: { label: "Avançar", arrow: "↑", text: "Deslocamento para a frente.", css: "forward" },
  TURN_LEFT: { label: "Virar à esquerda", arrow: "←", text: "Correção de direção para a esquerda.", css: "turn-left" },
  TURN_RIGHT: { label: "Virar à direita", arrow: "→", text: "Correção de direção para a direita.", css: "turn-right" },
  STOP: { label: "Parar", arrow: "■", text: "Parada do robô.", css: "stop" },
  DANCE: { label: "Dançar", arrow: "♪", text: "Ação de demonstração.", css: "dance" },
};

const gestureLabels = {
  NONE: "Nenhum gesto",
  OPEN_PALM: "Mão aberta",
  THUMB_UP: "Joinha",
  POINT_UP: "Apontar para cima",
  POINT_LEFT: "Apontar para a esquerda",
  POINT_RIGHT: "Apontar para a direita",
};

const objectLabels = {
  person: "Pessoa", bicycle: "Bicicleta", car: "Carro", motorcycle: "Motocicleta", airplane: "Avião",
  bus: "Ônibus", train: "Trem", truck: "Caminhão", boat: "Barco", "traffic light": "Semáforo",
  "fire hydrant": "Hidrante", "stop sign": "Placa de pare", "parking meter": "Parquímetro", bench: "Banco",
  bird: "Pássaro", cat: "Gato", dog: "Cachorro", horse: "Cavalo", sheep: "Ovelha", cow: "Vaca",
  elephant: "Elefante", bear: "Urso", zebra: "Zebra", giraffe: "Girafa", backpack: "Mochila", umbrella: "Guarda-chuva",
  handbag: "Bolsa", tie: "Gravata", suitcase: "Mala", frisbee: "Frisbee", skis: "Esquis", snowboard: "Prancha de snowboard",
  "sports ball": "Bola", kite: "Pipa", "baseball bat": "Taco de beisebol", "baseball glove": "Luva de beisebol",
  skateboard: "Skate", surfboard: "Prancha de surfe", "tennis racket": "Raquete de tênis", bottle: "Garrafa",
  "wine glass": "Taça", cup: "Copo", fork: "Garfo", knife: "Faca", spoon: "Colher", bowl: "Tigela",
  banana: "Banana", apple: "Maçã", sandwich: "Sanduíche", orange: "Laranja", broccoli: "Brócolis", carrot: "Cenoura",
  "hot dog": "Cachorro-quente", pizza: "Pizza", donut: "Rosquinha", cake: "Bolo", chair: "Cadeira", couch: "Sofá",
  "potted plant": "Planta", bed: "Cama", "dining table": "Mesa", toilet: "Vaso sanitário", tv: "Televisão",
  laptop: "Notebook", mouse: "Mouse", remote: "Controle remoto", keyboard: "Teclado", "cell phone": "Celular",
  microwave: "Micro-ondas", oven: "Forno", toaster: "Torradeira", sink: "Pia", refrigerator: "Geladeira",
  book: "Livro", clock: "Relógio", vase: "Vaso", scissors: "Tesoura", "teddy bear": "Urso de pelúcia",
  "hair drier": "Secador de cabelo", toothbrush: "Escova de dentes",
};

function objectLabel(value) {
  if (!value) return "--";
  return objectLabels[value] || value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function actionMeta(action) {
  return actionLabels[action] || actionLabels.IDLE;
}

function setConnected(connected, connecting = false) {
  els.dot.classList.toggle("online", connected);
  els.dot.classList.toggle("warning", connecting);
  els.dot.classList.toggle("offline", !connected && !connecting);
  els.connection.textContent = connected ? "Backend conectado" : connecting ? "Conectando ao backend" : "Backend offline";
}

function connect() {
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws/vision`);
  socket.binaryType = "arraybuffer";
  setConnected(false, true);

  socket.onopen = () => {
    clearTimeout(reconnectTimer);
    setConnected(true);
    sendConfig();
  };

  socket.onclose = () => {
    setConnected(false);
    inFlight = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1200);
  };

  socket.onerror = () => setConnected(false);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "error") {
      inFlight = false;
      els.status.textContent = data.message || "Erro no processamento";
      return;
    }
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

    for (const name of data.classes || []) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = objectLabel(name);
      if (name === "bottle") option.selected = true;
      els.target.appendChild(option);
    }
  } catch (error) {
    console.warn("Não foi possível carregar as classes:", error);
    els.target.innerHTML = '<option value="bottle">Garrafa</option>';
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
  els.detection.textContent = "--";
  els.confidence.textContent = "--";
  els.latency.textContent = "-- ms";
  updateMovement("IDLE", "IDLE");
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

function statusText(data) {
  if (data.mode === "gesture") {
    return data.hand ? "Mão detectada" : "Mostre uma mão para a câmera";
  }

  const target = objectLabel(data.target);
  return data.tracked ? `Alvo localizado: ${target}` : `Procurando: ${target}`;
}

function updateTelemetry(data) {
  els.latency.textContent = `${Math.round(data.latency_ms)} ms`;
  els.status.textContent = statusText(data);
  updateMovement(data.action, data.proposed_action);

  if (data.mode === "gesture") {
    els.detection.textContent = gestureLabels[data.gesture] || "Nenhum gesto";
    els.confidence.textContent = "--";
  } else if (data.tracked) {
    els.detection.textContent = objectLabel(data.target);
    els.confidence.textContent = `${Math.round(data.tracked.confidence * 100)}%`;
  } else {
    els.detection.textContent = "Alvo não encontrado";
    els.confidence.textContent = "--";
  }
}

function updateMovement(action, proposedAction) {
  const current = actionMeta(action);
  const proposed = actionMeta(proposedAction);

  els.action.textContent = current.label;
  els.proposed.textContent = `Proposto: ${proposed.label}`;
  els.directionLabel.textContent = current.label;
  els.directionArrow.textContent = current.arrow;
  els.directionText.textContent = current.text;
  els.movementCard.dataset.action = current.css;
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
  hctx.setLineDash([8, 8]);
  hctx.lineWidth = 1.5;
  hctx.strokeStyle = "rgba(37,99,235,.28)";
  for (const x of [w * 0.42, w * 0.58]) {
    hctx.beginPath();
    hctx.moveTo(x, 0);
    hctx.lineTo(x, h);
    hctx.stroke();
  }
  hctx.restore();

  hctx.strokeStyle = "rgba(37,99,235,.55)";
  hctx.lineWidth = 1.5;
  hctx.beginPath();
  hctx.moveTo(w/2 - 14, h/2);
  hctx.lineTo(w/2 + 14, h/2);
  hctx.moveTo(w/2, h/2 - 14);
  hctx.lineTo(w/2, h/2 + 14);
  hctx.stroke();

  for (const det of data.detections || []) {
    const x = det.x1 * w;
    const y = det.y1 * h;
    const bw = (det.x2 - det.x1) * w;
    const bh = (det.y2 - det.y1) * h;
    const color = det.is_target ? "#2563eb" : "rgba(71,85,105,.78)";

    hctx.strokeStyle = color;
    hctx.lineWidth = det.is_target ? 2.5 : 1.4;
    hctx.strokeRect(x, y, bw, bh);

    const label = `${objectLabel(det.label)} · ${Math.round(det.confidence * 100)}%`;
    hctx.font = "600 12px Inter, Segoe UI, sans-serif";
    const tw = hctx.measureText(label).width + 12;
    hctx.fillStyle = det.is_target ? "rgba(37,99,235,.92)" : "rgba(71,85,105,.88)";
    hctx.fillRect(x, Math.max(0, y - 24), tw, 21);
    hctx.fillStyle = "#ffffff";
    hctx.fillText(label, x + 6, Math.max(15, y - 9));
  }

  if (data.hand) drawHand(data.hand, w, h);
}

function drawHand(points, w, h) {
  hctx.strokeStyle = "rgba(15,118,110,.82)";
  hctx.fillStyle = "#0f766e";
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
  els.objectMode.classList.toggle("ativo", mode === "object_hunt");
  els.gestureMode.classList.toggle("ativo", mode === "gesture");
  els.targetSection.style.display = mode === "object_hunt" ? "block" : "none";
  sendConfig();
}

document.querySelector("#startCamera").addEventListener("click", () => {
  startCamera().catch((error) => {
    els.status.textContent = `Erro ao acessar a câmera: ${error.name}`;
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
  els.fps.textContent = `${(receivedFrames / Math.max(elapsed, .001)).toFixed(1)} quadros/s`;
  receivedFrames = 0;
  fpsStarted = now;
}, 1000);

updateMovement("IDLE", "IDLE");
loadClasses().then(sendConfig);
connect();
