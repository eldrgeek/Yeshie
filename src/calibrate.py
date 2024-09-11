from dialogs import Dialog
import tkinter as tk
import listeners
from pynput.mouse import Controller
import listeners


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


    def create_dialog(self):
        frame = super().create_dialog("calibrate")
        
        tk.Label(frame, text="Current Task:", font=("Arial", 12, "bold"), bg='#f0f0f0').pack(pady=(0, 5))
        self.task_label = tk.Label(frame, text=self.tasks[self.task_index], font=("Arial", 20), bg='#f0f0f0', wraplength=280)
        self.task_label.pack(pady=(0, 10))
        
        tk.Button(frame, text="Next Task", command=self.update_task, 
                  bg='blue', fg='black', font=("Arial", 10),
                  activebackground='blue', relief=tk.FLAT).pack(pady=5)

    def update_task(self):
        self.task_index += 1
        
        if self.task_index < len(self.tasks):
            new_task = self.tasks[self.task_index]
            self.task_label.config(text=new_task)
            self.log_action(f"## {new_task}", True)
            print("update task ", self.task_index)
        else:
            self.log_action("All tasks completed")
            self.task_index = 0
            self.close_current_dialog()
            # Here you might want to switch to the Status dialog

    def load_tasks(self):
        try:
            with open("./data/tasks.txt", "r", encoding="utf-8") as f:
                self.tasks = f.read().splitlines()
        except FileNotFoundError:
            print("Error: ./data/tasks.txt not found")

    def on_dialog_close(self):
        super().on_dialog_close()
        self.task_index = 0

    def log_action(self, action):
        try:
            mouse_controller = Controller()
            mouse_x, mouse_y = mouse_controller.position

            if self.messagebox and self.messagebox.winfo_exists():
                msg_x = self.messagebox.winfo_x()
                msg_y = self.messagebox.winfo_y()
                msg_width = self.messagebox.winfo_width()
                msg_height = self.messagebox.winfo_height()
                if msg_x <= mouse_x <= msg_x + msg_width and msg_y <= mouse_y <= msg_y + msg_height:
                    return

            with open("./data/uiactions.txt", "a", encoding="utf-8") as f:
                f.write(action + "\n")
                print("Wrote action", action)
        except Exception as e:
            print(f"Error in log_action: {e}")
        # Here you might want to switch to the Status dialog