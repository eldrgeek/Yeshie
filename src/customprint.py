# Custom print function to log to a file
import os
import builtins

madeprint = False
def makeCustomPrint(filepath):
    global madeprint
    if madeprint:
        return
    madeprint = True
    import builtins

    if os.path.exists(filepath):
        os.remove(filepath)
    
    oldprint = builtins.print
    
    def custom_print(*args, **kwargs):
        oldprint(*args, flush=True, **kwargs)
        with open(filepath, "a") as f:
            oldprint(*args, file=f, flush=True, **kwargs)
    
    builtins.old_print = oldprint
    builtins.print = custom_print
