/**
 * Gadre Shopify Web — Standalone Pincode Filter Server
 * 
 * A lightweight Express server that provides pincode-to-depot lookup
 * for the Shopify website's product filtering system.
 * 
 * Data Source: Google Sheets CSV
 * https://docs.google.com/spreadsheets/d/1MQstu_hzwF3pj7vDc2j27FSheItNTMeRdM06k-0L_Jk/export?format=csv
 * 
 * Deploy to: Render, Railway, Vercel, or any Node.js host
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

// Data Source: Google Sheets CSV URL via environment variable
// Ensure process.env.PINCODE_SHEET_URL is set in your Render/Railway/Vercel dashboard.
const PINCODE_SHEET_URL = process.env.PINCODE_SHEET_URL || 'https://docs.google.com/spreadsheets/d/1nVWFrDEVR58ngHbVDk6ifx6-iK17OvSeQncEVagEZK8/edit?gid=769140284#gid=769140284';

// CORS — Allow your Shopify store domain
// TODO: Replace '*' with your actual store domain for production security
// e.g. 'https://gadre-estore.myshopify.com' or 'https://www.gadre.co.in'
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['https://test-pincode-2.myshopify.com/'];

app.use(cors({
    origin: function(origin, callback) {
        if (ALLOWED_ORIGINS.includes('*') || !origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// ═══════════════════════════════════════════════════════════
// PINCODE DATA — Cached in memory from Google Sheets
// ═══════════════════════════════════════════════════════════

let pincodeCache = null;
let pincodeCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetches and parses the Google Sheet CSV.
 * Returns a Map<pincode, { pincode, city, depot, message }>
 */
async function getPincodeData() {
    const now = Date.now();
    if (pincodeCache && (now - pincodeCacheTime) < CACHE_TTL) {
        return pincodeCache;
    }

    try {
        console.log('[Pincode] Fetching Google Sheet CSV...');
        const response = await fetch(PINCODE_SHEET_URL);
        const text = await response.text();

        const rows = text.split('\n').slice(1); // Skip header row
        const map = new Map();

        rows.forEach(row => {
            const cols = row.split(',').map(c => c.trim().replace(/\r/g, ''));
            if (cols.length >= 3) {
                const [pincode, city, depot, message] = cols;
                if (pincode && depot && /^\d+$/.test(pincode)) {
                    map.set(pincode, {
                        pincode,
                        city: city || 'Unknown',
                        depot,
                        message: message || ''
                    });
                }
            }
        });

        console.log(`[Pincode] Loaded ${map.size} pincodes`);
        pincodeCache = map;
        pincodeCacheTime = now;
        return map;
    } catch (err) {
        console.error('[Pincode] Failed to fetch CSV:', err.message);
        if (pincodeCache) return pincodeCache; // Return stale cache
        return new Map();
    }
}

/**
 * Extracts the depot suffix from a depot string.
 * 'ZFW_andheri' → '_andheri'
 * 'ZFW_koregaon_park' → '_koregaon_park'
 */
function getDepotSuffix(depot) {
    if (!depot) return '';
    const idx = depot.indexOf('_');
    return idx !== -1 ? depot.substring(idx).toLowerCase() : '';
}

/**
 * Returns all unique depot suffixes from the pincode data.
 */
function getAllDepotSuffixes(pincodeMap) {
    const depots = new Set();
    for (const data of pincodeMap.values()) {
        depots.add(data.depot);
    }
    return Array.from(depots)
        .map(d => getDepotSuffix(d))
        .filter(s => s && s.length > 2);
}

// ═══════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════

// Health check
app.get('/', (req, res) => {
    res.json({
        service: 'Gadre Shopify Pincode Filter',
        status: 'running',
        endpoints: [
            'GET /api/web/pincode-lookup?pincode=400069',
            'GET /api/web/depot-suffixes'
        ]
    });
});

// ─── Pincode Lookup ────────────────────────────────────────
// GET /api/web/pincode-lookup?pincode=400069
app.get('/api/web/pincode-lookup', async (req, res) => {
    const { pincode } = req.query;

    if (!pincode) {
        return res.status(400).json({ success: false, error: 'Pincode is required' });
    }

    try {
        const pincodeMap = await getPincodeData();
        const data = pincodeMap.get(pincode.trim());
        const allSuffixes = getAllDepotSuffixes(pincodeMap);

        if (data) {
            const suffix = getDepotSuffix(data.depot);

            return res.json({
                success: true,
                pincode: data.pincode,
                city: data.city,
                depot: data.depot,
                suffix,           // e.g. "_andheri"
                message: data.message,
                allSuffixes       // e.g. ["_andheri", "_koregaon_park", ...]
            });
        } else {
            return res.json({
                success: false,
                error: 'We are not delivering to this pincode yet.',
                allSuffixes
            });
        }
    } catch (err) {
        console.error('[Pincode] Lookup error:', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ─── All Depot Suffixes ────────────────────────────────────
// GET /api/web/depot-suffixes
app.get('/api/web/depot-suffixes', async (req, res) => {
    try {
        const pincodeMap = await getPincodeData();
        const allSuffixes = getAllDepotSuffixes(pincodeMap);

        return res.json({
            success: true,
            suffixes: allSuffixes
        });
    } catch (err) {
        console.error('[Pincode] Suffixes error:', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log(`\n🚀 Gadre Pincode Filter Server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/`);
    console.log(`   Lookup: http://localhost:${PORT}/api/web/pincode-lookup?pincode=400069`);
    console.log(`   Suffixes: http://localhost:${PORT}/api/web/depot-suffixes\n`);

    // Pre-warm the cache on startup
    getPincodeData().then(map => {
        console.log(`[Pincode] Cache warmed: ${map.size} pincodes loaded`);
    });
});
