# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Yeshie AI is a collaborative system integrating a Chrome extension, React client, and Node.js server with Python monitoring components. It enables natural language interaction with LLMs through browser automation and real-time collaboration.

## Architecture

### Multi-Component System
- **Root**: Monorepo with pnpm workspaces managing 3 main packages
- **Client**: React/Vite application with collaborative editing (Chakra UI, TipTap, Yjs for real-time collaboration)
- **Extension**: Chrome extension built with Plasmo framework for browser automation 
- **Server**: Node.js/TypeScript server with Python monitoring components
- **Python Core**: AI/ML processing, vector stores, code analysis, and system monitoring

### Key Technologies
- **Frontend**: React 18, Vite, TypeScript, Chakra UI
- **Extension**: Plasmo, Chrome APIs, React
- **Backend**: Node.js, Express, Socket.IO
- **AI/ML**: Python with HuggingFace embeddings (all-MiniLM-L6-v2), vector stores
- **Collaboration**: Yjs, WebRTC, WebSocket for real-time editing
- **Testing**: Vitest (client), Jest (extension), Playwright/CDP for E2E, Python pytest

## Common Development Commands

### Complete System
```bash
# Start entire development environment
pnpm run dev
# Starts: server, client, extension, Python monitor, and message watcher

# Alternative minimal setup
pnpm run devx
# Starts: extension and Windows monitor only
```

### Individual Components
```bash
# Client development
pnpm run dev:client              # Start React dev server
cd client && pnpm run build     # Build for production
cd client && pnpm run test      # Run client tests

# Extension development  
pnpm run dev:extension           # Start Plasmo dev mode with hot reload
cd extension && pnpm run build  # Build extension
cd extension && pnpm run package # Package for distribution

# Server development
pnpm run dev:server              # Start Node.js server with nodemon
pnpm run build:server           # Compile TypeScript

# Python components
pnpm run dev:monitor             # Start Python monitor with auto-reload
pnpm run dev:listener            # Start Python listener
```

### Testing Commands
```bash
# Full test suite
pnpm run test                    # Run all tests (client + Python)

# Component-specific testing
pnpm run test:client             # Client tests with Vitest
pnpm run test:python             # Python test suite

# E2E testing
pnpm run test:minimal            # Minimal E2E tests
pnpm run test:minimal:debug      # E2E tests with browser debugging
pnpm run watch:test-minimal      # Watch mode for E2E tests

# CDP testing for extension
pnpm run test:cdp               # Chrome DevTools Protocol tests
pnpm run test:cdp:watch         # CDP tests in watch mode
pnpm run setup:cdp              # Setup CDP test environment
```

### Python Development Testing
```bash
# Individual component testing
python src/codeStore.py         # Test code processing and gitignore patterns
python src/llmserver.py         # Test LLM server and vector store integration
python src/test_vectorstore.py  # Test vector store operations
python -m pytest src/test_*.py  # Run full Python test suite
```

### Build Commands
```bash
pnpm run build:client           # Build React client for production
pnpm run build:server           # Compile TypeScript server
pnpm run build:repl             # Build both client and server
```

## Development Workflow

### Extension Development
1. Run `pnpm run dev:extension` for hot reload development
2. Load unpacked extension in Chrome from `extension/build/chrome-mv3-dev`
3. Use provided launch scripts:
   - `./extension/launch-chrome-debug.sh` - Chrome with debugging on port 9222
   - `./extension/launch-plasmo-dev.sh` - Plasmo dev mode with hot reload

### Full System Development
1. Set up environment: `export PATH=$PATH:$(pwd)/scripts`
2. Install dependencies: `pnpm install` (root handles workspaces)
3. Configure `.env` file with `OPENAI_API_KEY` and `PORT=3001`
4. Start development: `pnpm run dev`
5. Access client at `http://localhost:3000`
6. Test extension functionality through Chrome

### Python Component Development
Python components are located in `src/` and handle:
- **Code Processing**: `codeStore.py` - Document processing with gitignore respect
- **AI/ML**: `llmserver.py` - LLM integration with vector stores
- **Vector Storage**: `vectorstore.py` - Document embedding and retrieval
- **System Monitoring**: `monitor.py` - Event handling and system monitoring
- **Embedding**: `embedding_model.py` - HuggingFace model management

## Key Configuration Files

### Package Management
- `package.json` - Root workspace configuration
- `client/package.json` - React client dependencies  
- `extension/package.json` - Plasmo extension configuration
- `shared/package.json` - Shared utilities workspace

### TypeScript Configuration
- `tsconfig.json` - Root TypeScript config (excludes client/extension)
- `client/tsconfig.json` - Client-specific config with Vite
- `extension/tsconfig.json` - Extension TypeScript setup

### Testing Setup
- `client/vitest.config.ts` - Client test configuration
- `tests/cdp/` - Chrome DevTools Protocol testing
- `tests/e2e/` - End-to-end testing with Playwright

### Development Tools
- `scripts/dev` - TypeScript-based development environment manager
- `scripts/killports.sh` - Utility to free stuck ports (3000, 3001)
- `.cursor/rules/` - Cursor IDE integration rules

## Project-Specific Rules and Context

### From .cursor/rules/project-guidelines.mdc
- Always reference `.yeshie-context.md` for current project status
- Use Stepper functions for browser automation (see `stepper-documentation.md`)
- Development workflow: code changes → test → capture debug output → verify patterns
- Maintain consistency with existing patterns and implementations
- Document new patterns/selectors discovered
- Use toast notifications for user guidance
- Implement error recovery mechanisms

### From .yeshie-context.md Key Points
- Current focus: LLM Learning Implementation with ChatGPT integration
- Extension uses Plasmo framework with TypeScript
- Recent major cleanup completed (December 2024/January 2025)
- Clean codebase ready for production deployment
- Core CDP testing infrastructure functional
- Bug tracking system in `bugs/` directory with structured documentation

### Extension Architecture
- **Stepper Functionality**: Browser automation system documented in `stepper-documentation.md`
- **Learning Mode**: Ability to learn LLM interface interactions
- **Pro Mode**: Uses open LLM tab instead of direct API calls
- **Message Handling**: Proper async response handling critical for Chrome extension APIs

### Development Best Practices
- TypeScript throughout for type safety
- React functional components with hooks
- Chrome extension APIs for browser integration
- Background scripts for state management
- Content scripts for page interaction
- Clipboard-based debugging output
- Toast notifications for user feedback

## File Structure Highlights

```
.
├── client/              # React client application
├── extension/           # Chrome extension (Plasmo)
├── shared/              # Shared utilities workspace  
├── src/                 # Python core components & Node.js server
├── tests/               # Testing infrastructure
├── scripts/             # Development utilities
├── .cursor/rules/       # Cursor IDE integration rules
└── docs/               # Additional documentation
```

The system supports both collaborative editing and browser automation, with extensive testing infrastructure for Chrome extension development.