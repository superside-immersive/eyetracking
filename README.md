# 👁️ Advanced Iris Tracking - JavaScript + HTML

Sistema avanzado de seguimiento de iris con MediaPipe Face Mesh usando JavaScript puro y HTML5.

## 🚀 Características

- ✅ **Tracking de iris en tiempo real** con 478 landmarks refinados
- ✅ **Detección de parpadeos** con algoritmo EAR (Eye Aspect Ratio)
- ✅ **Estimación de mirada** con mapeo a coordenadas de pantalla
- ✅ **Medición de tamaño de pupila** con promedio suavizado
- ✅ **Gráfico de EAR en tiempo real** con línea de umbral
- ✅ **Contador de FPS** y métricas de rendimiento
- ✅ **Interfaz visual moderna** con gradientes y animaciones
- ✅ **Modo debug** para ver todos los landmarks
- ✅ **Capturas de pantalla** con overlay de tracking

## 📋 Requisitos

- Navegador moderno (Chrome, Edge, Safari, Firefox)
- Cámara web
- Conexión a internet (para cargar MediaPipe desde CDN)

## 🎮 Uso

### Opción 1: Servidor local simple

```bash
# Con Python
python3 -m http.server 8000

# O con Node.js
npx http-server

# Luego abre: http://localhost:8000
```

### Opción 2: Abrir directamente

Simplemente abre el archivo `index.html` en tu navegador. Algunas funciones pueden requerir un servidor local.

## 🎯 Controles

- **▶️ Iniciar Tracking**: Activa la cámara y comienza el seguimiento
- **⏸️ Detener**: Pausa el tracking
- **📸 Captura**: Guarda una imagen con las anotaciones
- **🔍 Debug**: Muestra todos los 478 landmarks faciales

## 📊 Métricas Mostradas

1. **FPS**: Frames por segundo del procesamiento
2. **Parpadeos**: Contador total de parpadeos detectados
3. **EAR Promedio**: Eye Aspect Ratio (0.21 es el umbral de parpadeo)
4. **Tamaño Pupila**: Diámetro promedio del iris en píxeles
5. **Posición Mirada**: Coordenadas estimadas de la mirada en pantalla

## 🎨 Visualizaciones

### Panel Principal
- Video en vivo con overlay de tracking
- Contornos de ojos en verde
- Puntos de iris en magenta
- Centro de iris con cruz roja
- Círculos de iris en cyan
- Alerta de parpadeo (rojo pulsante)

### Panel de Estadísticas
- Indicador de estado (verde = activo)
- Todas las métricas en tiempo real
- Mini-mapa de dirección de mirada
- Gráfico histórico de EAR

## 🔧 Parámetros Técnicos

### Landmarks de MediaPipe
```javascript
LEFT_IRIS: [469, 470, 471, 472]
RIGHT_IRIS: [474, 475, 476, 477]
LEFT_EYE: [33, 160, 158, 133, 153, 144]
RIGHT_EYE: [362, 385, 387, 263, 373, 380]
```

### Configuración de Face Mesh
```javascript
{
    maxNumFaces: 1,
    refineLandmarks: true,  // ¡Esencial para iris!
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
}
```

### Detección de Parpadeo
- **Umbral EAR**: 0.21
- **Frames consecutivos**: 2 frames mínimos
- **Fórmula**: `EAR = (v1 + v2) / (2.0 * h)`

## 📱 Responsive

La interfaz es completamente responsive:
- Desktop: Layout de 2 columnas
- Tablet/Mobile: Layout de 1 columna apilada

## 🎓 Algoritmos Implementados

### Eye Aspect Ratio (EAR)
```javascript
calculateEAR(eyeLandmarks, width, height) {
    const v1 = distance(points[1], points[5]);
    const v2 = distance(points[2], points[4]);
    const h = distance(points[0], points[3]);
    return (v1 + v2) / (2.0 * h);
}
```

### Gaze Ratio
```javascript
calculateGazeRatio(irisLandmarks, eyeLandmarks) {
    const irisCenter = getCenter(irisLandmarks);
    const eyeBox = getBoundingBox(eyeLandmarks);
    const horizontalRatio = (irisCenter.x - eyeBox.minX) / eyeBox.width;
    const verticalRatio = (irisCenter.y - eyeBox.minY) / eyeBox.height;
    return { h: horizontalRatio, v: verticalRatio };
}
```

### Smoothing
- **Gaze**: Promedio móvil de últimos 5 frames
- **Pupil**: Promedio móvil de últimos 30 frames
- **EAR**: Histórico de 100 valores

## 🚀 Expansiones Futuras

### Sistema de Calibración
```javascript
// Mostrar puntos de calibración en pantalla
// Usuario mira cada punto
// Calcular matriz de transformación
// Aplicar corrección a gazePoint
```

### Control por Mirada
```javascript
// Simular movimiento de mouse
// Detección de fijación (dwell time)
// Click con parpadeo largo
```

### Análisis de Fatiga
```javascript
// Frecuencia de parpadeo
// Duración de parpadeos
// Detección de microsueños
```

## 🐛 Troubleshooting

### La cámara no se activa
- Verifica permisos del navegador
- Usa HTTPS o localhost
- Revisa si otra app está usando la cámara

### Bajo rendimiento
- Cierra otras pestañas del navegador
- Reduce calidad de cámara en el código
- Desactiva modo debug

### No detecta iris
- Mejora la iluminación (frontal, no contraluz)
- Ajusta distancia a cámara (50-70cm)
- Limpia lente de cámara

### Error de CORS
- Usa un servidor local (http-server, python -m http.server)
- No abras el HTML directamente con file://

## 📦 Archivos del Proyecto

```
eyes/
├── index.html          # Interfaz principal
├── iris-tracker.js     # Lógica de tracking
└── README.md          # Esta documentación
```

## 🔗 CDN Dependencies

El proyecto usa estos CDN de MediaPipe:
- `@mediapipe/camera_utils`
- `@mediapipe/control_utils`
- `@mediapipe/drawing_utils`
- `@mediapipe/face_mesh`

## 📄 Licencia

MIT License - Uso libre personal y comercial

## 🙏 Referencias

- [MediaPipe Face Mesh](https://google.github.io/mediapipe/solutions/face_mesh.html)
- [Eye Aspect Ratio Research](http://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf)
- [WebGL y Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

---

**Hecho con ❤️ usando MediaPipe y JavaScript puro**
