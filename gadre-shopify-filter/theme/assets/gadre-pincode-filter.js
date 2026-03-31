/**
 * Gadre Shopify Web — Pincode Product Filter
 * 
 * Lightweight client-side script for the Shopify theme.
 * Handles: pincode modal, server API calls, product card filtering.
 * 
 * IMPORTANT: Update API_BASE_URL to your server's URL.
 */

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION — Update this to your server URL
    // ═══════════════════════════════════════════════════════════
    const API_BASE_URL = 'https://gadre-shopify-filter.onrender.com'; // TODO: Replace with your actual server URL

    // LocalStorage keys
    const LS_PINCODE = 'gadre_web_pincode';
    const LS_CITY = 'gadre_web_city';
    const LS_SUFFIX = 'gadre_web_suffix';
    const LS_ALL_SUFFIXES = 'gadre_web_all_suffixes';
    const LS_DELIVERY_MSG = 'gadre_web_delivery_msg';
    const LS_TIMESTAMP = 'gadre_web_timestamp'; // Tracks when the pincode was saved
    const LS_UNSERVICEABLE = 'gadre_web_unserviceable';

    // Expiration time: 2 hours in milliseconds
    const PINCODE_EXPIRY_MS = 2 * 60 * 60 * 1000;

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════
    let currentSuffix = localStorage.getItem(LS_SUFFIX) || '';
    let allSuffixes = [];
    try {
        allSuffixes = JSON.parse(localStorage.getItem(LS_ALL_SUFFIXES) || '[]');
    } catch (e) {
        allSuffixes = [];
    }

    // ═══════════════════════════════════════════════════════════
    // INIT — Runs on every page load
    // ═══════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', function() {
        const savedPincode = localStorage.getItem(LS_PINCODE);
        const savedCity = localStorage.getItem(LS_CITY);
        const savedTimestamp = localStorage.getItem(LS_TIMESTAMP);

        // Check if the saved location has expired
        let isExpired = false;
        if (savedTimestamp) {
            const timeElapsed = Date.now() - parseInt(savedTimestamp, 10);
            if (timeElapsed > PINCODE_EXPIRY_MS) {
                isExpired = true;
                console.log('[GadreFilter] Saved location expired (older than 2 hours). Clearing data.');
                clearPincode(); // This will show all products and reset the UI, prompting user eventually
            }
        }

        // Update header location display
        if (!isExpired) {
            updateLocationDisplay(savedPincode, savedCity);
        }

        if (savedPincode && currentSuffix && !isExpired) {
            // User has a saved location — filter immediately
            console.log('[GadreFilter] Saved pincode:', savedPincode, '| Suffix:', currentSuffix);
            filterAllProducts();
        } else {
            // No saved location — show modal after a short delay
            setTimeout(function() {
                showPincodeModal();
            }, 800);
            
            // Unlock UI immediately for browsing since modal will overlay
            document.body.classList.add('gadre-ready');
        }

        // Bind modal events
        bindModalEvents();

        // Bind "Change Location" button
        const changeBtn = document.getElementById('gadre-change-location');
        if (changeBtn) {
            changeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                showPincodeModal();
            });
        }

        // Re-filter after Shopify AJAX navigation (for infinite scroll / pagination)
        observeDOMChanges();

        // 🛡️ FULL-PROOF ADD TO CART INTERCEPT 🛡️
        // If no valid pincode is set, block Add to Cart and show modal
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('button[name="add"], .add-to-cart, .add_to_cart, #AddToCart, #AddToCart-product-template, [data-add-to-cart], form[action^="/cart/add"] [type="submit"]');
            if (btn) {
                var currentPin = localStorage.getItem(LS_PINCODE);
                var currentTime = localStorage.getItem(LS_TIMESTAMP);
                var isUnserviceable = localStorage.getItem(LS_UNSERVICEABLE) === 'true';
                var valid = false;
                
                if (currentPin && currentTime && !isUnserviceable) {
                    if (Date.now() - parseInt(currentTime, 10) <= PINCODE_EXPIRY_MS) {
                        valid = true;
                    }
                }
                
                if (!valid) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[GadreFilter] Blocked Add to Cart: No active/serviceable pincode. Prompting user.');
                    if (currentTime && (Date.now() - parseInt(currentTime, 10) > PINCODE_EXPIRY_MS)) {
                        clearPincode(); // Clean up if it was merely expired
                    }
                    if (isUnserviceable) {
                        alert('We currently do not deliver to your location. Please enter a valid pincode to order.');
                    }
                    showPincodeModal();
                }
            }
        }, true); // Capture phase to run before theme scripts block it
    });

    // ═══════════════════════════════════════════════════════════
    // PINCODE LOOKUP — Calls the server API
    // ═══════════════════════════════════════════════════════════
    async function lookupPincode(pincode) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/web/pincode-lookup?pincode=${encodeURIComponent(pincode)}`);
            const data = await response.json();
            return data;
        } catch (err) {
            console.error('[GadreFilter] API error:', err);
            return { success: false, error: 'Unable to reach server. Please try again.' };
        }
    }

    // ═══════════════════════════════════════════════════════════
    // APPLY PINCODE — Save to localStorage and filter
    // ═══════════════════════════════════════════════════════════
    function applyPincode(data) {
        localStorage.setItem(LS_PINCODE, data.pincode);
        localStorage.setItem(LS_CITY, data.city);
        localStorage.setItem(LS_SUFFIX, data.suffix);
        localStorage.setItem(LS_ALL_SUFFIXES, JSON.stringify(data.allSuffixes || []));
        localStorage.setItem(LS_DELIVERY_MSG, data.message || '');
        localStorage.setItem(LS_TIMESTAMP, Date.now().toString());

        if (data.isUnserviceable) {
            localStorage.setItem(LS_UNSERVICEABLE, 'true');
        } else {
            localStorage.removeItem(LS_UNSERVICEABLE);
        }

        currentSuffix = data.suffix;
        allSuffixes = data.allSuffixes || [];

        updateLocationDisplay(data.pincode, data.city);
        filterAllProducts();
    }

    // ═══════════════════════════════════════════════════════════
    // CLEAR PINCODE — Remove location and show all products
    // ═══════════════════════════════════════════════════════════
    function clearPincode() {
        localStorage.removeItem(LS_PINCODE);
        localStorage.removeItem(LS_CITY);
        localStorage.removeItem(LS_SUFFIX);
        localStorage.removeItem(LS_ALL_SUFFIXES);
        localStorage.removeItem(LS_DELIVERY_MSG);
        localStorage.removeItem(LS_TIMESTAMP);
        localStorage.removeItem(LS_UNSERVICEABLE);

        currentSuffix = '';
        allSuffixes = [];

        updateLocationDisplay(null, null);
        showAllProducts();
    }

    // ═══════════════════════════════════════════════════════════
    // PRODUCT FILTERING — The core algorithm (same as mobile app)
    // ═══════════════════════════════════════════════════════════
    function filterAllProducts() {
        const cards = document.querySelectorAll('[data-product-card]');
        if (cards.length === 0) {
            console.log('[GadreFilter] No product cards found on this page.');
            return;
        }

        console.log(`[GadreFilter] Filtering ${cards.length} product cards with suffix: "${currentSuffix}"`);

        // Step 1: Hide products tagged as draft/hidden/unlisted
        // Step 2: SKU suffix matching
        // Step 3: Exclude other depots
        // Step 4: Group by title, pick winner

        const groups = new Map(); // title -> [{ card, sku, allSkus }]

        cards.forEach(function(card) {
            const tags = (card.getAttribute('data-product-tags') || '').toLowerCase();
            const title = (card.getAttribute('data-product-title') || '').trim();
            const sku = (card.getAttribute('data-product-sku') || '').trim().toLowerCase();
            const allSkusStr = (card.getAttribute('data-all-skus') || '').trim().toLowerCase();
            const allSkus = allSkusStr ? allSkusStr.split(',').map(function(s) { return s.trim(); }) : [sku];

            // Step 1: Hide draft/hidden/unlisted
            if (tags.includes('draft') || tags.includes('hidden') || tags.includes('unlisted')) {
                hideCard(card);
                return;
            }

            if (!title) {
                hideCard(card);
                return;
            }

            // Collect into groups
            if (!groups.has(title)) {
                groups.set(title, []);
            }
            groups.get(title).push({ card: card, sku: sku, allSkus: allSkus });
        });

        // Process each group
        groups.forEach(function(items, title) {
            if (!currentSuffix) {
                // No depot selected — show first item in each group, hide duplicates
                items.forEach(function(item, idx) {
                    if (idx === 0) {
                        showCard(item.card);
                    } else {
                        hideCard(item.card);
                    }
                });
                return;
            }

            // Step 2 & 3: Find the best match for this depot
            let winner = null;
            let globalFallback = null;

            items.forEach(function(item) {
                // Check if this item's SKU matches the current depot
                const hasCurrentSuffix = item.sku.endsWith(currentSuffix) ||
                    item.allSkus.some(function(s) { return s.endsWith(currentSuffix); });

                // Check if it matches ANY other depot
                const hasOtherSuffix = allSuffixes.some(function(s) {
                    return s !== currentSuffix && (
                        item.sku.endsWith(s) ||
                        item.allSkus.some(function(sk) { return sk.endsWith(s); })
                    );
                });

                if (hasCurrentSuffix) {
                    // Priority 1: Exact depot match
                    winner = item;
                } else if (!hasOtherSuffix && !globalFallback) {
                    // Priority 3: Global product (no depot suffix at all)
                    globalFallback = item;
                }
                // If it matches another depot → skip (don't set as fallback)
            });

            // Show the winner, hide the rest
            const chosen = winner || globalFallback;
            items.forEach(function(item) {
                if (item === chosen) {
                    showCard(item.card);
                } else {
                    hideCard(item.card);
                }
            });
        });

        // Update empty state
        updateEmptyState();
        
        // Unlock UI (removes slow connection anti-flicker protection)
        document.body.classList.add('gadre-ready');
        
        console.log('[GadreFilter] Filtering complete.');
    }

    function showAllProducts() {
        var cards = document.querySelectorAll('[data-product-card]');
        cards.forEach(function(card) {
            showCard(card);
        });
        updateEmptyState();
        document.body.classList.add('gadre-ready');
    }

    function hideCard(card) {
        // Walk up to the grid item wrapper if needed
        var wrapper = card.closest('.grid__item, .collection-product-card, .product-grid-item') || card;
        wrapper.style.display = 'none';
        wrapper.setAttribute('data-filtered-out', 'true');
    }

    function showCard(card) {
        var wrapper = card.closest('.grid__item, .collection-product-card, .product-grid-item') || card;
        wrapper.style.display = '';
        wrapper.removeAttribute('data-filtered-out');
    }

    function updateEmptyState() {
        // Check if there are any visible products
        var allCards = document.querySelectorAll('[data-product-card]');
        var visibleCount = 0;
        allCards.forEach(function(card) {
            var wrapper = card.closest('.grid__item, .collection-product-card, .product-grid-item') || card;
            if (wrapper.style.display !== 'none') {
                visibleCount++;
            }
        });

        // Show/hide empty state message
        var emptyMsg = document.getElementById('gadre-empty-state');
        if (emptyMsg) {
            emptyMsg.style.display = visibleCount === 0 && allCards.length > 0 ? 'block' : 'none';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // MODAL — Show/hide pincode input modal
    // ═══════════════════════════════════════════════════════════
    function showPincodeModal() {
        var modal = document.getElementById('gadre-pincode-modal');
        if (modal) {
            modal.classList.add('gadre-modal--active');
            var input = document.getElementById('gadre-pincode-input');
            if (input) {
                input.value = '';
                input.focus();
            }
            // Reset state
            var resultDiv = document.getElementById('gadre-pincode-result');
            if (resultDiv) resultDiv.innerHTML = '';
            var submitBtn = document.getElementById('gadre-pincode-submit');
            if (submitBtn) {
                submitBtn.textContent = 'Check Availability';
                submitBtn.disabled = false;
            }
        }
    }

    function hidePincodeModal() {
        var modal = document.getElementById('gadre-pincode-modal');
        if (modal) {
            modal.classList.remove('gadre-modal--active');
        }
    }

    function bindModalEvents() {
        // Submit button
        var submitBtn = document.getElementById('gadre-pincode-submit');
        if (submitBtn) {
            submitBtn.addEventListener('click', handlePincodeSubmit);
        }

        // Enter key in input
        var input = document.getElementById('gadre-pincode-input');
        if (input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePincodeSubmit();
                }
            });
        }

        // Close button
        var closeBtn = document.getElementById('gadre-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                hidePincodeModal();
            });
        }

        // Overlay click to close
        var overlay = document.getElementById('gadre-pincode-modal');
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) {
                    hidePincodeModal();
                }
            });
        }

        // Clear location button
        var clearBtn = document.getElementById('gadre-clear-location');
        if (clearBtn) {
            clearBtn.addEventListener('click', function(e) {
                e.preventDefault();
                clearPincode();
                hidePincodeModal();
            });
        }
    }

    async function handlePincodeSubmit() {
        var input = document.getElementById('gadre-pincode-input');
        var resultDiv = document.getElementById('gadre-pincode-result');
        var submitBtn = document.getElementById('gadre-pincode-submit');

        if (!input || !resultDiv || !submitBtn) return;

        var pincode = input.value.trim();
        if (!pincode || pincode.length < 5) {
            resultDiv.innerHTML = '<p class="gadre-error">Please enter a valid pincode.</p>';
            return;
        }

        // Loading state
        submitBtn.textContent = 'Checking...';
        submitBtn.disabled = true;
        resultDiv.innerHTML = '';

        var data = await lookupPincode(pincode);

        if (data.success) {
            resultDiv.innerHTML =
                '<div class="gadre-success">' +
                    '<p class="gadre-city-name">📍 ' + data.city + '</p>' +
                    '<p class="gadre-delivery-msg">' + (data.message || 'Delivery available!') + '</p>' +
                '</div>';

            submitBtn.textContent = 'Continue Shopping';
            submitBtn.disabled = false;

            // Change submit button to close modal and apply
            submitBtn.removeEventListener('click', handlePincodeSubmit);
            submitBtn.addEventListener('click', function onContinue() {
                applyPincode(data);
                hidePincodeModal();
                // Re-bind original handler
                submitBtn.removeEventListener('click', onContinue);
                submitBtn.addEventListener('click', handlePincodeSubmit);
                submitBtn.textContent = 'Check Availability';
            });
        } else {
            // Unserviceable pincode fallback logic
            resultDiv.innerHTML =
                '<div class="gadre-warning" style="color: #d97706; background: #fffbeb; padding: 10px; border-radius: 4px; margin-bottom: 10px; text-align: center;">' +
                    '<p style="margin: 0 0 5px; font-weight: bold;">📍 Pincode: ' + pincode + '</p>' +
                    '<p style="margin: 0; font-size: 0.9em;">We do not deliver to your location, you can continue checking our products or order from Amazon Fresh, Blinkit, Zepto, Instamart.</p>' +
                '</div>';
            
            submitBtn.textContent = 'Continue Browsing';
            submitBtn.disabled = false;

            // Change submit button behavior to apply fallback
            submitBtn.removeEventListener('click', handlePincodeSubmit);
            function onContinueFallback() {
                applyPincode({
                    pincode: pincode,
                    city: 'Not Deliverable',
                    suffix: '_gadre', // The fallback suffix for viewing standard products
                    allSuffixes: data.allSuffixes || [],
                    message: 'Browsing Only — No Delivery',
                    isUnserviceable: true
                });
                hidePincodeModal();
                // Restore button state
                submitBtn.removeEventListener('click', onContinueFallback);
                submitBtn.addEventListener('click', handlePincodeSubmit);
                submitBtn.textContent = 'Check Availability';
            }
            submitBtn.addEventListener('click', onContinueFallback);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HEADER LOCATION DISPLAY
    // ═══════════════════════════════════════════════════════════
    function updateLocationDisplay(pincode, city) {
        var locationText = document.getElementById('gadre-location-text');
        if (locationText) {
            if (pincode && city) {
                locationText.textContent = city + ' — ' + pincode;
                locationText.classList.add('gadre-location--active');
            } else if (pincode) {
                locationText.textContent = pincode;
                locationText.classList.add('gadre-location--active');
            } else {
                locationText.textContent = 'Select your location';
                locationText.classList.remove('gadre-location--active');
            }
        }

        // Delivery message banner
        var deliveryBanner = document.getElementById('gadre-delivery-banner');
        if (deliveryBanner) {
            var msg = localStorage.getItem(LS_DELIVERY_MSG);
            if (msg && pincode) {
                deliveryBanner.textContent = '🚚 ' + msg;
                deliveryBanner.style.display = 'block';
            } else {
                deliveryBanner.style.display = 'none';
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // DOM OBSERVER — Re-filter when new products are loaded
    // (Handles infinite scroll, AJAX pagination, Shopify sections)
    // ═══════════════════════════════════════════════════════════
    function observeDOMChanges() {
        if (!currentSuffix) return; // No need to observe if no filter active

        var productGrids = document.querySelectorAll(
            '.collection-products, .product-grid, #product-grid, [data-product-grid], .collection__products'
        );

        if (productGrids.length === 0) return;

        var observer = new MutationObserver(function(mutations) {
            var hasNewCards = mutations.some(function(m) {
                return m.addedNodes.length > 0;
            });
            if (hasNewCards) {
                console.log('[GadreFilter] New products detected, re-filtering...');
                filterAllProducts();
            }
        });

        productGrids.forEach(function(grid) {
            observer.observe(grid, { childList: true, subtree: true });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // GLOBAL ACCESS — For use in Liquid templates if needed
    // ═══════════════════════════════════════════════════════════
    window.GadreFilter = {
        showModal: showPincodeModal,
        hideModal: hidePincodeModal,
        filter: filterAllProducts,
        clear: clearPincode,
        getSuffix: function() { return currentSuffix; },
        getPincode: function() { return localStorage.getItem(LS_PINCODE); }
    };

})();
