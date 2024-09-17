from pynput import keyboard, mouse
from pynput.keyboard import Key, Controller as KeyboardController
from pynput.mouse import Button, Controller as MouseController
from time import sleep
import builtins
import signal  # Add this import
import time  # Add this import
listener = None
# Redefine print function
# oldprint = builtins.print

# def custom_print(*args, **kwargs):
#     oldprint("mon:", *args, **kwargs,flush=True)
    
# builtins.print = custom_print

# Replace built-in print with custom print
class Listener:
    def __init__(self):
        self.Controller = MouseController()
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
            mods.append("ctrl")
        if Key.cmd in self.pressed_keys:
            mods.append("cmd")
        if Key.alt in self.pressed_keys:
            mods.append("alt")
        if Key.shift in self.pressed_keys:
            mods.append("shift")
        return "-".join(mods) + "-" if mods else ""

    def on_key_press(self, key):
        # print("on_key_press", key)
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
                    self.record_action(f"press: {modifier_prefix}{char}")
                    return
            else: #
                char = key.char
            if char:
                if (len(self.pressed_keys) > 1) or (((len(self.pressed_keys) == 1) and not (Key.shift in self.pressed_keys))): 
                    self.flush_string_buffer()
                    modifier_prefix = self.get_modifier_prefix()
                    if Key.shift in self.pressed_keys:
                        char = char.upper()
                    self.record_action(f"press: {modifier_prefix}{char}")
                else:
                    if Key.shift in self.pressed_keys:
                        char = char.upper()
                    self.string_buffer += char
        else:
            modifier_prefix = self.get_modifier_prefix()
            key_name = str(key).split('.')[-1]
            self.flush_string_buffer()
            self.record_action(f"press: {modifier_prefix}{key_name}")

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
            print("Pressed")
            self.click_start_time = time.time()  # Record the time when the button is pressed
            self.click_start_pos = (x, y)  # Record the starting position
        else:
            click_duration = time.time() - self.click_start_time  # Calculate the duration
            if click_duration > 1:  # If the button was held for more than 1 second
                self.record_action(f"drag: {button_name} from {self.click_start_pos} to ({x}, {y}) {click_duration:.1f}")
            else:
                self.record_action(f"click: {button_name} {self.click_start_pos}")  # Record the click action

 

    def record_action(self, action):
        self.recorded_actions.append(action)
        try:
            if self.callback:
                self.callback(action)
        except Exception as e:
            print(f"Error in recording action")
        # print(action)  # Print the action message

def setCallback(callback):
    global listener
    listener.setCallback(callback)

def getListener():
    global listener
    return listener

if not listener:
    listener = Listener()
    listener.start_recording()

if __name__ == "__main__":
    pass
 