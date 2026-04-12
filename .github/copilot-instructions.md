Purpose
-------
Quick actionable guidance for an AI coding agent to be immediately productive in this repo.

Big picture
-----------
- Frontend: React + Vite (ES modules). Entry at `src/main.jsx` → `src/App.jsx`.
- Styling: Tailwind CSS (see `tailwind.config.js` and `index.css`).
- Data/storage: Supabase (client in `src/lib/supabase.js`). DB schema and migrations live in `supabase/migrations`.
- Server-side logic / integrations: Supabase Edge Functions under `supabase/functions/*` (TypeScript). These implement payment wiring (PIX, card) and webhooks.

How to run (developer workflow)
-------------------------------
- Start dev server: `npm run dev` (Vite).
- Build: `npm run build` and preview with `npm run preview`.
- Tailwind/PostCSS are configured via `postcss.config.js` and `tailwind.config.js`.

Environment & secrets
---------------------
- The frontend expects these env vars (Vite):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- The Supabase client is at `src/lib/supabase.js` and throws if those variables are missing. Use a local `.env` at project root for dev.
- Supabase Edge Functions are called from the frontend via `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/<name>` (see `src/components/CardModal.jsx` and `CardModal` constants).

Key patterns & conventions (concrete)
-----------------------------------
- Data queries use the Supabase JS client directly from the browser. Example: `src/components/ProductGrid.jsx` queries the `produtos` table and expects these columns: `id, nome, preco, codigo_barras, estoque, imagem_url, restrito_idade, destaque`.
- Payment flows are proxied through Supabase Edge Functions (folder: `supabase/functions`). Function names to look at: `criar-cobranca-pix`, `criar-link-cartao`, `verificar-cobranca-cartao`, and a few webhook handlers (see `supabase/functions/*`). Don't call external payment provider APIs directly from the UI; use the edge functions.
- Barcode scanning: logic centralized in `src/hooks/useBarcodeScanner.js`. Components call this hook and handlers must accept two callbacks (on found product, on not found).
- Admin access: triggered in the UI by tapping the logo 5x in `src/App.jsx` (see constant `LOGO_TAPS_ADM`). This pattern is used instead of a route.
- UI is component-driven (files under `src/components`) and React is used with function components + hooks. Keep prop names similar to existing components (e.g., `onAddToCart`, `items`, `onPaymentSuccess`).

Where to change payment behavior
-------------------------------
- Frontend callers: `src/components/CardModal.jsx` (card payments), `src/components/PixModal.jsx` (pix), `src/components/PaymentMethodModal.jsx`.
- Server logic / secrets: Edge functions under `supabase/functions/*` (TypeScript). Changes to external provider credentials happen in the Supabase functions or project env (not in the client).

Database & migrations
---------------------
- Migrations live in `supabase/migrations/*.sql`. When editing models, update SQL migrations accordingly.
- `src/components/ProductGrid.jsx` and other components assume table and column names from these migrations (match names exactly).

Testing / verification tips
--------------------------
- Quick smoke: run `npm run dev`, open UI and search for products → ProductGrid will show highlights and perform Supabase queries. If the client throws about env vars, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- For payment flows, use the local Edge Function emulator (or deploy functions) and point `VITE_SUPABASE_URL` appropriately; frontend calls functions via `${VITE_SUPABASE_URL}/functions/v1/<name>`.

Small actionable examples for AI edits
------------------------------------
- To add a new product field shown in the UI:
  - Update SQL migration in `supabase/migrations`, run migration.
  - Update `src/components/ProductGrid.jsx` select list (see `.select(...)`) and the product card render.
- To modify payment request shape:
  - Edit the relevant edge function in `supabase/functions/<name>/index.ts` and update the frontend caller in `src/components/*Modal.jsx`.

Files to inspect first
---------------------
- `src/App.jsx` — app flow: screensaver, cart, admin trigger, payment success.
- `src/components/ProductGrid.jsx` — canonical data query and UI patterns.
- `src/hooks/useBarcodeScanner.js` — scanning flow and error handling.
- `src/lib/supabase.js` — client setup and required env vars.
- `supabase/functions/*` — server-side payment and webhook logic (TypeScript).
- `supabase/migrations/*` — DB schema expectations.

If anything is unclear
----------------------
Tell me which integration you want to modify (UI, supabase function, or DB), and whether you have local Supabase credentials or prefer to mock responses; I can then make a focused change with tests or a local verification step.
