# GO2 Vision MVP

MVP de visão computacional para validar **HUD**, **controle por gestos** e **caça a objetos** usando apenas uma webcam antes da integração com o Unitree Go2.

## O que já está no MVP

### 1. Object Hunt

O YOLO detecta objetos da base COCO. Você escolhe um alvo no painel (por exemplo `bottle`) e o sistema calcula uma ação sem movimentar hardware real:

- alvo ausente → `SEARCH`
- alvo à esquerda → `TURN_LEFT`
- alvo à direita → `TURN_RIGHT`
- alvo centralizado e distante → `FORWARD`
- alvo ocupando grande parte da imagem → `STOP`

A “distância” do MVP é apenas uma heurística baseada na área da bounding box. No Go2 real ela deve ser combinada/substituída por dados de profundidade/LiDAR.

### 2. Gesture Control

MediaPipe rastreia a mão e uma classificação geométrica simples gera comandos:

| Gesto | Comando |
| --- | --- |
| mão aberta | `STOP` |
| joinha | `DANCE` |
| apontar para cima | `FORWARD` |
| apontar para a esquerda | `TURN_LEFT` |
| apontar para a direita | `TURN_RIGHT` |

O reconhecimento atual é deliberadamente simples para validação de conceito. Depois podemos trocar por um classificador treinado ou MediaPipe Gesture Recognizer.

### 3. HUD

O navegador desenha:

- bounding boxes e confiança;
- corredor central de navegação;
- esqueleto da mão;
- ação proposta e ação estabilizada;
- latência de inferência e FPS;
- telemetria do modo atual.

## Arquitetura

```text
Webcam do navegador
        │ JPEG/WebSocket
        ▼
FastAPI dentro do Docker
        │
        ├── YOLO11n ───────── Object Hunt
        │
        ├── MediaPipe Hands ─ Gesture Control
        │
        ▼
Decision Layer
        │
        ▼
ActionGate
        │
        ▼
MockRobotController
```

A webcam é capturada pelo **navegador**, não pelo container. Isso permite executar o mesmo `docker compose` no Docker Desktop do Windows/macOS e no Linux sem mapear `/dev/video0`.

## Rodar

Requisitos:

- Docker + Docker Compose;
- navegador moderno com webcam;
- internet durante a **primeira build**, pois o peso `yolo11n.pt` é baixado e gravado na imagem.

```bash
docker compose up --build
```

Abra:

```text
http://localhost:8000
```

Permita o acesso à webcam e clique em **Iniciar webcam**.

Atalhos:

- `1`: Object Hunt
- `2`: Gesture Control

Teste do backend:

```text
http://localhost:8000/health
```

## Testes da lógica de decisão

Sem Docker:

```bash
python -m unittest discover -s tests
```

## Ajustes rápidos

No `docker-compose.yml`:

```yaml
YOLO_CONFIDENCE: "0.35"
OBJECT_STOP_AREA: "0.18"
```

`OBJECT_STOP_AREA` controla quando o alvo é considerado próximo o suficiente para gerar `STOP`.

## Integração futura com Unitree Go2

A visão não deve conhecer SDK, DDS, WebRTC ou motores. Ela apenas produz comandos semânticos.

O ponto de troca está em `app/robot.py`:

```python
class RobotController:
    def execute(self, action: str) -> None:
        ...
```

Hoje:

```text
MockRobotController
```

Depois:

```text
UnitreeGo2Controller
```

O adapter real deverá traduzir `FORWARD`, `TURN_LEFT`, `TURN_RIGHT`, `STOP` e ações pontuais como `DANCE` para as APIs de alto nível do Unitree SDK2. A entrada de vídeo também poderá ser trocada da webcam do navegador para a câmera frontal do Go2 sem alterar a camada de decisão.

## Segurança para a fase com robô real

Antes de habilitar movimento físico:

1. manter `STOP` com prioridade e sem debounce;
2. limitar velocidade linear/angular no adapter do Go2;
3. adicionar timeout/watchdog: sem frames/telemetria = `STOP`;
4. adicionar distância mínima real usando sensores do robô;
5. testar primeiro com o Go2 suspenso/área isolada e usar os comandos de alto nível do SDK.
