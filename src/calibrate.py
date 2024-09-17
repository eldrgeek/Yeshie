from dialogs import Dialog
import tkinter as tk
from tkinter import ttk
import listeners
from pynput.mouse import Controller

TASKS_FILE = "./data/tasks.txt"
ACTIONS_FILE = "./data/uiactions.txt"

class Calibrate(Dialog):
    def __init__(self, root):
        super().__init__()
        self.root = root
        self.task_label = None
        self.tasks = []
        self.task_index = 0
        self.load_tasks()
        with open(ACTIONS_FILE, 'w', encoding="utf-8") as f:
            f.write("####start\n")
        self.dialog = None  # The dialog is created in create_dialog()

    def create_dialog(self):
        if self.dialog is not None:  # If there's an existing dialog, destroy it first
            self.dialog.destroy()

        self.dialog = tk.Toplevel(self.root)
        self.dialog.title("Calibrate")
        self.dialog.geometry("400x200")  # Set a larger initial size
        self.dialog.attributes('-topmost', True)  # Make the window always on top
        
        # Debugging
        print("Creating new Toplevel instance...")

        # Set the title bar color (light blue)
        self.dialog.configure(bg='#E6F3FF')
        
        style = ttk.Style()
        style.theme_use('clam')
        
        # Configure colors
        style.configure('TFrame', background='#FAFAFA')  # Very light gray, almost white
        style.configure('TLabel', background='#FAFAFA', foreground='#333333')
        style.configure('TButton', background='#007BFF', foreground='white', font=('Arial', 12, 'bold'),
                        padding=(20, 10))
        style.map('TButton', background=[('active', '#0056b3')])
        
        frame = ttk.Frame(self.dialog, style='TFrame')
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text="Current Task:", font=("Arial", 14, "bold"), style='TLabel').pack(pady=(20, 10))
        self.task_label = ttk.Label(frame, text=self.tasks[self.task_index], font=("Arial", 18), style='TLabel', wraplength=350)
        self.task_label.pack(pady=(0, 20))
        
        next_button = ttk.Button(frame, text="Next Task", command=self.update_task, style='TButton')
        next_button.pack(pady=20)
        
        self.dialog.protocol("WM_DELETE_WINDOW", self.on_dialog_close)
        print("Dialog created")
        listeners.getListener().setCallback(self.update_task)

    def update_task(self, action):
        self.task_index += 1

        # Debugging
        print(f"Updating task, index {self.task_index}")

        if self.task_index < len(self.tasks):
            self.log_action(action)
            new_task = self.tasks[self.task_index]
            self.task_label.config(text=new_task)
            self.log_action(f"## {new_task}")
        else:
            self.log_action("All tasks completed")
            self.task_label.config(text="close the window")
            listeners.getListener().setCallback(None)
            self.dialog.geometry("200x100")  # Resizes the window to 200x100 pixels
            self.task_index = 0
            self.on_dialog_close()

    def load_tasks(self):
        try:
            with open(TASKS_FILE, "r", encoding="utf-8") as f:
                self.tasks = f.read().splitlines()
        except FileNotFoundError:
            print(f"Error: {TASKS_FILE} not found")

    def on_dialog_close(self):
        # Debugging
        print("Closing dialog...")

        self.task_index = 0  # Reset task index when closing the dialog
        if self.dialog:
            self.dialog.destroy()  # Destroy the Toplevel instance to free resources
            self.dialog = None  # Reset the dialog to None
            print("Dialog destroyed")
        print("Dialog closed and Toplevel instance destroyed")
        listeners.getListener().setCallback(None)

    def log_action(self, action):
        try:
            mouse_controller = Controller()
            mouse_x, mouse_y = mouse_controller.position

            if self.dialog and self.dialog.winfo_exists():
                msg_x = self.dialog.winfo_x()
                msg_y = self.dialog.winfo_y()
                msg_width = self.dialog.winfo_width()
                msg_height = self.dialog.winfo_height()
                if msg_x <= mouse_x <= msg_x + msg_width and msg_y <= mouse_y <= msg_y + msg_height:
                    return

            with open(ACTIONS_FILE, "a", encoding="utf-8") as f:
                f.write(action + "\n")
                print("Wrote action", action)
        except Exception as e:
            print(f"Error in log_action: {e}")