import threading
import time
import tkinter as tk
from tkinter import messagebox
import socketio
import os
import builtins
import listener
from display import TaskDisplay
import display

# Redefine print function
inputMonitor = None
oldprint = builtins.print

def custom_print(*args, **kwargs):
    oldprint("mon:", *args, **kwargs, flush=True)

# Replace built-in print with custom print
builtins.print = custom_print



# Global variables
tasks = []
task_index = 0
task_display = None
learn = True


def heartbeat():
    minutes = 0
    while True:
        time.sleep(60)
        minutes += 1
        print(f"Monitor up for {minutes} minutes")




def setupSockets():
    global task_display
    sio = socketio.Client()

    # Get the port from environment variable or use default
    PORT = os.environ.get('PORT', 3000)

    # Connect to the server
   
    @sio.event
    def connect():
        print('Connected to server')
        sio.emit('session?', 'monitor')

    @sio.on('session:')
    def session(session_id):
        print("Session created", session_id)

    @sio.event
    def disconnect():
        print('Disconnected from server')

    @sio.on('calibrate')
    def on_calibrate(data):
        display.load_tasks()
        global task_display

        listener.setCallback(task_display.update_task)
        print('Received calibrate message:', data)
        display.clearFile()
        
        task_display.display_task("calibrate")

    timeout = 1  # Initial timeout
    while True:
        try:
            sio.connect(f'http://localhost:{PORT}')
            break  # Exit loop if connection is successful
        except Exception as e:
            if timeout != 1:
                    print(f"Connection failed: {e}. Retrying in {timeout} seconds...")
            time.sleep(timeout)
            timeout += 1  # Increase timeout for next retry


def main():
    global task_display
   

    inputMonitor = listener.init(None)

    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    heartbeat_thread.start()
    setupSockets()

    task_display = TaskDisplay(inputMonitor)
    task_display.display_task("status")
    
    if task_display.root:
        task_display.root.mainloop()

    print("All tasks completed. Exiting.")

if __name__ == "__main__":
    main()
