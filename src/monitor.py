# monitor.py
## import libraries
import threading
import time
import tkinter as tk
import socketio
import os
import builtins
## import modules
import calibrate
import rewind
import controller
# Redefine print function
listener = None
oldprint = builtins.print




class Application:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()  # Hide the main window
        self.action = False
        self.sio = socketio.Client()
        self.requestorSessionId = None
        self.setup_sockets()
    def run(self): 
        self.checkCallback()
        self.root.mainloop()

    
    def forward(self, message):
        if self.requestorSessionId:
            message['sessionId'] = self.requestorSessionId  
        self.sio.emit('forward_message', message)

    def setup_sockets(self):
        PORT = os.environ.get('PORT', 3000)

        @self.sio.event
        def connect():
            print('Connected to server')
            self.sio.emit('session?', 'monitor')

        @self.sio.on('session:')
        def session(session_id):
            print("Session created", session_id)

        @self.sio.event
        def disconnect():
            print('Disconnected from server')

        @self.sio.on('calibrate')
        def on_calibrate(data):
            self.requestorSessionId = data.get("")
            print('Received calibrate message:', data)
            self.action = "calibrate"

        @self.sio.on('rewind')
        def on_rewind(data):
            self.requestorSessionId = data.get("sessionId")
            print('Received Rewind message:', data)
            self.action = "rewind"
            rewind.getRewind().setSessionId(data.get("sessionId"))
        # Connect to the server
        timeout = 1
        while True:
            try:
                self.sio.connect(f'http://localhost:{PORT}')
                break
            except Exception as e:
                if timeout != 1:
                    print(f"Connection failed: {e}. Retrying in {timeout} seconds...")
                time.sleep(timeout)
                timeout += 1

    def checkCallback(self):
        if self.action == "calibrate":
            self.action = ""
            print("CALIBRATING")
            cal = calibrate.Calibrate(self.root)
            cal.create_dialog()
        if self.action == "rewind":
            self.action = ""
            rewind.doRewind()
        if self.action == "test":
            self.action = ""
            # Uncomment this linie to test controller
            # controller.test()
            rewind.doRewind()
        self.root.after(1000, self.checkCallback)  # Check every second

    def show_calibrate_dialog(self):
        self.action = ""
        cal = calibrate.Calibrate(self.root)
        cal.create_dialog()

 
def heartbeat():
    minutes = 0
    while True:
        time.sleep(60)
        minutes += 1
        print(f"Monitor up for {minutes} minutes")

def forward(message):
    global app
    app.forward(message)

def main():
    def custom_print(*args, **kwargs):
        oldprint("mon:", *args, **kwargs, flush=True)
    builtins.print = custom_print
    global app
    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    heartbeat_thread.start()

    app = Application()
    app.action = "test"
    app.run()
if __name__ == "__main__":
    main()