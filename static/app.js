let ws = null;
let audioContext = null;
let mediaStream = null;
let processor = null;

const micBtn = document.getElementById('mic-btn');
const statusEl = document.getElementById('status');
const micText = document.getElementById('mic-text');
const visualizer = document.getElementById('visualizer');

let isConnected = false;
let isRecording = false;

// Audio Playback Queue
let audioQueue = [];
let isPlaying = false;
let nextStartTime = 0;

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

async function connect() {
    initAudioContext();
    
    statusEl.textContent = 'Connecting...';
    
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/audio`;
    
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    
    ws.onopen = async () => {
        isConnected = true;
        statusEl.textContent = 'Connected';
        statusEl.className = 'status connected';
        micText.textContent = 'Click to speak';
        
        // Start microphone automatically when connected
        await startRecording();
    };
    
    ws.onclose = () => {
        isConnected = false;
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'status sleeping';
        micText.textContent = 'Click to Connect';
        stopRecording();
    };
    
    ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
            playAudio(event.data);
            visualizePulse();
        }
    };
}

async function startRecording() {
    if (!isConnected) return;
    
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const source = audioContext.createMediaStreamSource(mediaStream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        processor.onaudioprocess = (e) => {
            if (!isRecording) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Downsample from Context Sample Rate (24000) to 16000 for Gemini
            // Very simple downsampling by taking 2 out of 3 samples
            const outLength = Math.floor(inputData.length * (16000 / audioContext.sampleRate));
            const pcmData = new Int16Array(outLength);
            
            let outIdx = 0;
            for (let i = 0; i < inputData.length; i++) {
                // Approximate downsampling depending on sample rates
                const ratio = 16000 / audioContext.sampleRate;
                if (Math.random() < ratio) { // Simplified for demo, a proper resampler is better but this works for voice
                    let s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[outIdx++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                if (outIdx >= outLength) break;
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(pcmData.buffer);
            }
            
            // Visualize input
            let sum = 0;
            for(let i=0; i<inputData.length; i++) sum += Math.abs(inputData[i]);
            let avg = sum / inputData.length;
            if (avg > 0.05) visualizePulse();
        };
        
        isRecording = true;
        micBtn.classList.add('active');
        micText.textContent = 'Listening...';
        
    } catch (err) {
        console.error("Microphone error:", err);
        alert("Could not access microphone.");
    }
}

function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('active');
    
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

// Playback 24kHz Int16 PCM Data
function playAudio(arrayBuffer) {
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }
    
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    // Gapless playback queuing
    const currentTime = audioContext.currentTime;
    if (nextStartTime < currentTime) {
        nextStartTime = currentTime;
    }
    source.start(nextStartTime);
    nextStartTime += audioBuffer.duration;
}

function visualizePulse() {
    visualizer.classList.add('active');
    setTimeout(() => {
        visualizer.classList.remove('active');
    }, 100);
}

micBtn.addEventListener('click', () => {
    if (!isConnected) {
        connect();
    } else {
        if (isRecording) {
            stopRecording();
            micText.textContent = 'Muted (Click to talk)';
            statusEl.textContent = 'Connected (Muted)';
        } else {
            startRecording();
            statusEl.textContent = 'Connected';
        }
    }
});
