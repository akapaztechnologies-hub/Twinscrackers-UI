# Deploy Nv Crackers to Cloudflare Pages

## Prerequisites

- GitHub repository pushed with latest code
- Cloudflare account ([dash.cloudflare.com](https://dash.cloudflare.com))

---

## Step 1: Connect GitHub to Cloudflare Pages

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create**
2. Select the **Pages** tab
3. Click **Connect to Git**
4. Authorize Cloudflare to access your GitHub account
5. Select the **AkashCrackers** repository
6. Click **Begin setup**

---

## Step 2: Configure Build Settings

| Setting | Value |
|---------|-------|
| **Project name** | `akash-crackers` |
| **Production branch** | `main` |
| **Framework preset** | `Vite` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |

---

## Step 3: Add Environment Variables

Click **Environment variables** → **Add variable** and add these:

| Variable Name | Value |
|---------------|-------|
| `VITE_FIREBASE_API_KEY` | `AIzaSyCXWRYQGC2RAI5GB0337zPSKu_jKJzoWDY` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `nvcrackers.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `nvcrackers` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `nvcrackers.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `921722042394` |
| `VITE_FIREBASE_APP_ID` | `1:921722042394:web:ef993057e53c6f14c839a3` |
| `VITE_RAZORPAY_KEY_ID` | Your Razorpay key (e.g., `rzp_test_xxx` or `rzp_live_xxx`) |
| `NODE_VERSION` | `20` |
| `VITE_API_URL` | Your API base, e.g. `https://api.yourstore.com/api` |
| `API_BASE_URL` | Same value as `VITE_API_URL` — **required**, see below |

> These must be set for **both** Production and Preview environments.

### Branding variables (optional, but recommended)

The shop's name, logo, tagline and canonical URL are read live from
**Admin → Content → Company Info** and **Admin → Content → Site Settings**.
Nothing in the code hard-codes them.

`API_BASE_URL` is what lets the edge functions in `functions/` read that live
brand. **If it is unset, `robots.txt`, `sitemap.xml`, `site.webmanifest` and the
share-preview tags fall back to the build-time values below** — the site still
works, but a rebrand will not reach crawlers until the next deploy.

The `VITE_SITE_*` variables are only the fallback baked into `index.html`, used
for the instant before the live brand loads. Keep them roughly in step with the
admin values:

| Variable Name | Example |
|---------------|---------|
| `VITE_SITE_NAME` | `FireFly` |
| `VITE_SITE_TAGLINE` | `Premium Fireworks for Every Celebration` |
| `VITE_SITE_DESCRIPTION` | One-line description used in search results |
| `VITE_SITE_URL` | `https://yourstore.com` |
| `VITE_SITE_LOGO` | `/logo.png` or an absolute CDN URL |
| `VITE_THEME_COLOR` | `#0A0A0A` |

---

## Step 4: Deploy

Click **Save and Deploy**. Cloudflare will:

1. Clone your repo
2. Run `npm install`
3. Run `npm run build`
4. Deploy the `dist/` folder to their CDN

First deploy takes ~2 minutes. You'll get a URL like:
`https://akash-crackers.pages.dev`

---

## Step 5: Firebase Authorized Domains

After deployment, add your Cloudflare Pages domain to Firebase:

1. Go to **Firebase Console** → **Authentication** → **Settings** → **Authorized domains**
2. Click **Add domain**
3. Add `akash-crackers.pages.dev` (and your custom domain if you have one)

This is required for Google OAuth to work on the deployed site.

---

## Step 6: Custom Domain (Optional)

1. In Cloudflare Pages → your project → **Custom domains**
2. Click **Set up a custom domain**
3. Enter your domain (e.g., `nvcrackers.com`)
4. If your domain is already on Cloudflare DNS, it auto-configures
5. If not, add the CNAME record shown to your DNS provider

---

## Auto-Deploy

Every push to `main` will automatically trigger a new deployment. Preview deployments are created for pull requests.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank page on routes like `/shop` | Ensure `public/_redirects` file exists with `/* /index.html 200` |
| Google login fails on deployed site | Add the Pages domain to Firebase Authorized Domains |
| Build fails | Check that `NODE_VERSION` env var is set to `20` |
| Environment variables not working | Ensure all `VITE_*` vars are set in Cloudflare Pages settings (not just locally) |
| Share previews / tab title show the old company name | Set `API_BASE_URL` in Pages settings so `functions/_middleware.js` can read the live brand, then re-scrape the link (WhatsApp and Facebook cache previews for days) |
| `robots.txt` or `sitemap.xml` points at the wrong domain | Set the Canonical Site URL in Admin → Content → Site Settings; it is generated per request from that value |
