from dialogs import Dialog
import tkinter as tk

class Status(Dialog):
    def __init__(self):
        super().__init__()

    def create_dialog(self):
        frame = super().create_dialog("status")
        
        status_label = tk.Label(frame, text="Monitoring...", font=("Arial", 20), bg='#f0f0f0')
        status_label.pack(pady=10)

    def on_dialog_close(self):
        super().on_dialog_close()
        # Here you might want to switch to the Calibrate dialog