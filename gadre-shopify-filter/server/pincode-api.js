/**
 * Gadre Shopify Web — Pincode/Depot API Endpoints
 * 
 * Add these endpoints to your existing server.js
 * They handle pincode validation, depot resolution, and suffix lookups
 * for the Shopify website's product filtering system.
 * 
 * Google Sheet: https://docs.google.com/spreadsheets/d/1MQstu_hzwF3pj7vDc2j27FSheItNTMeRdM06k-0L_Jk/export?format=csv
 */

// ============================================================
// PASTE THE FOLLOWING INTO YOUR server.js (after existing routes)
// ============================================================

const WEB_PINCODE_SHEET_URL = process.env.PINCODE_SHEET_URL || 'YOUR_FALLBACK_CSV_URL_HERE';

// In-memory cache for the web pincode data
let webPincodeCache = null;
let webPincodeCacheTime = 0;
const WEB_PINCODE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetches and parses the Google Sheet CSV for web pincode data.
 * Returns a Map<pincode, { pincode, city, depot, message }>
 */
async function getWebPincodeData() {
    const now = Date.now();
    if (webPincodeCache && (now - webPincodeCacheTime) < WEB_PINCODE_CACHE_TTL) {
        return webPincodeCache;
    }

    try {
        console.log('[Web Pincode] Fetching Google Sheet CSV...');
        const response = await fetch(WEB_PINCODE_SHEET_URL);
        const text = await response.text();

        const rows = text.split('\n').slice(1); // Skip header
        const map = new Map();

        rows.forEach(row => {
            const cols = row.split(',').map(c => c.trim().replace(/\r/g, ''));
            if (cols.length >= 3) {
                const [pincode, city, depot, message] = cols;
                if (pincode && depot) {
                    map.set(pincode, {
                        pincode,
                        city: city || 'Unknown',
                        depot,
                        message: message || ''
                    });
                }
            }
        });

        console.log(`[Web Pincode] Loaded ${map.size} pincodes`);
        webPincodeCache = map;
        webPincodeCacheTime = now;
        return map;
    } catch (err) {
        console.error('[Web Pincode] Failed to fetch CSV:', err);
        // Return cached data if available, even if stale
        if (webPincodeCache) return webPincodeCache;
        return new Map();
    }
}

/**
 * Extracts the depot suffix from a depot string.
 * Example: 'ZFW_andheri' -> '_andheri'
 * Example: 'ZFW_koregaon_park' -> '_koregaon_park'
 */
function getWebDepotSuffix(depot) {
    if (!depot) return '';
    const idx = depot.indexOf('_');
    return idx !== -1 ? depot.substring(idx).toLowerCase() : '';
}

/**
 * Returns all unique depot suffixes from the pincode data.
 */
function getAllWebDepotSuffixes(pincodeMap) {
    const depots = new Set();
    for (const data of pincodeMap.values()) {
        depots.add(data.depot);
    }
    return Array.from(depots)
        .map(d => getWebDepotSuffix(d))
        .filter(s => s && s.length > 2);
}


// ─── ENDPOINT 1: Pincode Lookup ────────────────────────────────
// GET /api/web/pincode-lookup?pincode=400069
// Returns depot info for a given pincode

app.get('/api/web/pincode-lookup', async (req, res) => {
    // CORS for Shopify domain
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    const { pincode } = req.query;

    if (!pincode) {
        return res.status(400).json({ success: false, error: 'Pincode is required' });
    }

    try {
        const pincodeMap = await getWebPincodeData();
        const data = pincodeMap.get(pincode.trim());
        const allSuffixes = getAllWebDepotSuffixes(pincodeMap);

        if (data) {
            const suffix = getWebDepotSuffix(data.depot);

            return res.json({
                success: true,
                pincode: data.pincode,
                city: data.city,
                depot: data.depot,
                suffix,           // e.g. "_andheri"
                message: data.message,
                allSuffixes       // e.g. ["_andheri", "_koregaon_park", "_kalyan_nagar", "_malviyanagar"]
            });
        } else {
            return res.json({
                success: false,
                error: 'We are not delivering to this pincode yet.',
                allSuffixes
            });
        }
    } catch (err) {
        console.error('[Web Pincode] Lookup error:', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});


// ─── ENDPOINT 2: All Depot Suffixes ────────────────────────────
// GET /api/web/depot-suffixes
// Returns all known depot suffixes (for client-side exclusion logic)

app.get('/api/web/depot-suffixes', async (req, res) => {
    // CORS for Shopify domain
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    try {
        const pincodeMap = await getWebPincodeData();
        const allSuffixes = getAllWebDepotSuffixes(pincodeMap);

        return res.json({
            success: true,
            suffixes: allSuffixes
        });
    } catch (err) {
        console.error('[Web Pincode] Suffixes error:', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});


// ─── CORS Preflight for /api/web/* ─────────────────────────────
app.options('/api/web/*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
});


console.log('[Web Pincode] API endpoints registered: /api/web/pincode-lookup, /api/web/depot-suffixes');
