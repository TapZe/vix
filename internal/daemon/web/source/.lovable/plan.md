## Vixd Mission Control — Admin View

Build an admin home page styled like getvix.dev (light theme only), with the Vix logo, soft grid background, glassmorphism cards, and a list of connected vixd sessions below the intro.

### Visual design (from vix-website, light only)

- Reuse the design tokens from vix-website's `:root` (light) palette:
  - Inter (body) + JetBrains Mono (code) from Google Fonts
  - Purple primary (`275 97% 69%`), pink accent
  - Near-white background (`0 0% 98%`), dark foreground
  - Utility classes: `glass-card`, `glow`, `bg-grid`, `gradient-text`, `animate-fade-in-up`
- Drop the `.dark` block entirely so the app stays in light mode regardless of system preference. Do not add a `dark` class anywhere.

### Assets to copy from `vix-website`

- `src/assets/logo.svg` → hero logo
- `public/favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`, `site.webmanifest`

### Page layout (`/`)

```text
┌──────────────────────────────────────────────────┐
│              [ Vix logo, large ]                 │
│           Vixd Mission Control                   │  ← hero
│   Monitor and manage your vix daemon sessions    │
│                                                  │
│   ┌─ What is this? ──────────────────────────┐   │
│   │ This is the control center for vixd, the │   │
│   │ background daemon that powers Vix coding │   │
│   │ sessions. From here you can see every    │   │
│   │ active session and its working directory.│   │
│   └──────────────────────────────────────────┘   │
│                                                  │
│   Connected sessions                  3 active   │
│   ┌──────────────────────────────────────────┐   │
│   │ ● session_a1b2  PID 48211                │   │
│   │   ~/code/vix-website                     │   │
│   │   started 14:02 · up 1h 12m              │   │
│   ├──────────────────────────────────────────┤   │
│   │ ● session_c3d4  PID 48902                │   │
│   │   ~/work/api-server                      │   │
│   │   started 13:40 · up 1h 34m              │   │
│   └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

### Session card content

Each session row is a `glass-card` showing:
- Session ID (short, monospace) and PID
- Working directory (monospace, truncated with tooltip on overflow)
- Started-at timestamp + live "up Xh Ym" uptime that ticks every second
- Subtle pulsing dot indicating it's connected

Empty state: a centered glass card saying "No sessions connected" with a hint that vixd will appear here once running.

### Mock data

Hardcode 3–4 sample sessions in `src/data/sessions.ts`:

```ts
type VixdSession = {
  id: string;        // e.g. "session_a1b2c3"
  pid: number;
  cwd: string;
  startedAt: string; // ISO timestamp
};
```

Uptime is computed from `startedAt` in the component.

### Technical notes

- Replace `src/index.css` with the vix-website light tokens + utilities (omit the `.dark` block).
- Add Inter + JetBrains Mono via the Google Fonts import in `index.css`.
- Update `tailwind.config.ts` font families to `Inter` (sans) and `JetBrains Mono` (mono).
- Replace `src/pages/Index.tsx` with the admin home composed of:
  - `<HeroIntro />` — logo, title, mission statement card
  - `<SessionsList />` — header + `<SessionCard />` rows
- New components under `src/components/admin/`: `HeroIntro.tsx`, `SessionsList.tsx`, `SessionCard.tsx`.
- Update `<title>` and meta description in `index.html` to "Vixd Mission Control" and swap favicon links to the copied set.
- No backend wiring; sessions come from the mock module so swapping for a real `useQuery` later is a one-line change.
