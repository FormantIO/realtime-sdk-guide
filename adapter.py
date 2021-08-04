import time
import json
import psutil
import threading

from formant.sdk.agent.v1 import Client as FormantAgentClient

"""
live stream video
show realtime system vitals
send a drawn path
bonus: tts
"""


class Adapter:
    def __init__(self):
        self.fclient = FormantAgentClient(agent_url="unix:///tmp/agent.sock")
        self.fclient.register_custom_data_channel_message_callback(
            self.custom_data_channel_message_callback
        )

        threading.Thread(target=self.send_cpu_core_util_data, daemon=True).start()

    def send_cpu_core_util_data(self):
        while True:
            c = []
            for percentage in psutil.cpu_percent(percpu=True, interval=0.07):
                c.append(percentage)
            self.fclient.send_on_custom_data_channel(
                "vitals", json.dumps(c).encode("utf-8")
            )

    def custom_data_channel_message_callback(self, message):
        if message.channel_name == "path":
            coordinates = json.loads(message.payload)
            print(coordinates)

            # do some computationally intensive calculation
            # so the CPU vitals show feedback
            i = 0
            while i < 50000000:
                i += 1

            print("done processing")
        elif message.channel_name == "textToSpeech":
            import pyttsx3  # optional, requires additional dependencies

            value = message.payload.decode("utf-8")
            print('"' + value + '"')
            engine = pyttsx3.init()
            engine.say(value)
            engine.runAndWait()


if __name__ == "__main__":
    Adapter()
    while True:
        time.sleep(60)
