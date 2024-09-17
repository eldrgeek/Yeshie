import pyautogui
import builtins
import time

oldprint = builtins.print

def custom_print(*args, **kwargs):
    oldprint("kb:", *args, **kwargs, flush=True)

# Uncomment the following line to replace built-in print with custom print
# builtins.print = custom_print

def translate_key(key):
    pynput_to_pyautogui = {
        'alt_l': 'altleft',
        'alt_r': 'altright',
        'alt_gr': 'altright',
        'caps_lock': 'capslock',
        'cmd': 'command',
        'cmd_l': 'winleft',
        'cmd_r': 'winright',
        'ctrl_l': 'ctrlleft',
        'ctrl_r': 'ctrlright',
        'delete': 'del',
        'esc': 'escape',
        'menu': 'apps',
        'num_lock': 'numlock',
        'page_down': 'pagedown',
        'page_up': 'pageup',
        'print_screen': 'printscreen',
        'scroll_lock': 'scrolllock',
        'shift_l': 'shiftleft',
        'shift_r': 'shiftright'
    }
    return pynput_to_pyautogui.get(key.lower(), key)

def play(messages):
    if isinstance(messages, str):
        messages = messages.split('\n')
    for message in messages:
        playOne(message)

def pressKey(value):
    if len(value) == 1:
        pyautogui.press(value)
    else:
        key = translate_key(value.lower())
        pyautogui.press(key)

def playOne(message):
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
            keys = [translate_key(key) for key in value.split('-')]
            print("PRESSING", keys)
            pyautogui.hotkey(*keys)
    elif action_type == "type":
        print("GOING TO TYPE", value)
        pyautogui.write(value, interval=0.1)
    elif action_type.startswith("click"):
        button_str, pos = value.split(' ', 1)
        x, y = eval(pos)
        print("CLICKING", x, y)
        pyautogui.click(x, y, button=button_str)
    elif action_type.startswith("drag:"):
        parts = value.split()
        button_str = parts[0]
        
        from_pos = tuple(map(float, parts[3].strip('()').split(',')))
        to_pos = tuple(map(float, parts[5].strip('()').split(',')))
        
        duration = float(parts[6])

        start_x, start_y = from_pos
        end_x, end_y = to_pos

        pyautogui.moveTo(start_x, start_y)
        time.sleep(0.1)  # Short pause
        pyautogui.dragTo(end_x, end_y, duration=duration, button=button_str)

    time.sleep(0.1)  # Add a small delay between actions

print("Starting the test...")
script = """####start
press: cmd-shift-=
click: left (1454.9921875, 852.53125)
## click moment
click: left (1329.41015625, 643.0859375)
press: ESC


# """
script1 = """####start
press: cmd-shift-=
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
    pyautogui.press('esc')
    time.sleep(1)
    # pyautogui.hotkey('command','shift','=')
    # time.sleep(1)
    # pyautogui.press('esc')
    # time.sleep(1)
    play(script)
    # time.sle  ep(1)
    # pyautogui.hotkey('command','shift','=')
if __name__ == "__main__":
    print("Starting the test...")
 
    # test()
    print("Test complete.")
