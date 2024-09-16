from pynput.keyboard import Key, Controller as KeyboardController
from pynput.mouse import Button, Controller as MouseController
import builtins
import time
oldprint = builtins.print

def custom_print(*args, **kwargs):
    oldprint("kb:", *args, **kwargs, flush=True)

# Replace built-in print with custom print
# builtins.print = custom_print

keyboard = KeyboardController()
mouse = MouseController()

def play(messages):

    if isinstance(messages, str):
        messages = messages.split('\n')
    for message in messages:
        playOne(message)
def pressKey(value):
    if len(value) == 1:
        keyboard.press(value)
        keyboard.release(value)
    else:
        key = getattr(Key, value.lower(), value)
        keyboard.press(key)
        keyboard.release(key)

def playOne(message):
    print("PLAY",message)
    if message.startswith("#") or len(message) == 0:    
        return
    time.sleep(1.0)
    parts = message.split(': ')
    action_type = parts[0]
    value = parts[1]

    if action_type == "press":
        if not '-' in value:
            pressKey(value)
        else:
            # It's a key combination
            keys = value.split('-')
            for key in keys[:-1]:
                keyboard.press(getattr(Key, key.lower()))
            last_key = keys[-1]
            pressKey(last_key)
            for key in reversed(keys[:-1]):
                keyboard.release(getattr(Key, key.lower()))
    elif action_type == "type":
        keyboard.type(value)
    elif action_type.startswith("click"):
        button_str, pos = value.split(' ', 1)
        button = getattr(Button, button_str)
        x, y = eval(pos)
        mouse.position = (x, y)
        mouse.click(button)
    elif action_type.startswith("drag:"):
        parts = value.split()
        button_str = parts[0]
        
        # Extract coordinates, removing parentheses and splitting by comma
        from_pos = tuple(map(float, parts[3].strip('()').split(',')))
        to_pos = tuple(map(float, parts[5].strip('()').split(',')))
        
        duration = float(parts[6])

        button = getattr(Button, button_str)
        start_x, start_y = from_pos
        end_x, end_y = to_pos

        # Move to start position
        mouse.position = (start_x, start_y)
        time.sleep(0.1)  # Short pause

        # Press and hold the mouse button
        mouse.press(button)

        # Perform the drag
        steps = 50
        for i in range(1, steps + 1):
            t = i / steps
            current_x = start_x + (end_x - start_x) * t
            current_y = start_y + (end_y - start_y) * t
            mouse.position = (current_x, current_y)
            time.sleep(duration / steps)

        # Release the mouse button
        mouse.release(button)
    time.sleep(0.1)  # Add a small delay between actions

print("Starting the test...")
script = """####start
press: Cmd-Shift-+
## click three dots
click: left (1454.9921875, 852.53125)
## click moment"""
script1 = """####start
press: Cmd-Shift-+
## click three dots
click: left (1454.9921875, 852.53125)
## click moment
click: left (1329.41015625, 643.0859375)
## click speed change
click: left (1393.41796875, 842.54296875)
## click zoom out
click: left (1391.1328125, 840.06640625)
## click zoom in
click: left (1210.09375, 843.60546875)
## drag right
drag: left from (712.40234375, 910.97265625) to (1052.02734375, 889.43359375) 1.6
## drag left
drag: left from (837.734375, 926.05078125) to (510.703125, 909.89453125) 1.2
## click timeline
click: left (635.33203125, 892.08984375)
## press delete
press: BACKSPACE
## click confirm
click: left (835.04296875, 314.9921875)
## press ESC
press: ESC
"""
def test():
    print("PLAY")
    play(script)

if __name__ == "__main__":
    print("Starting the test...")
    print("Test complete.")
print("loaded")