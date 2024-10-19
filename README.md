# Yeshie AI System

Yeshie AI is a collaborative system that integrates a Chrome extension, a React-based client, and a Node.js server with Python components. It provides features for real-time collaboration, AI-assisted tasks, and browser automation.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Running the System](#running-the-system)
5. [Using the System](#using-the-system)
6. [Development](#development)
7. [Troubleshooting](#troubleshooting)
8. [Deployment on Replit](#deployment-on-replit)
9. [Packaging Components](#packaging-components)

## System Requirements

- Node.js (v14 or higher)
- Python (v3.8 or higher)
- Google Chrome browser
- npm or yarn package manager
- pnpm package manager

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/eldrgeek/Yeshie.git
   cd Yeshie
   ```

2. Add the `scripts` directory to your PATH:
   ```bash
   export PATH=$PATH:$(pwd)/scripts
   ```

3. Run the installation script:
   ```bash
   install
   ```

4. Update the `OPENAI_API_KEY` in the `.env` file with your actual API key.

5. Set up the Chrome extension:
   - Open Google Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension` folder from the project

## Configuration

The installation script creates a `.env` file in the root directory with the following variables:
```
OPENAI_API_KEY=your_openai_api_key
PORT=3001
```

## Running the System

To run the entire system, use the following command from the root directory:
```bash
dev dev
```

This command will start the following components:
- Node.js server
- React client
- Python monitor
- Chrome extension in development mode

## Using the System

1. **Chrome Extension**:
   - Click on the Yeshie AI icon in your Chrome browser to open the sidebar
   - Use the sidebar to interact with the AI assistant and perform tasks

2. **Web Client**:
   - Open `http://localhost:3000` in your browser
   - Use the web interface for collaborative editing and AI-assisted tasks

3. **Collaboration**:
   - Share the same session ID with other users to collaborate in real-time
   - Use the "Rewind" feature to review and analyze previous actions

4. **AI Commands**:
   - Type AI commands in the sidebar or web client to perform automated tasks
   - Use natural language to describe the task you want to accomplish

5. **Browser Automation**:
   - Use specific commands to automate browser actions (e.g., navigation, clicking, typing)

## Development

- Server code is located in the `src` directory
- Client code is in the `client` directory
- Chrome extension code is in the `extension` directory

To run individual components:

- Server: `npm run dev:server`
- Client: `npm run dev:client`
- Monitor: `npm run dev:monitor`
- Extension: `npm run dev:extension`

## Troubleshooting

- If you encounter connection issues, ensure all components are running and check the console for error messages
- For extension issues, check the Chrome extension page for any error logs
- If AI features are not working, verify your OpenAI API key in the `.env` file

For more detailed troubleshooting, check the logs in the `out` file generated by the system.

## Deployment on Replit

To deploy the server and web pages (excluding Python components) on Replit:

1. Create a new Repl on Replit and select "Node.js" as the language.
2. Upload the server and client code to the Repl.
3. In the Repl's shell, run the following commands:
   ```bash
   npm install
   cd client && npm install && npm run build && cd ..
   ```
4. Create a new file named `.replit` in the root directory with the following content:
   ```
   run = "npm start"
   ```
5. Click the "Run" button to start the server.

Note: Make sure to set up environment variables in the Replit secrets for sensitive information like API keys.

## Packaging Components

### Packaging the Python Monitor

To package the Python monitor and its dependencies as a single file:

1. Install PyInstaller:
   ```bash
   pip install pyinstaller
   ```
2. Run PyInstaller to create a single executable:
   ```bash
   pyinstaller --onefile monitor.py
   ```
3. The packaged executable will be available in the `dist` directory.

### Packaging the Chrome Extension

To package the Chrome extension for distribution:

1. In Chrome, go to `chrome://extensions/`
2. Ensure "Developer mode" is enabled.
3. Click "Pack extension"
4. Select the `extension` directory as the "Extension root directory"
5. Click "Pack Extension"
6. Chrome will create two files: a `.crx` file (the packaged extension) and a `.pem` file (the private key)

### Download Page

Add the following route to your server to serve a download page for the extension and Python monitor:

```javascript
app.get('/download', (req, res) => {
  res.send(`
    <html>
      <head><title>Yeshie AI Downloads</title></head>
      <body>
        <h1>Yeshie AI Downloads</h1>
        <h2>Chrome Extension</h2>
        <p>Download and install the Yeshie AI Chrome extension:</p>
        <a href="/download/extension.crx">Download Extension</a>
        <h2>Python Monitor</h2>
        <p>Download and run the Yeshie AI Python monitor:</p>
        <a href="/download/monitor.exe">Download Monitor</a>
        <h3>Installation Instructions</h3>
        <ol>
          <li>For the Chrome extension:
            <ul>
              <li>Download the .crx file</li>
              <li>Open Chrome and go to chrome://extensions/</li>
              <li>Drag and drop the .crx file into the Chrome window</li>
              <li>Click "Add extension" when prompted</li>
            </ul>
          </li>
          <li>For the Python monitor:
            <ul>
              <li>Download the .exe file</li>
              <li>Run the executable to start the monitor</li>
            </ul>
          </li>
        </ol>
      </body>
    </html>
  `);
});
```

Ensure to place the packaged extension and monitor in the appropriate directories for the server to serve them.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
