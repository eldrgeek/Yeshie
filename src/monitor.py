# monitor.py
## import libraries
import threading
import time
import tkinter as tk
import socketio
import os
## import modules
import calibrate
import rewind
import llmdebug
import customprint
import llmserver
customprint.makeCustomPrint("out")
# Redefine print function
listener = None

app = None


class Application:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()  # Hide the main window
        self.action = False
        self.sio = socketio.Client()
        self.requestorSessionId = None
        self.setup_sockets()
        
        # Initialize LLM server with proper configuration
        self.llm_server = llmserver.makeServer(self.sio)
        
        try:
            # Initialize CodeStore and process files
            print("\nInitializing CodeStore to process project files...")
            from codeStore import CodeStore
            code_store = CodeStore(".", "test_store")
            documents = code_store.process_project()
            
            # Create/update vector store
            print("\nCreating/updating vector store...")
            import vectorstore
            vector_store_manager = vectorstore.getManager()
            
            # Remove existing store if it exists
            try:
                vector_store_manager.delete_vector_store("test_store")
            except:
                pass
                
            # Create new store and add documents
            vector_store_manager.add_vector_store("test_store", "basic")
            vector_store_manager.add_to_vector_store("test_store", documents)
            
            # Configure query engine
            print("\nConfiguring LLM query engine...")
            self.llm_server.makeQueryEngine({
                "index": "test_store",
                "instructions": "You are an AI assistant helping with code-related questions.",
                "model": "gpt-3.5-turbo"
            })
            print("LLM server initialization complete.")
            
        except Exception as e:
            print(f"Error initializing LLM server: {str(e)}")
            # Initialize with basic configuration if vector store setup fails
            self.llm_server.makeQueryEngine({
                "path": ".",  # Use current directory
                "instructions": "You are an AI assistant helping with code-related questions.",
                "model": "gpt-3.5-turbo"
            })
    def run(self): 
        self.checkCallback()
        
        self.root.mainloop()

    def setup_sockets(self):
        PORT = os.environ.get('PORT', 3000)

        @self.sio.event
        def connect():
            print('Connected to server')
            self.sio.emit('session?', 'monitor')

        @self.sio.on('session:')
        def session(session_id):
            print("Session created", session_id)

        @self.sio.event
        def disconnect():
            print('Disconnected from server')

        @self.sio.on('calibrate')
        def on_calibrate(data):
            self.requestorSessionId = data.get("")
            print('Received calibrate message:', data)
            self.action = "calibrate"
        
        @self.sio.on('llm')
        def on_llm(data):
            conversation_id = None  # Initialize outside try block
            try:
                from_id = data.get("from")  # Use "from" instead of "sessionId"
                content = data.get("content")
                conversation_id = data.get("conversationId")
                
                print(f"Received LLM request from {from_id} with conversation ID '{conversation_id}'")
                
                # Set the conversation ID in the server for the response
                if hasattr(self.llm_server, '_conversation_id'):
                    self.llm_server._conversation_id = conversation_id
                
                # Make the query and get response
                response = self.llm_server.makeQuery(content)
                
                # Forward response back to the client
                if response and self.sio:
                    self.sio.emit("forward", {
                        "to": from_id,
                        "op": "response",
                        "from": "llmserver",
                        "cmd": "append",
                        "request": content,
                        "response": response,
                        "conversationId": conversation_id
                    })
                    print(f"LLM query processed and forwarded. Response length: {len(response)}")
                else:
                    print("No response generated or socket unavailable")
                    
            except Exception as e:
                error_msg = f"Error processing LLM query: {str(e)}"
                print(error_msg)
                if self.sio:
                    self.sio.emit("forward", {
                        "to": from_id,
                        "op": "error",
                        "from": "llmserver",
                        "message": error_msg,
                        "conversationId": conversation_id
                    })
        @self.sio.on('rewind')
        def on_rewind(data):
            self.requestorSessionId = data.get("sessionId")
            print('Received Rewind message:', data)
            self.action = "rewind"
            rewind.getRewind().setSessionId(data.get("sessionId"))
        # Connect to the server
        timeout = 1
        while True:
            try:
                self.sio.connect(f'http://localhost:{PORT}')
                break
            except Exception as e:
                if timeout != 1:
                    print(f"Connection failed: {e}. Retrying in {timeout} seconds...")
                time.sleep(timeout)
                timeout += 1

    def checkCallback(self):
        if self.action == "calibrate":
            self.action = ""
            print("CALIBRATING")
            cal = calibrate.Calibrate(self.root)
            cal.create_dialog()
        if self.action == "rewind":
            self.action = ""
            rewind.doRewind()
        if self.action == "test":
            self.action = ""
            # Uncomment this linie to test controller
            # controller.test()
            rewind.doRewind()
        self.root.after(1000, self.checkCallback)  # Check every second

    def show_calibrate_dialog(self):
        self.action = ""
        cal = calibrate.Calibrate(self.root)
        cal.create_dialog()

 
def heartbeat():
    minutes = 0
    while True:
        time.sleep(60)
        minutes += 1
        print(f"Monitor up for {minutes} minutes")


def main():
    global app
    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    heartbeat_thread.start()

    app = Application()
    app.action = "test"
    app.run()
if __name__ == "__main__":
    main()