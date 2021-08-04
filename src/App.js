import React, { Component} from 'react';
import './App.css';
import { RtcClient, SignalingPromiseClient } from '@formant/realtime-sdk';

const formantApiUrl = "https://api-dev.formant.io";
const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder('utf-8');

// This app is meant to run as a custom web view in Formant
// with url e.g. http://localhost:3000/?auth={auth}&device={device_id}
class App extends Component {
  constructor() {
    super()
    this.deviceId = new URLSearchParams(window.location.search).get("device");

    this.vitals = []
    this.vitalsChannel = undefined;
    this.vitalsCanvas = undefined;

    this.path = [];
    this.isPathMouseDown = false;
    this.pathChannel = undefined;
    this.pathCanvas = undefined;

    this.textToSpeechChannel = undefined;
    this.textToSpeechValue = undefined;
    this.textToSpeechInput = undefined;
  }

  async componentDidMount() {
    // Create an instance of the real-time communication client
    const rtcClient = new RtcClient({
      signalingClient: new SignalingPromiseClient(formantApiUrl),
      getToken: () => (new URLSearchParams(window.location.search)).get("auth"),
      receive: (peerId, message) => this.receiveRtcMessage(peerId, message),
    });

    // while (!rtcClient.isReady()) {
    //   console.log("Waiting for RTC client to initialize...")
    //   await delay(100);
    // }
    await delay(500); // TODO: update to latest realtime-sdk version and uncomment

    // Each online device and user has a peer in the system
    const peers = await rtcClient.getPeers()
    console.log(peers);

    // Find the device peer corresponding to the device's ID
    const devicePeer = peers.find(_ => _.deviceId !== undefined)
    if (!devicePeer) {
      // If the device is offline, we won't be able to find its peer.
      console.log("Failed to find device peer.")
      return
    }

    // We can connect our real-time communication client to device peers by their ID
    const devicePeerId = devicePeer.id;
    await rtcClient.connect(devicePeerId)

    // WebRTC requires a signaling phase when forming a new connection.
    // Wait for the signaling process to complete...
    while (rtcClient.getConnectionStatus(devicePeerId) !== "connected") {
        await delay(100);
        console.log("Waiting for connection ...")
    }

    // Create a custom data channel to the device peer with a name, settings, and handlers.
    // The device-side application can send and receive messages
    // on this channel using the agent API.
    rtcClient.createCustomDataChannel(
      devicePeerId, // device peer to open the channel with
      "vitals", // channel name
      { ordered: false, maxRetransmits: 0}, // channel settings
      true, // use binary data format
      (_, channel) => {
        this.vitalsChannel = channel;
        channel.onopen = () => {
          console.log("Vitals channel opened.")
        }
        channel.onmessage = (event) => this.onVitalsChannelEvent(event);
      },
    )

    rtcClient.createCustomDataChannel(
      devicePeerId, // device peer to open the channel with
      "path", // channel name
      { ordered: true }, // channel settings
      true, // use binary data format
      (_, channel) => {
        this.pathChannel = channel;
        channel.onopen = () => {
          console.log("Path channel opened.")
        }
      },
    )

    rtcClient.createCustomDataChannel(
      devicePeerId, // device peer to open the channel with
      "textToSpeech", // channel name
      { ordered: true }, // channel settings
      true, // use binary data format
      (_, channel) => {
        this.textToSpeechChannel = channel;
        channel.onopen = () => {
          console.log("Text-to-speech channel opened.")
        }
      },
    )

    this.resetCanvas()
  }

  resetCanvas() {
    const canvas = this.pathCanvas;
    if (canvas) {
      const ctx = this.pathCanvas.getContext("2d");
      ctx.fillStyle = "#1C1E2D"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  onVitalsChannelEvent(event) {
    try {
      const encoded = decoder.decode(event.data);
      this.vitals = JSON.parse(encoded);
      const { vitalsCanvas } = this;
      if (vitalsCanvas) {
        const ctx = vitalsCanvas.getContext("2d");
        ctx.save();
        ctx.globalAlpha = 0.5;

        ctx.fillStyle = "#282C34";
        ctx.fillRect(0, 0, vitalsCanvas.width, vitalsCanvas.height);

        ctx.fillStyle = "#1FB7E0";
        const width = vitalsCanvas.width / this.vitals.length;
        for (let i = 0; i < this.vitals.length; i++) {
          const height = (this.vitals[i] / 100.0) * vitalsCanvas.height;
          ctx.fillRect(i*width, vitalsCanvas.height - height, width, vitalsCanvas.height);
          
        }

        ctx.restore()
      }
    } catch {
      console.log("Error decoding data channel event")
    }
  }

  onPathMouseDown(event) {
    this.isPathMouseDown = true;
    const { pathCanvas } = this;
    if (pathCanvas) {
      const { x, y } = getCoordinates(event)
      this.path = [{x, y}]
      const ctx = this.pathCanvas.getContext("2d");
      ctx.save()
      ctx.beginPath();
      ctx.strokeStyle = "#1FB7E0";
      ctx.fillStyle = "#1FB7E0";
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }

  onPathMouseMove(event) {
    const { isPathMouseDown, pathCanvas } = this;
    if (pathCanvas && isPathMouseDown) {
      const { x, y } = getCoordinates(event)
      this.path.push({ x, y })

      const ctx = pathCanvas.getContext("2d");
      ctx.save()
      ctx.beginPath()
      ctx.fillStyle = "#1FB7E0";
      ctx.arc(x, y, 1.0, 0, 2 * Math.PI);
      ctx.fill()

      if (this.path.length > 2) {
        const first = this.path[this.path.length - 3]
        const second = this.path[this.path.length - 2]
        const third = this.path[this.path.length - 1]
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.beginPath();
        ctx.moveTo(first.x, first.y)
        ctx.quadraticCurveTo(second.x, second.y, third.x, third.y)
        ctx.stroke()
      }

      ctx.restore()
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
      this.pathChannel.send(encoder.encode(JSON.stringify(this.path)))
      this.path = []
      this.resetCanvas()
    }
  }

  onTextToSpeechKeypress(event) {
    const { textToSpeechChannel, textToSpeechInput } = this;
    if (textToSpeechChannel && textToSpeechInput && (event.key === "Enter")) {
      textToSpeechChannel.send(encoder.encode(textToSpeechInput.value));
      textToSpeechInput.value = "";
    }
  }

  render() {
    this.setPathCanvasRef = element => {
      this.pathCanvas = element;
    };

    this.setVitalsCanvasRef = element => {
      this.vitalsCanvas = element;
    };

    this.setTextToSpeechInputRef = element => {
      this.textToSpeechInput = element;
    }
  
    return (
      <div className="App">
        <header className="App-header">
        <div className="App-element">
          Path Control
        </div>
        <canvas
          ref={this.setPathCanvasRef}
          width={640}
          height={480}
          onMouseDown={(event) => this.onPathMouseDown(event)}
          onMouseMove={(event) => this.onPathMouseMove(event)}
          onMouseUp={(event) => this.onPathMouseUp(event)}
        />
        <div className="App-element">
          CPU Core Utilization
        </div>
        <canvas
          ref={this.setVitalsCanvasRef}
          width={640}
          height={120}
        />
        <div className="App-element">
          Text-to-speech
        </div>
        <input
          ref={this.setTextToSpeechInputRef}
          className="App-input"
          type="text"
          placeholder=" >"
          onKeyPress={(event) => this.onTextToSpeechKeypress(event)}
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
  return { x, y }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default App;
