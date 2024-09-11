import tkinter as tk
from tkinter import messagebox
from pynput.mouse import Controller

class Dialog:
    def __init__(self):
        self.root = None
        self.messagebox = None
        self.current_dialog_type = None

    def create_dialog(self, type):
        if not self.root:
            self.root = tk.Tk()
            self.root.withdraw()
        
        self.messagebox = tk.Toplevel(self.root)
        self.messagebox.protocol("WM_DELETE_WINDOW", self.on_dialog_close)
        
        self.messagebox.title("Tasks" if type == "calibrate" else "Status")
        
        self.messagebox.geometry("500x250")
        self.messagebox.configure(bg='#f0f0f0')
        self.messagebox.attributes('-topmost', True)
        self.messagebox.lift()
    
        frame = tk.Frame(self.messagebox, bg='#ffffff', padx=10, pady=10)
        frame.pack(expand=True, fill='both')
        
        self.current_dialog_type = type
        
        return frame

    def on_dialog_close(self):
        print(f"Dialog of type '{self.current_dialog_type}' was closed")
        self.close_current_dialog()

    def close_current_dialog(self):
        if self.messagebox and self.messagebox.winfo_exists():
            self.messagebox.destroy()
        self.messagebox = None
        self.current_dialog_type = None

    