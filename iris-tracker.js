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
        this.earCtx = this.earCanvas ? this.earCanvas.getContext('2d') : null;
        
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
        
        // Exercise phases
        this.currentPhase = 0; // 0: look left, 1: look right, 2: make circle, 3: final message
        this.phaseCompleted = [false, false, false, false];
        this.circleStartTime = null;
        
        // Left gaze detection (INVERTED: higher value = looking left)
        this.leftGazeThreshold = 0.65;
        this.leftGazeFrames = 0;
        this.leftGazeRequired = 10;
        
        // Right gaze detection (INVERTED: lower value = looking right)
        this.rightGazeThreshold = 0.35;
        this.rightGazeFrames = 0;
        this.rightGazeRequired = 10;
        
        // Circle trail
        this.circleTrailEnabled = false;
        this.trailCanvas = null;
        this.trailCtx = null;
        this.lastTrailPoint = null;
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
            
            // Use preloaded stream if available, otherwise request new one
            if (window.preloadedStream) {
                console.log('Using preloaded webcam stream');
                this.stream = window.preloadedStream;
                window.preloadedStream = null; // Clear it so it's not reused
            } else {
                console.log('Requesting new webcam stream');
                this.stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    }
                });
            }

            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();

            console.log('Camera started');
            
            this.isRunning = true;
            this.updateStatus('Tracking activo', true);
            
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
    }

    onResults(results) {
        // Update FPS
        this.updateFPS();
        
        // Setup canvas
        if (!this.ctx) {
            this.ctx = this.canvasElement.getContext('2d');
        }
        
        // Set canvas dimensions to match video
        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;
        
        if (!videoWidth || !videoHeight) {
            return; // Video not ready yet
        }
        
        // Only resize if needed
        if (this.canvasElement.width !== videoWidth || this.canvasElement.height !== videoHeight) {
            this.canvasElement.width = videoWidth;
            this.canvasElement.height = videoHeight;
        }
        
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            // Process eye tracking
            this.processEyeTracking(landmarks);
            
            // Draw only eye outlines and iris
            this.drawEyeAnnotations(landmarks);
            this.drawIrisTracking(landmarks);
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

        // Detect gaze based on current phase
        this.detectLeftGaze(gazePoint);
        this.detectRightGaze(gazePoint);
        
        // Draw circle trail if enabled
        if (this.circleTrailEnabled) {
            this.addTrailPoint(gazePoint);
        }

        // Update gaze pointer
        this.updateGazeIndicator(gazePoint);

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

        // Draw left eye contour with thicker line
        this.drawLandmarkContour(landmarks, this.LEFT_EYE, '#FFFFFF', width, height, 4);

        // Draw right eye contour with thicker line
        this.drawLandmarkContour(landmarks, this.RIGHT_EYE, '#FFFFFF', width, height, 4);
    }

    drawIrisTracking(landmarks) {
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;

        // Get eye landmarks to check if eyes are open
        const leftEye = this.LEFT_EYE.map(idx => landmarks[idx]);
        const rightEye = this.RIGHT_EYE.map(idx => landmarks[idx]);

        // Calculate EAR for each eye
        const earLeft = this.calculateEAR(leftEye, width, height);
        const earRight = this.calculateEAR(rightEye, width, height);

        // Get iris landmarks
        const leftIris = this.LEFT_IRIS.map(idx => landmarks[idx]);
        const rightIris = this.RIGHT_IRIS.map(idx => landmarks[idx]);

        const leftCenter = this.getCenter(leftIris, width, height);
        const rightCenter = this.getCenter(rightIris, width, height);

        // Calculate iris sizes
        const leftRadius = this.calculatePupilSize(leftIris, width, height) / 2;
        const rightRadius = this.calculatePupilSize(rightIris, width, height) / 2;

        // Only draw left iris if eye is open (EAR above threshold)
        if (earLeft > this.EAR_THRESHOLD) {
            this.ctx.beginPath();
            this.ctx.arc(leftCenter.x, leftCenter.y, leftRadius, 0, 2 * Math.PI);
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();

            // Draw center dot
            this.ctx.beginPath();
            this.ctx.arc(leftCenter.x, leftCenter.y, 5, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fill();
        }

        // Only draw right iris if eye is open (EAR above threshold)
        if (earRight > this.EAR_THRESHOLD) {
            this.ctx.beginPath();
            this.ctx.arc(rightCenter.x, rightCenter.y, rightRadius, 0, 2 * Math.PI);
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();

            // Draw center dot
            this.ctx.beginPath();
            this.ctx.arc(rightCenter.x, rightCenter.y, 5, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fill();
        }
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

    drawLandmarkContour(landmarks, indices, color, width, height, lineWidth = 2) {
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
        this.ctx.lineWidth = lineWidth;
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

    detectLeftGaze(gazePoint) {
        // Only detect in phase 0
        if (this.currentPhase !== 0 || this.phaseCompleted[0]) return;
        
        // Check if user is looking to the left (INVERTED: higher H = left)
        if (gazePoint.h > this.leftGazeThreshold) {
            this.leftGazeFrames++;
            
            // Trigger flash after sustained left gaze
            if (this.leftGazeFrames >= this.leftGazeRequired) {
                this.triggerFlash();
                this.phaseCompleted[0] = true;
                this.leftGazeFrames = 0;
                
                // Move to next phase immediately
                this.advanceToPhase(1);
            }
        } else {
            if (this.leftGazeFrames > 0) {
                this.leftGazeFrames = Math.max(0, this.leftGazeFrames - 2);
            }
        }
    }
    
    detectRightGaze(gazePoint) {
        // Only detect in phase 1
        if (this.currentPhase !== 1 || this.phaseCompleted[1]) return;
        
        // Check if user is looking to the right (INVERTED: lower H = right)
        if (gazePoint.h < this.rightGazeThreshold) {
            this.rightGazeFrames++;
            
            // Trigger flash after sustained right gaze
            if (this.rightGazeFrames >= this.rightGazeRequired) {
                this.triggerFlash();
                this.phaseCompleted[1] = true;
                this.rightGazeFrames = 0;
                
                // Move to next phase immediately
                this.advanceToPhase(2);
            }
        } else {
            if (this.rightGazeFrames > 0) {
                this.rightGazeFrames = Math.max(0, this.rightGazeFrames - 2);
            }
        }
    }
    
    advanceToPhase(phase) {
        this.currentPhase = phase;
        const instructionsOverlay = document.getElementById('instructionsOverlay');
        const instructionText = document.getElementById('instructionText');
        const instructionAction = document.getElementById('instructionAction');
        
        if (!instructionsOverlay || !instructionText) return;
        
        // Show instructions overlay
        instructionsOverlay.classList.add('visible');
        
        if (phase === 1) {
            // Set both texts immediately but hide the action text
            instructionText.textContent = 'GOOD';
            instructionAction.textContent = 'NOW LOOK RIGHT';
            instructionAction.style.opacity = '0';
            
            // Step 2: After 2 seconds, fade in the action text
            setTimeout(() => {
                instructionAction.style.transition = 'opacity 0.5s ease-in';
                instructionAction.style.opacity = '1';
            }, 2000);
            
            // Step 3: Hide after 5 seconds total
            setTimeout(() => {
                instructionsOverlay.classList.remove('visible');
                // Reset for next use
                instructionAction.style.opacity = '1';
            }, 5000);
            
        } else if (phase === 2) {
            // Set both texts immediately but hide the action text
            instructionText.textContent = 'PERFECT';
            instructionAction.textContent = 'NOW DRAW A CIRCLE';
            instructionAction.style.opacity = '0';
            
            // Initialize canvas but don't enable trail yet
            this.initTrailCanvas();
            this.circleStartTime = Date.now();
            
            // Step 2: After 2 seconds, fade in the action text
            setTimeout(() => {
                instructionAction.style.transition = 'opacity 0.5s ease-in';
                instructionAction.style.opacity = '1';
            }, 2000);
            
            // Step 3: Hide after 6 seconds total
            setTimeout(() => {
                instructionsOverlay.classList.remove('visible');
                // Reset for next use
                instructionAction.style.opacity = '1';
            }, 6000);
            
            // Enable circle trail AFTER instruction disappears
            setTimeout(() => {
                this.circleTrailEnabled = true;
                console.log('Circle drawing enabled!');
            }, 6000);
            
            // After 16 seconds total (6s instruction + 10s drawing), show final message
            setTimeout(() => {
                this.showFinalMessage();
            }, 16000);
        }
    }
    
    showFinalMessage() {
        this.currentPhase = 3;
        // Keep circle trail enabled so it continues drawing in background
        // this.circleTrailEnabled = false; // Commented out to keep drawing
        
        const finalMessage = document.getElementById('finalMessage');
        const messageHeader = document.getElementById('messageHeader');
        const messageBody = document.getElementById('messageBody');
        const messageCta = document.getElementById('messageCta');
        
        if (!finalMessage) return;
        
        // Show overlay
        finalMessage.classList.add('visible');
        
        // Step 1: Show "hard, isn't it?" first
        setTimeout(() => {
            if (messageHeader) messageHeader.classList.add('visible');
        }, 800);
        
        // Step 2: Show the presbyopia message after header is visible
        setTimeout(() => {
            if (messageBody) messageBody.classList.add('visible');
        }, 3500);
        
        // Step 3: Show the CTA button much later (give more time to read)
        setTimeout(() => {
            if (messageCta) {
                messageCta.classList.add('visible');
            }
        }, 10000);
    }

    triggerFlash() {
        const flashOverlay = document.getElementById('flashOverlay');
        if (!flashOverlay) return;
        
        // Trigger flash animation (more intense)
        flashOverlay.classList.add('active');
        
        // Remove after animation
        setTimeout(() => {
            flashOverlay.classList.remove('active');
        }, 200);
        
        console.log('Flash triggered!');
    }
    
    initTrailCanvas() {
        this.trailCanvas = document.getElementById('circleTrailCanvas');
        if (!this.trailCanvas) return;
        
        this.trailCanvas.width = window.innerWidth;
        this.trailCanvas.height = window.innerHeight;
        this.trailCtx = this.trailCanvas.getContext('2d');
        
        // Set line style
        this.trailCtx.strokeStyle = 'rgba(100, 180, 255, 0.7)';
        this.trailCtx.lineWidth = 3;
        this.trailCtx.lineCap = 'round';
        this.trailCtx.lineJoin = 'round';
        
        console.log('Trail canvas initialized');
    }
    
    addTrailPoint(gazePoint) {
        if (!this.trailCtx) return;
        
        const currentPoint = { x: gazePoint.x, y: gazePoint.y };
        
        if (this.lastTrailPoint) {
            // Draw line from last point to current point
            this.trailCtx.beginPath();
            this.trailCtx.moveTo(this.lastTrailPoint.x, this.lastTrailPoint.y);
            this.trailCtx.lineTo(currentPoint.x, currentPoint.y);
            this.trailCtx.stroke();
        }
        
        this.lastTrailPoint = currentPoint;
    }

    updateGazeIndicator(gazePoint) {
        const pointer = document.getElementById('gazePointer');
        if (!pointer) return;
        
        // Make pointer visible after app starts
        if (!pointer.classList.contains('visible')) {
            pointer.classList.add('visible');
        }
        
        // Map gaze to screen coordinates
        const screenX = gazePoint.x;
        const screenY = gazePoint.y;
        
        // Update pointer position
        pointer.style.left = `${screenX}px`;
        pointer.style.top = `${screenY}px`;
    }

    updateEARChart() {
        // Lazy initialization of EAR canvas
        if (!this.earCanvas) {
            this.earCanvas = document.getElementById('earCanvas');
        }
        if (!this.earCtx && this.earCanvas) {
            this.earCtx = this.earCanvas.getContext('2d');
        }
        
        const canvas = this.earCanvas;
        const ctx = this.earCtx;
        
        if (!canvas || !ctx) return;
        
        // Get the display size of the canvas
        const displayWidth = canvas.offsetWidth || canvas.clientWidth || 260;
        const displayHeight = canvas.offsetHeight || canvas.clientHeight || 80;
        
        // Set canvas resolution
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (this.earHistory.length < 2) return;
        
        // Draw threshold line (subtle)
        const thresholdY = canvas.height - (this.EAR_THRESHOLD * canvas.height / 0.4);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(canvas.width, thresholdY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw EAR curve
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        this.earHistory.forEach((ear, i) => {
            const x = (i / (this.earHistory.length - 1)) * canvas.width;
            const y = canvas.height - (Math.min(ear, 0.4) * canvas.height / 0.4);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }

    showBlinkAlert() {
        // Silent blink detection - no alerts needed
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
        // Silent status updates - no UI changes needed
        console.log(`Status: ${text} (${isActive ? 'active' : 'inactive'})`);
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
let experienceStarted = false;

// Initialize on page load
window.addEventListener('load', async () => {
    tracker = new IrisTracker();
    const initialized = await tracker.init();
    
    if (!initialized) {
        alert('Error initializing MediaPipe. Check your internet connection.');
    }
});

// Start experience with transitions
async function startExperience() {
    if (experienceStarted) return;
    experienceStarted = true;
    
    // Fade out landing screen
    const landingScreen = document.getElementById('landingScreen');
    landingScreen.classList.add('fade-out');
    
    // Start tracking immediately
    if (tracker) {
        await tracker.start();
    }
    
    // Fade in app container quickly
    const appContainer = document.getElementById('appContainer');
    setTimeout(() => {
        appContainer.classList.add('visible');
    }, 300);
    
    // Show dashboard after 1 second
    setTimeout(() => {
        const dashboard = document.getElementById('dashboard');
        dashboard.classList.add('visible');
    }, 1000);
    
    // Show gaze pointer after 1.5 seconds (after dashboard appears)
    setTimeout(() => {
        const pointer = document.getElementById('gazePointer');
        if (pointer) {
            pointer.classList.add('visible');
        }
    }, 1500);
    
    // Show "Let's start the exercises" after 6 seconds (4 seconds more to play with tracking)
    setTimeout(() => {
        const instructions = document.getElementById('instructionsOverlay');
        const instructionText = document.getElementById('instructionText');
        const instructionAction = document.getElementById('instructionAction');
        
        if (instructions && instructionText) {
            instructionText.textContent = "LET'S START THE EXERCISES";
            instructionAction.textContent = '';
            instructions.classList.add('visible');
        }
    }, 6000);
    
    // Hide intro message after 3 more seconds
    setTimeout(() => {
        const instructions = document.getElementById('instructionsOverlay');
        if (instructions) {
            instructions.classList.remove('visible');
        }
    }, 9000);
    
    // Show first instruction "LOOK LEFT" after 9.5 seconds
    setTimeout(() => {
        const instructions = document.getElementById('instructionsOverlay');
        const instructionText = document.getElementById('instructionText');
        const instructionAction = document.getElementById('instructionAction');
        
        if (instructions && instructionText) {
            instructionText.textContent = 'LOOK LEFT';
            instructionAction.textContent = '';
            instructions.classList.add('visible');
        }
    }, 9500);
    
    // Hide first instruction after total 13.5 seconds
    setTimeout(() => {
        const instructions = document.getElementById('instructionsOverlay');
        if (instructions) {
            instructions.classList.remove('visible');
        }
    }, 13500);
}

// Control functions (keeping for potential future use)
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
