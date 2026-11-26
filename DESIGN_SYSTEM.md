# Design system

Source: Stitch project **Vicinity Local Services Marketplace** → design system "Vicinity Design System". Tokens live in `packages/shared/src/tokens.ts` and are mirrored in `apps/mobile/tailwind.config.js` and `apps/admin/src/app/globals.css`. Do not introduce colours or spacing outside these tokens.

## Tokens

Colours follow the Stitch / Material 3 roles, using the same names in Tailwind: `primary` `#00A896`, `primary-dark` `#006B5F` (text and CTAs on light surfaces), `primary-container`, `secondary-fixed`, `tertiary-fixed`, `surface` `#F8F9FF` (page), `surface-container-lowest/low/…/highest` (chips, inputs, segmented controls), `on-surface` and `on-surface-variant` (text), `outline`, `error` and `error-container`, `amber` (stars), and `whatsapp` / `whatsapp-dark`. Cards are white with no border and a soft shadow (`shadow-card`). Avoid hairline borders; the legacy `line`, `muted` and `card` tokens are kept only for compatibility.

Type: **Plus Jakarta Sans** in weights 400, 600, 700 and 800. Variants: `display` (44) and `display-sm` (32) use ExtraBold for the web hero; `headline-lg/md/sm`, `body-lg/md/sm`, `label-lg/md/sm` and `eyebrow`. Shapes: pills for buttons, inputs and chips; `rounded-3xl` cards; `rounded-panel` (28 px) hero panels and sheets. Shadows: `card`, `soft`, `raised`, `up`, `glow` (primary CTA).

Icons: **Material Symbols Outlined** (weight 400) as SVG, matching Stitch. Every name used in the code is compiled into `ui/icons.generated.ts` by `pnpm --filter @vicinity/mobile icons`; re-run it after using a new icon name. Names missing from Symbols are aliased in `scripts/gen-icons.mjs`, e.g. `expand_more` → `keyboard_arrow_down`. `fill` switches to the filled variant, used for active tabs and stars.

## Components (`apps/mobile/src/components`)

`ui/`: `Txt`, `Icon`, `Button` (primary / brand / soft / tonal / outline / ghost / danger / white / onDark) and `IconButton`, `TextField` / `FormField`, `Segmented`, `Toggle`, `Chip`, `Badge`, `VerifiedBadge`, `TopRatedBadge`, `Rating`, `Stars`, `Distance`, `Thumb` (photo, or a designed tint placeholder), `SectionHeader`, `Card`, `MetaPill`, `Sheet`, `Skeleton`, `EmptyState`, `ErrorState`, `Notice`.

Domain components:

- Layout and navigation: `Screen` (adds the desktop top nav automatically on web ≥1024 px), `AppHeader` (mobile header and desktop top nav), `HubShell` (desktop sidebar for Bookings and Messages), `WebFooter`.
- Discovery: `CategoryGrid` / `CategoryCards`, `ProviderCard` / `ProviderTile`, `ListingCard` / `ListingRow`, `NearbyMap` (street map: MapLibre on web, Apple/Google Maps on phones, with the key-free `RadarMap` as fallback).
- Bookings and chat: `BookingPanel` / `BookingSheet`, `BookingCard`, `ChatThread`, `ConversationList`.
- Everything else: `LocationSheet`, `FilterSheet`, `ContactActions`, `MediaPicker`, `ListingForm`, `ReviewCard`, `ReportSheet`, `EnquirySheet`, `BarChart`.

## Stitch screen mapping

| Stitch screen | Implementation |
|---|---|
| Home Discovery (mobile) | `src/app/(tabs)/index.tsx`: header, search pill, category grid, location banner, Top Rated, Featured, Popular, Near you, Recently added, provider CTA |
| Web Home Discovery | Same route, ≥1024 px: hero with live stats (`/discover/stats`), search panel, category cards, top-rated tiles, map explorer, How it works, footer |
| Search & Results / Web Search & Map Explorer | `src/app/(tabs)/search.tsx`: filter bar, neighbourhood chips, list + radar map split on desktop, Book Now |
| Provider Details / Web Provider Profile & Booking | `src/app/provider/[id]/index.tsx`: mobile Stitch layout; on desktop, a sticky booking panel |
| Categories & Subcategories | `src/app/categories.tsx` (search, sort chips, "Most listed" carousel from live counts, accordion with counts), `src/app/category/[slug].tsx` |
| Notifications | `src/app/(tabs)/notifications.tsx` |
| My Bookings / Web Bookings Dashboard | `src/app/(tabs)/bookings.tsx` with customer and provider modes, plus `src/app/booking/[id].tsx` |
| Chat / Web Messages Hub | `src/app/messages/index.tsx` (on desktop, a split view with the list and the thread) and `src/app/messages/[id].tsx` |

Copy deviations: Stitch claims about escrow, payments and ID vetting are replaced with true statements (payment is made directly to the provider, there is no booking fee, and Verified means the team reviewed the provider's details). Demand figures are replaced with live listing counts.

Screens not in Stitch (auth, onboarding, provider wizard, dashboard pages, organizations, settings, help) reuse the same components and tokens.

## Brand

Sources live in `apps/mobile/assets/brand/` (the designer's SVGs). Run `pnpm --filter @vicinity/mobile brand` after changing them; it regenerates every derived file.

| Where | Artwork |
|---|---|
| App header, desktop nav, footer, hub sidebar, sign-in screens | `Logo`: the **light** small symbol + spaced `VICINITY` wordmark (`#06332E`) |
| Welcome screen (first slide) | `BrandLockup`: the **light** stacked lockup with "Verified local network" |
| iOS / default app icon | Light tile (white → `#E2F6F1`) with the light small symbol, full bleed, no transparency |
| Android adaptive icon | Light symbol foreground in the safe zone, light gradient background, black one-colour mark for themed icons |
| Splash screen | Detailed **light** symbol on white |
| Android notification icon | White one-colour mark (the system tints it) |
| Browser-tab favicon (web + admin) | The designer's favicon kit (built to read on light and dark tabs) |
| Home-screen icons (Apple touch, PWA, maskable) | Same light tile as the native icon |
| Link previews (`og:image`) | Light lockup on white, 1200 × 630 |
| Admin sidebar and login | Light small symbol + `VICINITY` wordmark |

Use the **small** symbol below 64 px (the clock ticks blur) and the detailed one above. `BrandMark`/`Logo`/`BrandLockup` take `tone="dark"` for dark backgrounds (dark artwork, light wordmark).
## Accessibility

44 px+ touch targets for primary actions, labelled icon buttons, `accessibilityRole`/state on toggles, tabs and chips, text never conveyed by colour alone (badges carry text/icons), charts expose their data as text, status colours always come with labels.
