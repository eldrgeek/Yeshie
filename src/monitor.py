import threading
import time
import tkinter as tk
from tkinter import messagebox
import socketio
import os
import builtins
import listeners
from display import TaskDisplay
import display
import calibrate

# Redefine print function
listener = None
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

# Global flag for calibration dialog
calibrate_dialog_flag = False

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
        global calibrate_dialog_flag
        calibrate_dialog_flag = True  # Set the flag to indicate calibration is requested
        print('Received calibrate message:', data)
      
        
        # task_display.display_task("calibrate")

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
    global calibrate_dialog_flag
    listener = listeners.init(None)

    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    heartbeat_thread.start()
    setupSockets()

    # Keep the main thread alive
    try:
        while True:
            if calibrate_dialog_flag:
                show_calibrate_dialog()  # Call the new method to show the dialog
            time.sleep(1)  # Sleep to prevent busy waiting
    except KeyboardInterrupt:
        print("Shutting down...")  # Graceful shutdown message

    print("All tasks completed. Exiting.")

def show_calibrate_dialog():
    ## This has to happen in the main thread
    global calibrate_dialog_flag
    calibrate_dialog_flag = False
    calibrate.Calibrate()
    print("will not return until mainloop closes")
    # calibrate_instance.create_dialog()
    # del calibrate_instance  # Ensure the instance is deleted after dialog closes
  

if __name__ == "__main__":
    main()
