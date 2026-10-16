# GO2 Vision MVP

MVP de visão computacional preparado para validar HUD, controle por gestos e caça a objetos antes da integração com o Unitree Go2.

## Objetivo

O navegador captura a webcam e envia frames para um backend Python em Docker. O backend executa visão computacional e devolve apenas as detecções/decisões para o HUD. Assim, a webcam funciona no Windows, macOS e Linux sem precisar expor `/dev/video*` ao container.

### Modos planejados

- **Gesture Control**: gestos de mão viram comandos simulados do robô.
- **Object Hunt**: YOLO procura um objeto, estima sua posição e decide `TURN_LEFT`, `TURN_RIGHT`, `FORWARD`, `STOP` ou `SEARCH`.
- **Robot abstraction**: inicialmente usa `MockRobotController`; posteriormente será substituído por um adapter do Unitree Go2 sem reescrever visão/HUD.

## Branch do MVP

A implementação será mantida em `feat/vision-mvp`.

## Execução esperada

```bash
docker compose up --build
```

Depois acesse `http://localhost:8000` e permita o uso da webcam.

> O modelo YOLO é baixado durante o build da imagem Docker, portanto a primeira build precisa de acesso à internet.
