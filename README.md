# Figma Token Sync

Bidirectional sync between Figma Variables and GitHub-hosted Style Dictionary tokens.

## Features

- ✅ **GitHub Integration** - Full GitHub API integration with authentication and validation
- ✅ **Configuration Management** - Persistent settings storage with connection testing
- ✅ **Token File Discovery** - Automatic detection of token files using glob patterns
- ✅ **Pull tokens from GitHub** - Fetch Style Dictionary JSON tokens and update Figma variables
- ✅ **Push tokens to GitHub** - Export Figma variables and create a Pull Request with changes
- ✅ **Token Transformation** - Bidirectional conversion between Style Dictionary JSON and Figma Variables
- ✅ **Multiple Token Types** - Support for colors, spacing, typography, and more
- ✅ **Automatic PR Creation** - Creates GitHub PRs with detailed changelogs
- ✅ **Change Detection** - Automatically detects added, modified, and removed tokens
- **Style Dictionary format** - Industry-standard token format
- **Secure** - Uses Personal Access Token with isolated per-user storage

## Setup

### Prerequisites

- Node.js 18+ and npm
- Figma desktop app or browser
- GitHub Personal Access Token with `repo` scope

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/rikis-ATL/figma-token-sync.git
   cd figma-token-sync
   ```

2. Install dependencies:
   ```bash
   cd plugin
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Load in Figma:
   - Open Figma desktop app
   - Go to Menu → Plugins → Development → Import plugin from manifest
   - Select `plugin/manifest.json`

### GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (for private repositories)
   - OR `public_repo` (for public repositories only)
4. Copy the token (you'll need it in the plugin configuration)

## Usage

### Configuration

1. Open the plugin in Figma
2. Enter your GitHub configuration:
   - **Personal Access Token** - Your GitHub PAT
   - **Owner** - GitHub username or organization
   - **Repository** - Repository name
   - **Branch** - Target branch (usually `main` or `master`)
   - **Token File Paths** - Glob patterns for token files (e.g., `tokens/**/*.json`)

3. Click "Test Connection" to verify
4. Click "Save" to store settings

### Pull Flow (GitHub → Figma)

**How it works:**

1. Click "Pull from GitHub → Figma"
2. Plugin discovers token files matching your configured patterns
3. Fetches each token file from GitHub
4. Parses Style Dictionary JSON format
5. Automatically creates variable collections (organized by top-level token key)
6. Creates or updates variables within each collection
7. Converts values to appropriate Figma types (COLOR, FLOAT, STRING, BOOLEAN)
8. Shows detailed success message with counts

**What gets created:**

- Variables are organized into collections (e.g., "Color", "Spacing", "Typography")
- Variable names use slash-separated paths (e.g., "base/blue/500")
- Token comments become variable descriptions
- Existing variables are updated, new ones are created

**Example:**

If you have a token file `tokens/colors.json` with:
```json
{
  "color": {
    "base": {
      "blue": {
        "500": { "value": "#2196f3", "type": "color" }
      }
    }
  }
}
```

This creates:
- Collection: "Color"
- Variable: "base/blue/500" with value #2196f3

### Push Flow (Figma → GitHub)

**How it works:**

1. Click "Push to GitHub ← Figma"
2. Plugin reads all Figma variable collections
3. Transforms variables to Style Dictionary JSON format
4. Creates separate token files per collection (e.g., colors.json, spacing.json)
5. Compares with existing files to generate a changelog
6. Creates a new branch on GitHub (e.g., `figma-tokens-1234567890`)
7. Updates token files on the new branch
8. Creates a Pull Request with detailed changelog
9. Displays PR URL for review and merge

**Pull Request includes:**

- Title with change summary (e.g., "Update design tokens from Figma (15 modified, 3 added)")
- Detailed changelog showing added, modified, and removed tokens
- Collection and variable counts
- Direct link to review and merge

**Example PR Description:**

```
## Summary
This PR updates design tokens exported from Figma variables.
- Collections processed: 3
- Variables processed: 75

## Changes
### ✨ Added (3)
- `color.semantic.info`
- `spacing.component.card`
- `typography.fontWeight.extrabold`

### 🔄 Modified (15)
- `color.base.blue.500`
- `spacing.scale.4`
...
```

## Complete Workflow

### Initial Setup

1. Create token files in your GitHub repository (see [examples/](examples/))
2. Configure the plugin with your GitHub credentials
3. Test the connection

### Pull Tokens from GitHub

1. Click "Pull from GitHub → Figma"
2. Token files are fetched and parsed
3. Variable collections are created/updated in Figma
4. Use variables in your designs

### Make Changes in Figma

1. Update variable values in Figma
2. Add new variables or collections
3. Delete variables as needed

### Push Changes to GitHub

1. Click "Push to GitHub ← Figma"
2. Plugin exports all variables
3. Creates a PR with changes
4. Review the PR on GitHub
5. Merge when ready

### Continuous Sync

- Pull regularly to get latest updates from your team
- Push when you've made changes in Figma
- Use PRs for code review and approval process

## Token Format

The plugin uses [Style Dictionary](https://styledictionary.com/) format:

```json
{
  "color": {
    "primary": {
      "500": {
        "value": "#ff5433",
        "type": "color"
      }
    }
  },
  "spacing": {
    "sm": {
      "value": "8px",
      "type": "dimension"
    }
  }
}
```

### Supported Variable Types

- **COLOR** - RGB/Hex colors
- **FLOAT** - Numbers (spacing, sizing, opacity, etc.)
- **STRING** - Text values
- **BOOLEAN** - True/false values

## Development

### Project Structure

```
figma-token-sync/
├── plugin/
│   ├── src/
│   │   ├── plugin/        # Plugin coordinator (main thread)
│   │   ├── ui/            # React UI (iframe)
│   │   └── shared/        # Shared types
│   ├── manifest.json      # Figma plugin manifest
│   ├── vite.config.ts     # Build configuration
│   └── package.json
└── .github/workflows/     # GitHub Actions (coming soon)
```

### Development Commands

```bash
cd plugin

# Install dependencies
npm install

# Build for production
npm run build

# Watch mode (rebuild on changes)
npm run dev

# Type checking
npm run typecheck
```

### Roadmap

- [x] **Phase 1: Foundation** - Plugin skeleton with UI ✓
- [x] **Phase 2: Configuration & Storage** - GitHub setup with validation ✓
- [x] **Phase 3: Pull Flow** - GitHub → Figma sync ✓
- [x] **Phase 4: Push Flow** - Figma → GitHub with PR creation ✓
- [ ] **Phase 5: GitHub Actions** - Automated validation (Optional)
- [ ] **Phase 6: Polish & Documentation** (Optional)

#### Phase 2 Completed Features
- ✅ GitHub API client with comprehensive error handling
- ✅ Repository and branch validation
- ✅ Token file path discovery and validation
- ✅ Connection testing with detailed feedback
- ✅ Enhanced UI with success/error states
- ✅ Persistent configuration storage

#### Phase 3 Completed Features
- ✅ Figma Variables API wrapper for reading/writing variables
- ✅ Style Dictionary → Figma transformer with type mapping
- ✅ Support for COLOR, FLOAT, STRING, and BOOLEAN variable types
- ✅ Color parsing (hex, rgb, rgba formats)
- ✅ Dimension parsing (px, rem, em units)
- ✅ Automatic collection creation and organization
- ✅ Variable creation and updates
- ✅ Progress feedback during sync
- ✅ Comprehensive error handling
- ✅ Example token files for testing

#### Phase 4 Completed Features
- ✅ Figma → Style Dictionary transformer
- ✅ Automatic color conversion (RGBA → hex)
- ✅ Collection-based file organization
- ✅ GitHub branch creation with timestamps
- ✅ Pull Request creation with GitHub API
- ✅ Change detection (added, modified, removed tokens)
- ✅ Automatic changelog generation
- ✅ PR title and description formatting
- ✅ Multi-file updates in single PR
- ✅ File path mapping from configuration

## Architecture

See [implementation plan](/.claude/plans/memoized-gathering-canyon.md) for detailed architecture and design decisions.

## Contributing

This is currently a personal project. Feel free to open issues or submit PRs.

## License

MIT
