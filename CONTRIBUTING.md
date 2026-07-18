# Contributing to Note It Down

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Running the Application

- **Static local**: Open `index.html` in a browser
- **Local server**: `npm run local` or `npx noteitdown local`
- **MCP server**: `npm run start` or `npx noteitdown`

## Project Structure

- `src/` - TypeScript source files (server, client, database logic)
- `js/` - Compiled JavaScript for the frontend
- `css/` - Stylesheets
- `index.html` - Main web application

## Code Style

- TypeScript: Follow existing patterns in `src/`
- JavaScript: ES6+, use const/let
- CSS: Follow the variables in `css/variables.css`

## Testing

Run tests if available:
```bash
npm test
```

## Submitting Changes

1. Create a branch for your feature or fix
2. Make your changes
3. Submit a Pull Request with a clear description

## Issue Templates

Use the bug report or feature request templates in `.github/ISSUE_TEMPLATE/` when creating issues.