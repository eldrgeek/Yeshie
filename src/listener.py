from pynput import keyboard, mouse
from pynput.keyboard import Key, Controller as KeyboardController
from pynput.mouse import Button, Controller as MouseController
from time import sleep
import builtins
import signal  # Add this import
import time  # Add this import

# Redefine print function
oldprint = builtins.print

def custom_print(*args, **kwargs):
    oldprint("mon:", *args, **kwargs,flush=True)
    
builtins.print = custom_print

# Replace built-in print with custom print
builtins.print = custom_print
class InputRecorder:
    def __init__(self):
        self.recorded_actions = []
        self.pressed_keys = set()
        self.keyboard_listener = None
        self.mouse_listener = None
        self.is_recording = False
        self.string_buffer = ""
        self.callback = None
        self.modifier_keys = {Key.ctrl, Key.cmd, Key.alt, Key.shift}
   
    def setCallback(self,callback):
        self.callback = callback
   
    def start_recording(self):
        self.is_recording = True
        self.keyboard_listener = keyboard.Listener(on_press=self.on_key_press, on_release=self.on_key_release)
        self.mouse_listener = mouse.Listener(on_click=self.on_mouse_click)
        self.keyboard_listener.start()
        self.mouse_listener.start()

    def stop_recording(self):
        self.is_recording = False
        if self.keyboard_listener:
            self.keyboard_listener.stop()
        if self.mouse_listener:
            self.mouse_listener.stop()
        self.flush_string_buffer()

    def flush_string_buffer(self):
        if self.string_buffer:
            self.record_action(f"type: {self.string_buffer}")
            self.string_buffer = ""

    def get_modifier_prefix(self):
        mods = []
        if Key.ctrl in self.pressed_keys:
            mods.append("Ctrl")
        if Key.cmd in self.pressed_keys:
            mods.append("Cmd")
        if Key.alt in self.pressed_keys:
            mods.append("Alt")
        if Key.shift in self.pressed_keys:
            mods.append("Shift")
        return "-".join(mods) + "-" if mods else ""

    def on_key_press(self, key):
        if not self.is_recording:
            return

        if key in self.modifier_keys:
            self.pressed_keys.add(key)
            return

        if isinstance(key, keyboard.KeyCode) or key == Key.space or key == Key.enter:
            if (key == Key.space):
                char = " "
            elif (key == Key.enter):
                char = "↵"
                if(len(self.pressed_keys) > 0):
                    self.flush_string_buffer()
                    modifier_prefix = self.get_modifier_prefix()
                    self.record_action(f"type: {modifier_prefix}{char}")
                    return
            else: #
                char = key.char
            if char:
                if (len(self.pressed_keys) > 1) or (((len(self.pressed_keys) == 1) and not (Key.shift in self.pressed_keys))): 
                    self.flush_string_buffer()
                    modifier_prefix = self.get_modifier_prefix()
                    if Key.shift in self.pressed_keys:
                        char = char.upper()
                    self.record_action(f"type: {modifier_prefix}{char}")
                else:
                    if Key.shift in self.pressed_keys:
                        char = char.upper()
                    self.string_buffer += char
        else:
            modifier_prefix = self.get_modifier_prefix()
            key_name = str(key).split('.')[-1].upper()
            self.flush_string_buffer()
            self.record_action(f"type: {modifier_prefix}{key_name}")

    def on_key_release(self, key):
        if not self.is_recording:
            return
#this is a test
        if key in self.pressed_keys:
            self.pressed_keys.remove(key)

    def on_mouse_click(self, x, y, button, pressed):
        if not self.is_recording:
            return

        self.flush_string_buffer()
        button_name = self.get_modifier_prefix()  + button.name# Get the modified button name
        if pressed:
            self.click_start_time = time.time()  # Record the time when the button is pressed
            self.click_start_pos = (x, y)  # Record the starting position
        else:
            click_duration = time.time() - self.click_start_time  # Calculate the duration
            if click_duration > 1:  # If the button was held for more than 1 second
                self.record_action(f"drag {button_name} from {self.click_start_pos} to ({x}, {y}) {click_duration:.1f}")
            else:
                self.record_action(f"click {button_name} {self.click_start_pos}")  # Record the click action

    def play_back(self):
        keyboard_controller = KeyboardController()
        mouse_controller = MouseController()

        for action in self.recorded_actions:
            parts = action.split(': ')
            action_type = parts[0]
            value = parts[1]

            if action_type == "type":
                if '-' in value:
                    # It's a key combination
                    keys = value.split('-')
                    for key in keys[:-1]:
                        keyboard_controller.press(getattr(Key, key.lower()))
                    last_key = keys[-1]
                    if len(last_key) == 1:
                        keyboard_controller.press(last_key)
                        keyboard_controller.release(last_key)
                    else:
                        last_key = getattr(Key, last_key.lower(), last_key)
                        keyboard_controller.press(last_key)
                        keyboard_controller.release(last_key)
                    for key in reversed(keys[:-1]):
                        keyboard_controller.release(getattr(Key, key.lower()))
                else:
                    # It's a regular string
                    keyboard_controller.type(value)
            elif action_type.startswith("mouse"):
                button_str, pos = value.split(' at ')
                button = getattr(Button, button_str)
                x, y = eval(pos)
                mouse_controller.position = (x, y)
                if "press" in action_type:
                    mouse_controller.press(button)
                else:
                    mouse_controller.release(button)

            sleep(0.1)  # Add a small delay between actions



    def record_action(self, action):
        self.recorded_actions.append(action)
        print(action)  # Print the action message

def init():
   recorder = InputRecorder()
   recorder.start_recording()
   return recorder
# Example usage
if __name__ == "__main__":
    init()
 
# this is a test