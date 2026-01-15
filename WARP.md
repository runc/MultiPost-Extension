# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

MultiPost is a browser extension built with Plasmo (Manifest V3) that enables one-click content publishing to 30+ social media platforms including Zhihu, Weibo, Xiaohongshu, Bilibili, X, Instagram, and more. The extension operates in standalone mode without requiring external servers.

## Development Commands

### Basic Commands
```bash
pnpm dev          # Start development server with hot reload
pnpm build        # Build and package extension for production
pnpm package      # Package the extension (run after build)
pnpm lint         # Run Biome linter
pnpm lint:fix     # Auto-fix linting issues
pnpm format       # Format code with Biome
```

### Makefile Commands
```bash
make clean-dev    # Clean dev build and start fresh development
make clean-prod   # Clean production build and create fresh package
```

### Important Development Notes
- **DO NOT** run `pnpm build` during development testing - use `pnpm dev` instead
- The development build outputs to `build/chrome-mv3-dev/`
- The production build outputs to `build/chrome-mv3-prod/` and creates `chrome-mv3-prod.zip`
- Git hooks are configured: pre-commit runs lint-staged, commit-msg runs commitlint (conventional commits)

## Architecture

### Content Type System

The extension handles four content types, each with platform-specific implementations:

1. **Dynamic** (`src/sync/dynamic/`) - Short-form posts (text, images, videos)
2. **Article** (`src/sync/article/`) - Long-form articles with HTML/Markdown
3. **Video** (`src/sync/video/`) - Video uploads with metadata
4. **Podcast** (`src/sync/podcast/`) - Audio content

### Core Data Flow

```
User Input → SyncData → createTabsForPlatforms → Platform Tabs → Inject Scripts → DOM Manipulation
```

**Key Data Structures** (`src/sync/common.ts`):
- `SyncData`: Main payload containing platforms list, content data, and auto-publish flag
- `PlatformInfo`: Platform configuration including inject URL and function
- `DynamicData`, `ArticleData`, `VideoData`, `PodcastData`: Content-specific interfaces

### Platform Integration Pattern

Each platform follows this pattern:

1. **Platform Definition**: Add entry to corresponding InfoMap (e.g., `DynamicInfoMap` in `src/sync/dynamic.ts`)
   ```typescript
   DYNAMIC_PLATFORM_NAME: {
     type: "DYNAMIC",
     name: "DYNAMIC_PLATFORM_NAME",
     homeUrl: "https://...",
     faviconUrl: "https://...",
     platformName: chrome.i18n.getMessage("platformName"),
     injectUrl: "https://...",  // Publishing page URL
     injectFunction: DynamicPlatformName,  // DOM manipulation function
     tags: ["CN" | "International"],
     accountKey: "platform_name",  // Links to account getter
   }
   ```

2. **Inject Function**: Creates platform-specific file in `src/sync/[type]/[platform].ts`
   - Opens publishing page via `injectUrl`
   - Uses DOM manipulation to fill content (text, images, videos)
   - Handles file uploads and form submissions
   - Waits for elements using `waitForElement` pattern
   - Clicks publish button if `data.isAutoPublish` is true

3. **Account Detection**: (Optional) Add account getter in `src/sync/account/[platform].ts` for login detection

4. **i18n**: Add platform name translation keys to `/locales/[locale]/messages.json`

### Extension Components

- **Background** (`src/background/index.ts`): Service worker handling message routing, tab management, API services
  - Message types: `MULTIPOST_EXTENSION_PUBLISH`, `MULTIPOST_EXTENSION_PUBLISH_NOW`, `MULTIPOST_EXTENSION_PLATFORMS`, `MULTIPOST_EXTENSION_GET_ACCOUNT_INFOS`
- **Popup** (`src/popup/`): Extension popup UI - opens Options page on click
- **Options** (`src/options/`): Main content editor with 4 tabs (Dynamic, Article, Video, Podcast)
- **Sidepanel** (`src/sidepanel/`): Side panel interface
- **Content Scripts** (`src/contents/`): Page helpers (`helper/`) and scrapers (`scraper/`)
- **Tabs** (`src/tabs/`): Standalone pages - `publish.tsx` (publish UI), `refresh-accounts.tsx`, `trust-domain.tsx`

### Message Flow Architecture

Background script (`src/background/index.ts`) routes messages between components:
- Extension popup/options → background → creates tabs with platform URLs
- Content scripts injected into platform tabs execute DOM manipulation
- Tab manager tracks publishing status across all opened platform tabs
- Tabs are grouped with title `MultiPost-{timestamp}` for easy management

### Content Scripts

- **Helper Scripts** (`src/contents/helper/`): Provide platform-specific assistance (e.g., Bluesky image upload via postMessage)
- **Scraper Scripts** (`src/contents/scraper/`): Extract content from web pages in Markdown/JSON format

## Tech Stack

- **Framework**: Plasmo 0.90.5 (Manifest V3)
- **UI**: HeroUI + Tailwind CSS (mobile-first responsive design)
- **Icons**: lucide-react (preferred over @iconify/react)
- **Storage**: @plasmohq/storage
- **Linter/Formatter**: Biome (replaces ESLint/Prettier)
- **Package Manager**: pnpm with workspaces

## Code Conventions

### TypeScript
- Use interfaces over types
- Avoid enums - use maps/objects instead
- Use functional components with TypeScript interfaces
- Early returns and guard clauses preferred
- Naming conventions:
  - PascalCase: Components, interfaces (e.g., `UserProfile`, `SyncData`)
  - camelCase: Functions, variables (e.g., `formatDateTime`, `isLoading`)
  - SNAKE_CASE: Constants (e.g., `API_BASE_URL`, `MAX_RETRY_COUNT`)

### Styling (Tailwind CSS)
- Mobile-first responsive design (use `sm:`, `md:`, `lg:` breakpoints)
- Use semantic color variables: `bg-background`, `text-foreground`, `bg-primary-600` (NOT `bg-blue-600`)
- Use `gap` for spacing instead of margins
- Ensure dark mode support with semantic colors

### Internationalization (i18n)
- All UI text must use `chrome.i18n.getMessage('key')`
- Never hardcode display text (console.log statements are exempt)
- Store translations in `/locales/[locale]/messages.json`
- Default locale: `zh_CN`
- Message format:
  ```json
  "key": {
    "message": "Text content",
    "description": "Context for translators"
  }
  ```

### Path Aliases
- Use `~` prefix for imports from `src/`: `import { SyncData } from "~sync/common"`
- Configured in `tsconfig.json` as `"~*": ["./src/*"]`

## File Upload Handling

When working with file uploads in inject functions:
```typescript
// Convert FileData URL to File object
const response = await fetch(file.url);
const blob = await response.blob();
const fileObject = new File([blob], file.name, { type: file.type });

// For video uploads, prefer using videoFile if available
const video = data.data.videoFile || fileObject;
```

## DOM Manipulation Patterns

### Waiting for Elements
```typescript
function waitForElement(selector: string, timeout = 10000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element not found: ${selector}`));
    }, timeout);
  });
}
```

### Triggering Input Events
```typescript
// Set value and trigger React input events
input.value = "content";
input.dispatchEvent(new Event("input", { bubbles: true }));
input.dispatchEvent(new Event("change", { bubbles: true }));
```

## Standalone Mode

The extension operates in **standalone mode** by default (no external server dependency):
- API service is disabled in `src/background/index.ts` (see line 146-148)
- To enable cloud sync: uncomment `starter(1000 * 30);` in background script
- See `STANDALONE_MODE.md` for full details on the architecture change

## Testing New Platforms

When implementing a new platform:
1. Study existing implementations in `src/sync/[type]/` for reference
2. Test DOM selectors in browser DevTools on the target platform
3. Use `pnpm dev` and load unpacked extension to Chrome/Edge
4. Check console logs in both background service worker and content script
5. Verify file uploads work correctly (images/videos)
6. Test auto-publish functionality
7. Add account detection if the platform requires login

## External Recorder Integration

The extension integrates with a separate recorder extension (ID: `ngcainoampabonfpbfeklebaeoolpamm`):
- Uses `chrome.runtime.onConnectExternal` for cross-extension communication
- Video transfer protocol via port named `recorder-bot-video-transfer`
- Handles chunked video data transfer to avoid memory issues

## Important Files to Check

When making changes, be aware of:
- `package.json`: Contains manifest overrides and permissions
- `biome.json`: Linting/formatting rules (line width: 120)
- `tsconfig.json`: Path aliases and compiler options
- `.husky/`: Git hooks for code quality
- `locales/`: All user-facing text must have entries here
