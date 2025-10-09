# Fathom MCP Integration

This project integrates Fathom video meetings with the Model Context Protocol (MCP) to enable AI assistants to access your Fathom meeting data.

## Setup Instructions

### Prerequisites

- Node.js installed
- pnpm installed (recommended) or npm
- A Fathom API key

### Installation

1. Clone this repository
2. Install dependencies:

```bash
pnpm install
```

### Configuration

1. Create a `.env` file in the project root with your Fathom API key:

```
FATHOM_API_KEY=your_fathom_api_key_here
```

2. For Cursor IDE integration, create a `.cursor/mcp.json` file with the following content:

```json
{
  "mcpServers": {
    "fathom-mcp": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/your/project/src/index.ts"],
      "env": {
        "FATHOM_API_KEY": "your_fathom_api_key_here"
      }
    }
  }
}
```

Replace `/path/to/your/project` with the absolute path to your project directory.

### Running the Server

To start the MCP server manually:

```bash
pnpm dev
```

## Usage

Once the server is running, you can use the MCP tool to list your Fathom meetings.

## Features

- List all Fathom meetings
- Access meeting details including recording IDs, participants, and timestamps
