# foundry-agent-ts

Simple CLI chat loop with an Microsoft Foundry Project agent.

## Files
- Main entry: [src/index.ts](src/index.ts)
- Config: [tsconfig.json](tsconfig.json)
- Package: [package.json](package.json)
- Environment: [.env](.env)
- Debug config: [.vscode/launch.json](.vscode/launch.json)

## Prerequisites
- Node.js >= 18
- Azure identity available locally (DefaultAzureCredential will use login / environment)
- Microsoft Foundry project resource and AI Agent  
  See [the official documentation](https://learn.microsoft.com/azure/ai-foundry/quickstarts/get-started-code?view=foundry&tabs=python%2Cportal)

Set environment variables in `.env` like [.env.example](.env.example):
```
PROJECT_ENDPOINT=...        # Your project endpoint
AGENT_NAME=...              # Agent name
CONVERSATION_ID=optional    # Existing conversation id (omit to create new)
STREAM_RESPONSE=true        # true for streaming
```

## Install
```sh
npm install
```

## Build
```sh
npm run build
```

## Run (TypeScript via VS Code)
Use the launch config in [.vscode/launch.json](.vscode/launch.json).

## Run (Direct)
```sh
node --env-file .env dist/index.js
```

## Usage
Enter messages at the prompt:
[You]: message
Agent responds streaming if STREAM_RESPONSE=true.

## Notes
- Conversation reuse: set CONVERSATION_ID to continue.
- Streaming controlled by STREAM_RESPONSE in [.env](.env).
