# Branding

The app ships unbranded. Everything that names or depicts the product comes from two places:

1. **`src/brand/brand.config.ts`**: the `brand` object.
2. **`public/brand/`**: optional image files. Only files that exist are referenced.

`pnpm audit:brand` fails the build if a logo, icon, favicon or the app name shows up anywhere else.

## 1. Config fields (`src/brand/brand.config.ts`)

| Field | Used for | Default |
|---|---|---|
| `appName` | `<title>`, landing page, app bar, drawer, privacy page, manifest `name`, Drive folder name, default Google Tasks list name | `"Notes"` |
| `shortName` | Manifest `short_name` (home-screen label) | `appName` |
| `description` | Landing hero subtitle, `<meta name="description">`, manifest | generic sentence |
| `themeColor` | `<meta name="theme-color">`, manifest `theme_color` / `background_color` | `#ffffff` |
| `contactUrl` | Contact line on the privacy page | repo URL |

The UI accent colour is separate: users pick it in Settings, and the swatches are in
`src/theme/tokens.ts`.

## 2. Files to drop into `public/brand/` (all optional)

| File | Effect when present |
|---|---|
| `logo.svg` (preferred) or `logo.png` | Shown next to the name in the app bar and on the landing page (height 28–32 px). Use a transparent background. |
| `favicon.ico` | `<link rel="icon" sizes="any">` |
| `favicon.svg` | `<link rel="icon" type="image/svg+xml">`, also a manifest icon |
| `icon-192.png` | Manifest icon, 192×192 |
| `icon-512.png` | Manifest icon, 512×512 (`purpose: any maskable`, so keep a safe zone) |
| `apple-touch-icon.png` | `<link rel="apple-touch-icon">`, 180×180 |

The build (`vite.brand-plugin.ts`) writes the `<head>` tags and `manifest.webmanifest` from whatever
files are there. With none present, the app shows the name as plain text with no logo and no favicon,
and the manifest has no icons.

## 3. Check

```bash
pnpm audit:brand
```

```bash
pnpm build
```

The audit prints which brand files it found and that the built HTML and manifest reference only those.
