from dialogs import Dialog
import tkinter as tk
from tkinter import ttk
import listeners
from pynput.mouse import Controller


TASKS_FILE = "./data/tasks.txt"
ACTIONS_FILE = "./data/uiactions.txt"
class Calibrate(Dialog):
    def __init__(self):
        super().__init__()
        self.task_label = None
        self.tasks = []
        self.task_index = 0
        self.load_tasks()
        with open(ACTIONS_FILE, 'w', encoding="utf-8") as f:
            f.write("####start\n")
        self.root = None  # The root is created in create_dialog()
        self.create_dialog()
    def create_dialog(self):
        if self.root is not None:  # If there's an existing root, destroy it first
            self.root.destroy()

        self.root = tk.Tk()
        self.root.title("Calibrate")
        self.root.geometry("400x200")  # Set a larger initial size
        self.root.attributes('-topmost', True)  # Make the window always on top
        
        # Debugging
        print("Creating new Tk instance...")

        # Set the title bar color (light blue)
        self.root.configure(bg='#E6F3FF')
        
        style = ttk.Style()
        style.theme_use('clam')
        
        # Configure colors
        style.configure('TFrame', background='#FAFAFA')  # Very light gray, almost white
        style.configure('TLabel', background='#FAFAFA', foreground='#333333')
        style.configure('TButton', background='#007BFF', foreground='white', font=('Arial', 12, 'bold'),
                        padding=(20, 10))
        style.map('TButton', background=[('active', '#0056b3')])
        
        frame = ttk.Frame(self.root, style='TFrame')
        frame.pack(fill=tk.BOTH, expand=True)
        
        ttk.Label(frame, text="Current Task:", font=("Arial", 14, "bold"), style='TLabel').pack(pady=(20, 10))
        self.task_label = ttk.Label(frame, text=self.tasks[self.task_index], font=("Arial", 18), style='TLabel', wraplength=350)
        self.task_label.pack(pady=(0, 20))
        
        next_button = ttk.Button(frame, text="Next Task", command=self.update_task, style='TButton')
        next_button.pack(pady=20)
        
        self.root.protocol("WM_DELETE_WINDOW", self.on_dialog_close)
        print("STARTING Mainloop")
        listeners.getListener().setCallback(self.update_task)   
        self.root.mainloop()
        print("Started Mainloop closed")

    def update_task(self, action):
        self.task_index += 1

        # Debugging3
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
            self.root.geometry("200x100")  # Resizes the window to 400x300 pixels
            self.task_index = 0
            #self.root.after(10, self.on_dialog_close)  # Schedule closure with after

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
        if self.root:
            self.root.quit()  # Properly exit the Tk main loop
            self.root.destroy()  # Destroy the Tk instance to free resources
            self.root = None  # Reset the root to None
            print("root destroyed")
        print("Dialog closed and Tk instance destroyed")

    def log_action(self, action):
        try:
            mouse_controller = Controller()
            mouse_x, mouse_y = mouse_controller.position

            if self.root and self.root.winfo_exists():
                msg_x = self.root.winfo_x()
                msg_y = self.root.winfo_y()
                msg_width = self.root.winfo_width()
                msg_height = self.root.winfo_height()
                if msg_x <= mouse_x <= msg_x + msg_width and msg_y <= mouse_y <= msg_y + msg_height:
                    return

            with open(ACTIONS_FILE, "a", encoding="utf-8") as f:
                f.write(action + "\n")
                print("Wrote action", action)
        except Exception as e:
            print(f"Error in log_action: {e}")
