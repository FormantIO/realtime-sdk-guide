import React, { Component } from "react";
import "./App.css";
import { RtcClient, SignalingPromiseClient } from "@formant/realtime-sdk";

const formantApiUrl = "https://api-dev.formant.io";
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder("utf-8");

// This app is meant to run as a custom web view in Formant
// with url e.g. http://localhost:3000/?auth={auth}&device={device_id}
class App extends Component {
    constructor() {
        super();
        this.deviceId = new URLSearchParams(window.location.search).get(
            "device"
        );

        this.path = [];
        this.isPathMouseDown = false;
        this.pathChannel = undefined;
        this.pathCanvas = undefined;

        this.cores = [];
        this.coresChannel = undefined;
        this.coresCanvas = undefined;

        this.textToSpeechChannel = undefined;
        this.textToSpeechValue = undefined;
        this.textToSpeechInput = undefined;
    }

    async componentDidMount() {
        // Create an instance of the real-time communication client
        const rtcClient = new RtcClient({
            signalingClient: new SignalingPromiseClient(formantApiUrl),
            getToken: () =>
                new URLSearchParams(window.location.search).get("auth"),
            receive: (peerId, message) =>
                this.receiveRtcMessage(peerId, message),
        });

        // while (!rtcClient.isReady()) {
        //   console.log("Waiting for RTC client to initialize...")
        //   await delay(100);
        // }
        await delay(500); // TODO: update to latest realtime-sdk version and uncomment

        // Each online device and user has a peer in the system
        const peers = await rtcClient.getPeers();
        console.log(peers);

        // Find the device peer corresponding to the device's ID
        const devicePeer = peers.find((_) => _.deviceId !== undefined);
        if (!devicePeer) {
            // If the device is offline, we won't be able to find its peer.
            console.log("Failed to find device peer.");
            return;
        }

        // We can connect our real-time communication client to device peers by their ID
        const devicePeerId = devicePeer.id;
        await rtcClient.connect(devicePeerId);

        // WebRTC requires a signaling phase when forming a new connection.
        // Wait for the signaling process to complete...
        while (rtcClient.getConnectionStatus(devicePeerId) !== "connected") {
            await delay(100);
            console.log("Waiting for connection ...");
        }

        // Create a custom data channel to the device peer with a
        // channel name, settings, and handlers.
        // The device-side application can send and receive messages
        // on this channel using the agent API.
        rtcClient.createCustomDataChannel(
            devicePeerId, // device peer to open the channel with
            "path", // channel name
            { ordered: true }, // channel settings
            true, // use binary data format
            (_, channel) => {
                this.pathChannel = channel;
                channel.onopen = () => {
                    console.log("Path channel opened.");
                };
            }
        );

        rtcClient.createCustomDataChannel(
            devicePeerId, // device peer to open the channel with
            "cores", // channel name
            { ordered: false, maxRetransmits: 0 }, // channel settings
            true, // use binary data format
            (_, channel) => {
                this.coresChannel = channel;
                channel.onopen = () => {
                    console.log("Cores channel opened.");
                };
                // Set the onmessage handler to handle data sent from the device.
                channel.onmessage = (event) => this.onCoresChannelEvent(event);
            }
        );

        rtcClient.createCustomDataChannel(
            devicePeerId, // device peer to open the channel with
            "textToSpeech", // channel name
            { ordered: true }, // channel settings
            true, // use binary data format
            (_, channel) => {
                this.textToSpeechChannel = channel;
                channel.onopen = () => {
                    console.log("Text-to-speech channel opened.");
                };
            }
        );

        this.resetPathCanvas();
    }

    // Path Control methods

    resetPathCanvas() {
        const canvas = this.pathCanvas;
        if (canvas) {
            drawPathControlBackground(canvas);
        }
    }

    onPathMouseDown(event) {
        this.isPathMouseDown = true;
        const { pathCanvas } = this;
        if (pathCanvas) {
            const { x, y } = getCoordinates(event);
            this.path = [{ x, y }];
            drawPathStart(pathCanvas, x, y);
        }
    }

    onPathMouseMove(event) {
        const { isPathMouseDown, pathCanvas } = this;
        if (pathCanvas && isPathMouseDown) {
            const { x, y } = getCoordinates(event);
            this.path.push({ x, y });
            drawPath(pathCanvas, x, y, this.path);
        }
    }

    onPathMouseUp() {
        const { pathCanvas, pathChannel } = this;
        if (pathCanvas && pathChannel) {
            this.isPathMouseDown = false;
            for (let i = 0; i < this.path.length; i++) {
                this.path[i].x = this.path[i].x / this.pathCanvas.width;
                this.path[i].y = this.path[i].y / this.pathCanvas.height;
            }
            this.pathChannel.send(encoder.encode(JSON.stringify(this.path)));
            this.path = [];
            this.resetPathCanvas();
        }
    }

    // Core Visualization methods

    onCoresChannelEvent(event) {
        try {
            const encoded = decoder.decode(event.data);
            this.cores = JSON.parse(encoded);
            const { coresCanvas } = this;
            if (coresCanvas) {
                drawCoresVisualization(coresCanvas);
            }
        } catch {
            console.log("Error decoding data channel event");
        }
    }

    // Text-to-speech methods

    onTextToSpeechKeypress(event) {
        const { textToSpeechChannel, textToSpeechInput } = this;
        if (textToSpeechChannel && textToSpeechInput && event.key === "Enter") {
            textToSpeechChannel.send(encoder.encode(textToSpeechInput.value));
            textToSpeechInput.value = "";
        }
    }

    render() {
        this.setPathCanvasRef = (element) => {
            this.pathCanvas = element;
        };

        this.setVitalsCanvasRef = (element) => {
            this.coresCanvas = element;
        };

        this.setTextToSpeechInputRef = (element) => {
            this.textToSpeechInput = element;
        };

        return (
            <div className="App">
                <header className="App-header">
                    <div className="App-element">Path Control</div>
                    <canvas
                        ref={this.setPathCanvasRef}
                        width={640}
                        height={480}
                        onMouseDown={(event) => this.onPathMouseDown(event)}
                        onMouseMove={(event) => this.onPathMouseMove(event)}
                        onMouseUp={(event) => this.onPathMouseUp(event)}
                    />
                    <div className="App-element">CPU Core Utilization</div>
                    <canvas
                        ref={this.setVitalsCanvasRef}
                        width={640}
                        height={120}
                    />
                    <div className="App-element">Text-to-speech</div>
                    <input
                        ref={this.setTextToSpeechInputRef}
                        className="App-input"
                        type="text"
                        placeholder=" >"
                        onKeyPress={(event) =>
                            this.onTextToSpeechKeypress(event)
                        }
                    />
                </header>
            </div>
        );
    }
}

function getCoordinates(event) {
    const bounds = event.target.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    return { x, y };
}

function drawPathControlBackground(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = darkColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = backgroundColor;
    const blockSize = 16;
    for (let i = 0; i < canvas.width / 10; i++) {
        ctx.beginPath();
        if (i % 8 === 0) {
            ctx.lineWidth = 0.64;
        } else {
            ctx.lineWidth = 0.32;
        }
        ctx.moveTo(i * blockSize, 0);
        ctx.lineTo(i * blockSize, canvas.height);
        ctx.stroke();
    }
    for (let j = 0; j < canvas.height / 10; j++) {
        ctx.beginPath();
        if (j % 6 === 0) {
            ctx.lineWidth = 0.64;
        } else {
            ctx.lineWidth = 0.32;
        }
        ctx.moveTo(0, j * blockSize);
        ctx.lineTo(canvas.width, j * blockSize);
        ctx.stroke();
    }
}

function drawPath(canvas, x, y, path) {
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = lightColor;
    ctx.arc(x, y, 1.0, 0, 2 * Math.PI);
    ctx.fill();

    if (this.path.length > 2) {
        const first = this.path[this.path.length - 3];
        const second = this.path[this.path.length - 2];
        const third = this.path[this.path.length - 1];
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.quadraticCurveTo(second.x, second.y, third.x, third.y);
        ctx.stroke();
    }

    ctx.restore();
}

function drawPathStart(canvas, x, y) {
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = lightColor;
    ctx.fillStyle = lightColor;
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawCoresVisualization(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = lightColor;
    const width = canvas.width / this.cores.length;
    for (let i = 0; i < this.cores.length; i++) {
        const height = (this.cores[i] / 100.0) * canvas.height;
        ctx.fillRect(i * width, canvas.height - height, width, canvas.height);
    }
    ctx.restore();
}

const darkColor = "#1C1E2D";
const backgroundColor = "#282C34";
const lightColor = "#1FB7E0";

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export default App;
