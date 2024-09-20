import inspect

def read_line(file_path, line_number):
    try:
        with open(file_path, 'r') as file:
            for current_line_number, line in enumerate(file, start=1):
                if current_line_number == line_number:
                    return line.strip()  # Return the line without leading/trailing spaces
    except FileNotFoundError:
        return f"File not found: {file_path}"
    except Exception as e:
        return f"An error occurred: {e}"

# Usage
file_path = "/Users/MikeWolf/Git/AlphaHelper/src/monitor.py"
line_number = 10  # Example line number
line_content = read_line(file_path, line_number)

def traceback():
    for frame in reversed(inspect.stack()[2:-1]):
        line = read_line(frame.filename, frame.lineno)
        file = frame.filename.split("/")[-1]
        print(file, frame.lineno, line)
