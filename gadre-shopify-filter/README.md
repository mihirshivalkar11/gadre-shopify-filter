# Gadre Shopify Web — Product Filtering by Pincode

Hyperlocal depot-based product filtering for the Gadre Shopify store website. Same concept as the mobile app — products are filtered based on the user's pincode/depot using SKU suffix matching.

## Architecture

This solution uses a **Standalone Server** to handle pincode lookups, keeping the heavy logic off of Shopify while maintaining a lightweight frontend.

```
Standalone Server                    Shopify Theme
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ /api/web/pincode-lookup      │◄────│ gadre-pincode-filter.js      │
│   - Fetches Google Sheet CSV │     │   - Pincode modal UI         │
│   - Returns depot/suffix     │     │   - DOM filtering            │
│                              │     │   - localStorage persistence │
│ /api/web/depot-suffixes      │     │                              │
│   - Returns all suffixes     │     │ gadre-pincode-modal.liquid   │
└──────────────────────────────┘     │ gadre-pincode-filter.css     │
                                     └──────────────────────────────┘
```

## Files

```
gadre-shopify-filter/
├── server/
│   ├── server.js               ← Standalone Node.js server
│   ├── package.json
│   └── Procfile                ← For deployment
├── theme/
│   ├── assets/
│   │   ├── gadre-pincode-filter.js   ← Upload to Shopify: Assets
│   │   └── gadre-pincode-filter.css  ← Upload to Shopify: Assets
│   └── snippets/
│       └── gadre-pincode-modal.liquid ← Upload to Shopify: Snippets
└── README.md
```

---

## Setup Instructions

### Step 1: Deploy the Standalone Server

Deploy the `server/` folder to a hosting provider like Render, Railway, or Heroku.

**To run it locally for testing:**
```bash
cd gadre-shopify-filter/server
npm install
npm start
```

Your server will run at `http://localhost:3001`.

### Step 2: Shopify Theme — Upload Files

In Shopify Admin → **Online Store → Themes → Edit Code**:

1. **Assets:** Click "Add a new asset" and upload:
   - `gadre-pincode-filter.js`
   - `gadre-pincode-filter.css`

2. **Snippets:** Click "Add a new snippet" named `gadre-pincode-modal` and paste the contents of `gadre-pincode-modal.liquid`

### Step 3: Update Server URL in JS file

In `gadre-pincode-filter.js`, update the `API_BASE_URL` constant (line 13) to point to your newly deployed server (or `http://localhost:3001` for local testing):
```js
const API_BASE_URL = 'https://your-deployed-server-url.com';
```

### Step 4: Connect to Theme Layout

Open `layout/theme.liquid` and add these **3 lines before `</body>`**:

```liquid
{% render 'gadre-pincode-modal' %}
{{ 'gadre-pincode-filter.css' | asset_url | stylesheet_tag }}
{{ 'gadre-pincode-filter.js' | asset_url | script_tag }}
```

### Step 5: Add Data Attributes to Product Cards ⚠️ CRITICAL

Find your theme's **product card template** — it's usually one of these files:
- `snippets/card-product.liquid`
- `snippets/product-card.liquid`
- `snippets/product-card-grid.liquid`

Find the outer `<div>` or `<li>` element that wraps each product card, and add these data attributes:

**Before:**
```liquid
<div class="card-wrapper">
```

**After:**
```liquid
<div class="card-wrapper"
  data-product-card
  data-product-title="{{ card_product.title | escape }}"
  data-product-sku="{{ card_product.selected_or_first_available_variant.sku | escape }}"
  data-product-tags="{{ card_product.tags | join: ',' | downcase | escape }}"
  data-all-skus="{% for variant in card_product.variants %}{{ variant.sku | escape }}{% unless forloop.last %},{% endunless %}{% endfor %}"
>
```

> **Note:** The variable name might differ in your theme. Usually `card_product`, `product`, or `item`.

### Step 6: Add Header Location Indicator (Optional)

In your header section (`sections/header.liquid`), add this where you want the location indicator to appear:

```liquid
<div id="gadre-change-location" class="gadre-location-bar">
  <span class="gadre-location-icon">📍</span>
  <span id="gadre-location-text" class="gadre-location-text">Select your location</span>
  <span class="gadre-location-arrow">▾</span>
</div>
```

---

## How the Filtering Works

1. **User visits site** → If no pincode saved, show modal
2. **User enters pincode** → JS calls your standalone server API
3. **Server responds** with `{ suffix: "_andheri", city: "Mumbai", allSuffixes: [...] }`
4. **JS stores** suffix in localStorage, scans all `[data-product-card]` elements
5. **For each product title group:**
   - Priority 1: Show product whose SKU ends with `_andheri`
   - Priority 2: Show "global" product (no depot suffix)
   - Skip: Products with other depot suffixes (e.g., `_koregaon_park`)
6. **Hidden products** get `display: none`
