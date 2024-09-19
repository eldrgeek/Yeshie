import Cocoa
import Quartz
import time
import psutil
import threading
from typing import Dict, List, Callable
from AppKit import NSWorkspace, NSApplicationActivationPolicyRegular

class WindowMonitor:
    def __init__(self, debug=False):
        self.listeners: Dict[str, Dict[str, Callable]] = {}
        self.current_top_window = None
        self.running = True
        self.lock = threading.Lock()
        self.debug = debug
        self.mouse_listener = None

        if self.debug:
            from pynput import mouse
            self.mouse_listener = mouse.Listener(on_click=self.on_click)
            self.mouse_listener.start()

    def add_listener(self, name: str, options: str, function: Callable):
        with self.lock:
            self.listeners[name] = {"options": options.split(","), "function": function}

    def remove_listener(self, name: str):
        with self.lock:
            if name in self.listeners:
                del self.listeners[name]

    def clear_listeners(self):
        with self.lock:
            self.listeners.clear()

    def top_window(self) -> Dict[str, str]:
        workspace = NSWorkspace.sharedWorkspace()
        active_app = workspace.frontmostApplication()
        
        if active_app is None:
            return {"app": None, "title": None, "pid": None}

        pid = active_app.processIdentifier()
        app_name = active_app.localizedName()

        windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)
        
        for window in windows:
            if window['kCGWindowOwnerPID'] == pid:
                window_title = window.get('kCGWindowName', None)
                return {"app": app_name, "title": window_title, "pid": pid}

        # If no window is found, it might be a menu or system UI element
        return {"app": app_name, "title": "System UI", "pid": pid}

    def all_windows(self) -> List[Dict]:
        windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)
        window_list = []

        for i, window in enumerate(windows):
            pid = window['kCGWindowOwnerPID']
            try:
                ns_running_app = Cocoa.NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
                app_name = ns_running_app.localizedName()
                if app_name is None:
                    app_name = ns_running_app.bundleIdentifier()
                if app_name is None:
                    process = psutil.Process(pid)
                    app_name = process.name()
           
                window_info = {
                    "app": app_name,
                    "title": window.get('kCGWindowName', None),
                    "zOrder": i,
                    "top": window['kCGWindowBounds']['Y'],
                    "left": window['kCGWindowBounds']['X'],
                    "height": window['kCGWindowBounds']['Height'],
                    "width": window['kCGWindowBounds']['Width'],
                    "pid": pid
                }
                window_list.append(window_info)
            except Exception as e:
                pass
                # app_name = "Unknown"
                # print(f"Error getting application name for PID {pid}: {e}")
            

        return window_list

    def findWindow(self, x: int, y: int) -> Dict:
        windows = self.all_windows()
        
        for window in windows:
            if (window['left'] <= x < window['left'] + window['width'] and
                window['top'] <= y < window['top'] + window['height']):
                return window
        return None

    def on_click(self, x, y, button, pressed):
        if pressed:
            window = self.findWindow(x, y)
            if window:
                print(f"Clicked on window: {window}")
            else:
                print(f"Clicked on system UI element at coordinates ({x}, {y})")

    def _check_window_changes(self):
        while self.running:
            new_top_window = self.top_window()
            
            if new_top_window != self.current_top_window:
                self.current_top_window = new_top_window
                self._notify_listeners()

            time.sleep(0.1)  # Reduced sleep time for more responsive detection

    def _notify_listeners(self):
        with self.lock:
            for listener in self.listeners.values():
                if "topwindow" in listener["options"]:
                    listener["function"](self.current_top_window)
                if "allwindows" in listener["options"]:
                    listener["function"](self.all_windows())

    def start(self):
        self.running = True
        thread = threading.Thread(target=self._check_window_changes)
        thread.start()

    def stop(self):
        self.running = False
        if self.mouse_listener:
            self.mouse_listener.stop()

# Usage example:
if __name__ == "__main__":
    import builtins
    oldprint = builtins.print

    def custom_print(*args, **kwargs):
        oldprint("mon:", *args, **kwargs, flush=True)

    builtins.print = custom_print

    def print_top_window(window_info):
        print(f"Top Window Changed: {window_info}")

    def print_all_windows(windows):
        print("All Windows:")
        for window in windows:
            print(f"{window}")

    print("Starting the monitor...")
    monitor = WindowMonitor(debug=True)
    monitor.add_listener("top_listener", "topwindow", print_top_window)
    # monitor.add_listener("all_listener", "allwindows", print_all_windows)
    
    monitor.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        monitor.stop()
        print("Monitoring stopped.")