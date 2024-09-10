import tkinter as tk
from tkinter import messagebox
import listener
# File paths
TASKS_FILE = "./data/tasks.txt"
ACTIONS_FILE = "./data/uiactions.txt"
task_index = 0
inputMonitor = None
def log_action(action, check=True):
    global task_display
    global inputMonitor
    try:
        # Get current mouse position
        mouse_controller = inputMonitor.Controller
        mouse_x, mouse_y = mouse_controller.position

        # Check if the mouse is within the messagebox region
        if check and task_display.messagebox and task_display.messagebox.winfo_exists():
            msg_x = task_display.messagebox.winfo_x()
            msg_y = task_display.messagebox.winfo_y()
            msg_width = task_display.messagebox.winfo_width()
            msg_height = task_display.messagebox.winfo_height()
            if msg_x <= mouse_x <= msg_x + msg_width and msg_y <= mouse_y <= msg_y + msg_height:
                return  # Do not log if within messagebox region

        with open(ACTIONS_FILE, "a", encoding="utf-8") as f:
            f.write(action + "\n")
            print("Wrote action", action)
    except Exception as e:
        print(f"Error in log_action: {e}", False)

class TaskDisplay:
    def __init__(self,monitor):
        inputMonitor = monitor
        self.root = None
        self.messagebox = None
        self.task_label = None
        self.current_dialog_type = None

    def create_dialog(self, type):
        if not self.root:
            self.root = tk.Tk()
            self.root.withdraw()
        
        self.messagebox = tk.Toplevel(self.root)
        self.messagebox.protocol("WM_DELETE_WINDOW", self.on_dialog_close)  # Set the close callback
        
        self.messagebox.title("Tasks" if type == "tasks" else "Status")
        
        self.messagebox.geometry("500x250")
        self.messagebox.configure(bg='#f0f0f0')
        self.messagebox.attributes('-topmost', True)
        self.messagebox.lift()
    
        frame = tk.Frame(self.messagebox, bg='#ffffff', padx=10, pady=10)
        frame.pack(expand=True, fill='both')
        
        if type == "calibrate":
            tk.Label(frame, text="Current Task:", font=("Arial", 12, "bold"), bg='#f0f0f0').pack(pady=(0, 5))
            self.task_label = tk.Label(frame, text=tasks[task_index], font=("Arial", 20), bg='#f0f0f0', wraplength=280)
            self.task_label.pack(pady=(0, 10))
            
            tk.Button(frame, text="Next Task", command=self.update_task, 
                      bg='blue', fg='black', font=("Arial", 10),
                      activebackground='blue', relief=tk.FLAT).pack(pady=5)
        else:
            # For "status" type, you might want to add a different label or widget
            status_label = tk.Label(frame, text="Monitoring...", font=("Arial", 20), bg='#f0f0f0')
            status_label.pack(pady=10)

        self.current_dialog_type = type  # Store the current dialog type
    def on_dialog_close(self):
        global timesClosed, task_index
        task_index = 0
        timesClosed += 1  # Corrected variable name
        print(f"Dialog of type '{self.current_dialog_type}' was closed")
        
        dialog_type = self.current_dialog_type
        if dialog_type == "calibrate":
             self.task_label.config("done")
        self.close_current_dialog()
        
      
        if dialog_type == "status":
            self.display_task("calibrate")
        else:
            self.display_task("status")

    def close_current_dialog(self):
        if self.messagebox and self.messagebox.winfo_exists():
            self.messagebox.destroy()
        self.messagebox = None
        self.current_dialog_type = None  # Reset the current dialog type

    def display_task(self, type):
        global task_index
        self.close_current_dialog()
        if type == "calibrate" and task_index < len(tasks):
            self.create_dialog(type)
            log_action(f"## {tasks[task_index]}")
            return True
        elif type == "status":
            self.create_dialog(type)
            return True
        else:
            if self.root:
                self.root.quit()
            return False

    def update_task(self,data):
        global task_index, task_display
        task_display = self
        task_index += 1
        
        if task_index < len(tasks):
            new_task = tasks[task_index]
            self.task_label.config(text=new_task)
            log_action(f"## {new_task}", False)
            print("update task ", task_index)
        else:
            log_action("All tasks completed")
            # self.close_current_dialog()
            task_index = 0
            self.display_task("status")
            listener.setCallback(None)
def load_tasks():
    global tasks
    try:
        with open(TASKS_FILE, "r", encoding="utf-8") as f:
            tasks = f.read().splitlines()
    except FileNotFoundError:
        print(f"Error: {TASKS_FILE} not found")
def clearFile():
    with open(ACTIONS_FILE, 'w', encoding="utf-8") as f:
     f.write("####start\n")