// Advanced Iris Tracker with MediaPipe Face Mesh
class IrisTracker {
    constructor() {
        // MediaPipe Face Mesh
        this.faceMesh = null;
        this.stream = null;
        
        // Video and Canvas elements
        this.videoElement = document.getElementById('videoElement');
        this.canvasElement = document.getElementById('canvasElement');
        this.ctx = null;
        
        // EAR Chart
        this.earCanvas = document.getElementById('earCanvas');
        this.earCtx = this.earCanvas.getContext('2d');
        
        // Iris landmarks (refined landmarks)
        this.LEFT_IRIS = [469, 470, 471, 472];
        this.RIGHT_IRIS = [474, 475, 476, 477];
        
        // Eye landmarks for EAR calculation
        this.LEFT_EYE = [33, 160, 158, 133, 153, 144];
        this.RIGHT_EYE = [362, 385, 387, 263, 373, 380];
        
        // Tracking state
        this.isRunning = false;
        this.debugMode = false;
        this.animationId = null;
        
        // Metrics
        this.blinkCount = 0;
        this.earHistory = [];
        this.maxEarHistory = 100;
        this.EAR_THRESHOLD = 0.21;
        this.BLINK_CONSEC_FRAMES = 2;
        this.blinkFrameCounter = 0;
        this.lastBlinkTime = 0;
        
        // FPS calculation
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = Date.now();
        
        // Gaze tracking
        this.gazeHistory = [];
        this.maxGazeHistory = 5;
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
        
        // Pupil size tracking
        this.pupilSizeHistory = [];
        this.maxPupilHistory = 30;
    }

    async init() {
        try {
            console.log('Initializing MediaPipe Face Mesh...');
            
            // Check if FaceMesh is available
            if (typeof FaceMesh === 'undefined') {
                throw new Error('MediaPipe Face Mesh not loaded');
            }

            // Initialize MediaPipe Face Mesh
            this.faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            await this.faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true, // Essential for iris tracking!
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.faceMesh.onResults((results) => this.onResults(results));

            console.log('MediaPipe initialized successfully');
            this.updateStatus('Listo para iniciar', true);
            return true;
        } catch (error) {
            console.error('Error initializing:', error);
            this.updateStatus('Error: ' + error.message, false);
            return false;
        }
    }

    async start() {
        if (this.isRunning) return;
        
        try {
            console.log('Starting camera...');
            
            // Get camera stream
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            });

            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();

            console.log('Camera started');
            
            this.isRunning = true;
            this.updateStatus('Tracking activo', true);
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            
            // Start processing loop
            this.processFrame();
        } catch (error) {
            console.error('Error starting camera:', error);
            this.updateStatus('Error de cámara: ' + error.message, false);
        }
    }

    async processFrame() {
        if (!this.isRunning) return;

        try {
            await this.faceMesh.send({ image: this.videoElement });
        } catch (error) {
            console.error('Error processing frame:', error);
        }

        this.animationId = requestAnimationFrame(() => this.processFrame());
    }

    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.updateStatus('Detenido', false);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
    }

    onResults(results) {
        // Update FPS
        this.updateFPS();
        
        // Setup canvas
        if (!this.ctx) {
            this.ctx = this.canvasElement.getContext('2d');
        }
        
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
        
        if (!this.canvasElement.width || !this.canvasElement.height) {
            return; // Video not ready yet
        }
        
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            // Process eye tracking
            this.processEyeTracking(landmarks);
            
            // Draw visualizations
            if (this.debugMode) {
                this.drawAllLandmarks(landmarks);
            }
            this.drawEyeAnnotations(landmarks);
            this.drawIrisTracking(landmarks);
        } else {
            // No face detected
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.font = '20px Arial';
            this.ctx.fillText('No se detectó rostro', 20, 40);
        }

        this.ctx.restore();
        
        // Update EAR chart
        this.updateEARChart();
    }

    processEyeTracking(landmarks) {
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        // Get eye landmarks
        const leftEye = this.LEFT_EYE.map(idx => landmarks[idx]);
        const rightEye = this.RIGHT_EYE.map(idx => landmarks[idx]);

        // Calculate EAR
        const earLeft = this.calculateEAR(leftEye, width, height);
        const earRight = this.calculateEAR(rightEye, width, height);
        const earAvg = (earLeft + earRight) / 2;

        // Store EAR history
        this.earHistory.push(earAvg);
        if (this.earHistory.length > this.maxEarHistory) {
            this.earHistory.shift();
        }

        // Detect blink
        const isBlinking = this.detectBlink(earAvg);
        if (isBlinking) {
            this.showBlinkAlert();
        }

        // Update EAR display
        document.getElementById('earValue').textContent = earAvg.toFixed(3);

        // Get iris landmarks
        const leftIris = this.LEFT_IRIS.map(idx => landmarks[idx]);
        const rightIris = this.RIGHT_IRIS.map(idx => landmarks[idx]);

        // Calculate gaze
        const leftGaze = this.calculateGazeRatio(leftIris, leftEye, width, height);
        const rightGaze = this.calculateGazeRatio(rightIris, rightEye, width, height);
        const gazePoint = this.estimateGazePoint(leftGaze, rightGaze);

        // Update gaze display
        this.updateGazeIndicator(gazePoint);
        document.getElementById('gazePosition').textContent = 
            `${gazePoint.x}, ${gazePoint.y}`;

        // Calculate pupil size
        const leftPupilSize = this.calculatePupilSize(leftIris, width, height);
        const rightPupilSize = this.calculatePupilSize(rightIris, width, height);
        const avgPupilSize = (leftPupilSize + rightPupilSize) / 2;

        this.pupilSizeHistory.push(avgPupilSize);
        if (this.pupilSizeHistory.length > this.maxPupilHistory) {
            this.pupilSizeHistory.shift();
        }

        const smoothPupilSize = this.pupilSizeHistory.reduce((a, b) => a + b, 0) / 
                                this.pupilSizeHistory.length;
        document.getElementById('pupilSize').textContent = 
            smoothPupilSize.toFixed(1) + ' px';
    }

    calculateEAR(eyeLandmarks, width, height) {
        // Convert normalized coordinates to pixel coordinates
        const points = eyeLandmarks.map(lm => ({
            x: lm.x * width,
            y: lm.y * height
        }));

        // Calculate vertical distances
        const v1 = this.distance(points[1], points[5]);
        const v2 = this.distance(points[2], points[4]);

        // Calculate horizontal distance
        const h = this.distance(points[0], points[3]);

        // Calculate EAR
        const ear = (v1 + v2) / (2.0 * h);
        return ear;
    }

    detectBlink(ear) {
        let isBlinking = false;

        if (ear < this.EAR_THRESHOLD) {
            this.blinkFrameCounter++;
        } else {
            if (this.blinkFrameCounter >= this.BLINK_CONSEC_FRAMES) {
                this.blinkCount++;
                this.lastBlinkTime = Date.now();
                document.getElementById('blinkCount').textContent = this.blinkCount;
                isBlinking = true;
            }
            this.blinkFrameCounter = 0;
        }

        return isBlinking;
    }

    calculateGazeRatio(irisLandmarks, eyeLandmarks, width, height) {
        // Iris center
        const irisCenter = this.getCenter(irisLandmarks, width, height);

        // Eye bounding box
        const eyePoints = eyeLandmarks.map(lm => ({
            x: lm.x * width,
            y: lm.y * height
        }));

        const minX = Math.min(...eyePoints.map(p => p.x));
        const maxX = Math.max(...eyePoints.map(p => p.x));
        const minY = Math.min(...eyePoints.map(p => p.y));
        const maxY = Math.max(...eyePoints.map(p => p.y));

        const eyeWidth = maxX - minX;
        const eyeHeight = maxY - minY;

        if (eyeWidth > 0 && eyeHeight > 0) {
            const horizontalRatio = (irisCenter.x - minX) / eyeWidth;
            const verticalRatio = (irisCenter.y - minY) / eyeHeight;
            return { h: horizontalRatio, v: verticalRatio };
        }

        return { h: 0.5, v: 0.5 };
    }

    estimateGazePoint(leftGaze, rightGaze) {
        // Average both eyes
        let avgH = (leftGaze.h + rightGaze.h) / 2;
        let avgV = (leftGaze.v + rightGaze.v) / 2;

        // Apply smoothing
        this.gazeHistory.push({ h: avgH, v: avgV });
        if (this.gazeHistory.length > this.maxGazeHistory) {
            this.gazeHistory.shift();
        }

        if (this.gazeHistory.length > 0) {
            avgH = this.gazeHistory.reduce((sum, g) => sum + g.h, 0) / this.gazeHistory.length;
            avgV = this.gazeHistory.reduce((sum, g) => sum + g.v, 0) / this.gazeHistory.length;
        }

        // Map to screen coordinates
        const screenX = Math.round(avgH * this.screenWidth);
        const screenY = Math.round(avgV * this.screenHeight);

        return { x: screenX, y: screenY, h: avgH, v: avgV };
    }

    calculatePupilSize(irisLandmarks, width, height) {
        const points = irisLandmarks.map(lm => ({
            x: lm.x * width,
            y: lm.y * height
        }));

        // Calculate diameter as average of horizontal and vertical distances
        const hDist = this.distance(points[0], points[2]);
        const vDist = this.distance(points[1], points[3]);
        const diameter = (hDist + vDist) / 2;

        return diameter;
    }

    drawEyeAnnotations(landmarks) {
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        // Draw left eye contour
        this.drawLandmarkContour(landmarks, this.LEFT_EYE, '#00FF00', width, height);

        // Draw right eye contour
        this.drawLandmarkContour(landmarks, this.RIGHT_EYE, '#00FF00', width, height);
    }

    drawIrisTracking(landmarks) {
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        // Draw iris points
        [...this.LEFT_IRIS, ...this.RIGHT_IRIS].forEach(idx => {
            const lm = landmarks[idx];
            this.ctx.beginPath();
            this.ctx.arc(lm.x * width, lm.y * height, 2, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#FF00FF';
            this.ctx.fill();
        });

        // Draw iris centers with crosshair
        const leftIris = this.LEFT_IRIS.map(idx => landmarks[idx]);
        const rightIris = this.RIGHT_IRIS.map(idx => landmarks[idx]);

        const leftCenter = this.getCenter(leftIris, width, height);
        const rightCenter = this.getCenter(rightIris, width, height);

        this.drawCrosshair(leftCenter.x, leftCenter.y, '#FF0000', 8);
        this.drawCrosshair(rightCenter.x, rightCenter.y, '#FF0000', 8);

        // Draw iris circles
        const leftRadius = this.calculatePupilSize(leftIris, width, height) / 2;
        const rightRadius = this.calculatePupilSize(rightIris, width, height) / 2;

        this.ctx.beginPath();
        this.ctx.arc(leftCenter.x, leftCenter.y, leftRadius, 0, 2 * Math.PI);
        this.ctx.strokeStyle = '#00FFFF';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(rightCenter.x, rightCenter.y, rightRadius, 0, 2 * Math.PI);
        this.ctx.strokeStyle = '#00FFFF';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawAllLandmarks(landmarks) {
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        landmarks.forEach((lm, idx) => {
            this.ctx.beginPath();
            this.ctx.arc(lm.x * width, lm.y * height, 1, 0, 2 * Math.PI);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.fill();
        });
    }

    drawLandmarkContour(landmarks, indices, color, width, height) {
        this.ctx.beginPath();
        indices.forEach((idx, i) => {
            const lm = landmarks[idx];
            const x = lm.x * width;
            const y = lm.y * height;
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        this.ctx.closePath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawCrosshair(x, y, color, size) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        
        // Horizontal line
        this.ctx.beginPath();
        this.ctx.moveTo(x - size, y);
        this.ctx.lineTo(x + size, y);
        this.ctx.stroke();
        
        // Vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - size);
        this.ctx.lineTo(x, y + size);
        this.ctx.stroke();
    }

    updateGazeIndicator(gazePoint) {
        const indicator = document.getElementById('gazeIndicator');
        const point = document.getElementById('gazePoint');
        
        const rect = indicator.getBoundingClientRect();
        const x = gazePoint.h * rect.width;
        const y = gazePoint.v * rect.height;
        
        point.style.left = `${Math.max(0, Math.min(x, rect.width))}px`;
        point.style.top = `${Math.max(0, Math.min(y, rect.height))}px`;
    }

    updateEARChart() {
        const canvas = this.earCanvas;
        const ctx = this.earCtx;
        
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (this.earHistory.length < 2) return;
        
        // Draw threshold line
        const thresholdY = canvas.height - (this.EAR_THRESHOLD * canvas.height / 0.4);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(canvas.width, thresholdY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw EAR curve
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        this.earHistory.forEach((ear, i) => {
            const x = (i / this.earHistory.length) * canvas.width;
            const y = canvas.height - (ear * canvas.height / 0.4);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }

    showBlinkAlert() {
        const alert = document.getElementById('blinkAlert');
        alert.style.display = 'block';
        setTimeout(() => {
            alert.style.display = 'none';
        }, 300);
    }

    updateFPS() {
        this.frameCount++;
        const currentTime = Date.now();
        const elapsed = currentTime - this.lastTime;
        
        if (elapsed >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / elapsed);
            document.getElementById('fpsValue').textContent = this.fps;
            this.frameCount = 0;
            this.lastTime = currentTime;
        }
    }

    updateStatus(text, isActive) {
        document.getElementById('statusText').textContent = text;
        const indicator = document.getElementById('statusIndicator');
        if (isActive) {
            indicator.classList.add('status-active');
            indicator.classList.remove('status-inactive');
        } else {
            indicator.classList.add('status-inactive');
            indicator.classList.remove('status-active');
        }
    }

    getCenter(landmarks, width, height) {
        const x = landmarks.reduce((sum, lm) => sum + lm.x, 0) / landmarks.length * width;
        const y = landmarks.reduce((sum, lm) => sum + lm.y, 0) / landmarks.length * height;
        return { x, y };
    }

    distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }
}

// Global tracker instance
let tracker = null;

// Initialize on page load
window.addEventListener('load', async () => {
    tracker = new IrisTracker();
    const initialized = await tracker.init();
    
    if (!initialized) {
        alert('Error al inicializar MediaPipe. Verifica tu conexión a internet.');
    }
});

// Control functions
async function startTracking() {
    if (tracker) {
        await tracker.start();
    }
}

function stopTracking() {
    if (tracker) {
        tracker.stop();
    }
}

function toggleDebug() {
    if (tracker) {
        tracker.debugMode = !tracker.debugMode;
    }
}

function takeScreenshot() {
    if (!tracker || !tracker.isRunning) {
        alert('Inicia el tracking primero');
        return;
    }
    
    const canvas = document.getElementById('canvasElement');
    const video = document.getElementById('videoElement');
    
    // Create a temporary canvas with video + overlay
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw video (flipped)
    tempCtx.save();
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(video, -tempCanvas.width, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.restore();
    
    // Draw overlay
    tempCtx.drawImage(canvas, 0, 0);
    
    // Download
    const link = document.createElement('a');
    link.download = `iris-tracking-${Date.now()}.png`;
    link.href = tempCanvas.toDataURL();
    link.click();
}
