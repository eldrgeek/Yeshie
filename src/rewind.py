import listeners
import os
import controller
from controller import play
import re
import pyperclip
import monitor


class Rewind:
    def __init__(self):
        self.actions = self._parse_uiactions()
        self.listener = listeners.getListener()
        self.sessionId = None

    def _parse_uiactions(self):
        actions = {}
        current_key = None
        with open("./data/macbook_uiactions.txt", "r") as file:
            for line in file:
                line = line.strip()
                if line.startswith("##"):
                    current_key = line[2:].strip()
                    actions[current_key] = ""
                else:
                    actions[current_key] = line
        print("actions", actions)
        return actions

    def setSessionId(self, sessionId):
        self.sessionId = sessionId

    def start(self):
        self.listener.setCallback(self.handleMessage)
        controller.playOne("press: esc")

        controller.play("press: cmd-shift-=")

    def handleMessage(self, message):
        print("Message", message)
        if message.startswith("press:"):
            key = message.split(":")[1].strip()
            self._dispatch(key)
        elif message.startswith("click:") or message.startswith("drag:"):
            pass  # Ignore click and drag messages

    def doAction(self, action):
        print("doAction has been called with action:", action)
        if action in self.actions:
            controller.playOne(self.actions[action])

    def _dispatch(self, key):
        dispatcher = {
            "cmd-m": self._captureMoment,
            "right": self._scrubRight,
            "left": self._scrubLeft,
            "up": self._scrubFaster,
            "down": self._scrubSlower,
            "cmd-x": self._exitRewind,
        }
        action = dispatcher.get(key.lower())
        if action:
            print("dispatching", key)
            action()

    def _captureMoment(self):
        print("captureMoment has been called")
        print(self.actions["click three dots"], self.actions["click moment"])
        play([self.actions["click three dots"], self.actions["click moment"]])

        clipboard_content = pyperclip.paste()
        match = re.search(r"timestamp=(\d+\.\d+)", clipboard_content)
        if match:
            timestamp = match.group(1)

            print("forwarding to editor")
            monitor.forward("editor/append", {"timestamp": timestamp})
            monitor.forward("rewind/moment", {"timestamp": timestamp})

    def _scrubRight(self):
        print("scrubRight has been called")
        pass

    def _scrubLeft(self):
        print("scrubLeft has been called")
        pass

    def _scrubFaster(self):
        print("scrubFaster has been called")
        pass

    def _scrubSlower(self):
        print("scrubSlower has been called")
        pass

    def _exitRewind(self):
        play(
            [
                "press: esc"
                # self.actions["press ESC"]
            ]
        )
        print("exitRewind has been called")
        pass

    def stop(self):
        print("stopRewind METHOD has been called")
        self.listener.setCallback(None)


def stopRewind():
    print("stopRewind has been called")
    _rewind_instance.stop()
    pass


_rewind_instance = Rewind()


def getRewind():
    return _rewind_instance


def doRewind():
    print("rewind has been called")
    _rewind_instance.start()
