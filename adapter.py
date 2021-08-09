import time
import json
import psutil
import threading

from formant.sdk.agent.v1 import Client as FormantAgentClient


class Adapter:
    def __init__(self):
        # Instantiate a Formant agent client so we can use the real-time channel
        self.fclient = FormantAgentClient()

        # Register a listener for real-time data channel messages
        self.fclient.register_custom_data_channel_message_callback(
            self.custom_data_channel_message_callback
        )

        # Sample CPU core utilization at high frequency
        # Send data over a real-time channel named "cores"
        threading.Thread(target=self.send_cpu_core_util_data, daemon=True).start()

    def send_cpu_core_util_data(self):
        while True:
            # Collect the percent utilization of each core, sampled over 0.07 seconds
            c = [p for p in psutil.cpu_percent(percpu=True, interval=0.07)]
            self.fclient.send_on_custom_data_channel(
                "cores", json.dumps(c).encode("utf-8")
            )

    def custom_data_channel_message_callback(self, message):
        # Receive messages on the "path" data channel
        if message.channel_name == "path":
            coordinates = json.loads(message.payload)
            print(coordinates)

            # Do a CPU intensive loop,
            # so the CPU cores visualization shows feedback
            i = 0
            while i < 50000000:
                i += 1

            print("done processing")
        # Receive messages on the "textToSpeech" data channel
        # Speak the received text
        elif message.channel_name == "textToSpeech":
            try:
                import pyttsx3  # optional, requires additional dependencies
            except ImportError:
                print("Text-to-speech not installed.")
                return

            value = message.payload.decode("utf-8")
            print('"' + value + '"')
            engine = pyttsx3.init()
            engine.say(value)
            engine.runAndWait()


if __name__ == "__main__":
    Adapter()
    while True:
        time.sleep(60)
