/******************************
 * SST (Server-Side Tagging) Relay Script
 *
 * Relays ONLY event pushes to SST,
 * but also persists any keys beginning with:
 * browser.*, page.*, user.*, device.*
 *
 ******************************/

(function (window, document) {
	'use strict';

	/******************************
	 * CONFIG — EDIT THESE
	 ******************************/
	var MEASUREMENT_ID = '{{GA4_PROPERTY}}'; // this measurement ID is specifically for testing purpose on sportingbet BR lower environments
	var SERVER_CONTAINER_URL = '{{SERVER_CONTAINER_URL}}';
	var LOAD_GTAG_FROM_SST = true;
	var DEBUG = true;

	var BLOCKED_EVENT_PREFIXES = ['gtm.', 'js'];
	var PARAM_DENYLIST = [
		'send_to', 'eventCallback', 'eventTimeout',
		'gtm.uniqueEventId', 'gtm.start', 'gtm.element', 'gtm.elementText', 'gtm.elementId'
	];
	var PARAM_DENY_PREFIXES = ['gtm'];

	// NEW — prefixes to persist dynamically
	var PERSIST_PREFIXES = ['browser.', 'page.', 'user.', 'device.', 'native.'];

	var COMMON_GTAG_PARAMS = [
		'page_location', 'page_referrer', 'page_title', 'link_url', 'link_domain',
		'engagement_time_msec', 'debug_mode', 'non_interaction', 'user_id', 'session_id',
		'campaign', 'source', 'medium', 'term', 'content', 'gclid', 'dclid',
		'transaction_id', 'value', 'currency', 'tax', 'shipping', 'affiliation',
		'coupon', 'payment_type', 'shipping_tier', 'method', 'items',
		'item_list_name', 'item_list_id', 'creative_name', 'creative_slot',
		'location_id', 'item_category', 'item_category2', 'item_category3',
		'item_category4', 'item_category5', 'item_id', 'item_name',
		'search_term', 'content_type', 'content_id', 'video_title',
		'video_url', 'video_provider'
	];

	var BUNDLED_PARAM_NAME = 'datalayer';
	var PERSISTENT_FIELDS = []; // existing
	var RELAY_DATALAYER_NAME = 'relayDL';
	var RELAY_VERSION = 'v2.4.1-entain';

	/******************************
	 * END OF CONFIG — These should come from configuration service
	 ******************************/

	// Convert COMMON_GTAG_PARAMS array to object for fast lookups
	var COMMON_GTAG_PARAM_KEYS = {};
	for (var i = 0; i < COMMON_GTAG_PARAMS.length; i++) {
		COMMON_GTAG_PARAM_KEYS[COMMON_GTAG_PARAMS[i]] = true;
	}

	/******************************
	 * HELPER FUNCTIONS
	 ******************************/
	function log() {
		if (DEBUG && typeof console !== 'undefined') {
			console.log.apply(console, arguments);
		}
	}

	function startsWithAny(str, prefixes) {
		if (!str || !prefixes || !prefixes.length) return false;
		for (var i = 0; i < prefixes.length; i++) {
			if (str.indexOf(prefixes[i]) === 0) return true;
		}
		return false;
	}

	function shouldBlockEventName(eventName) {
		return startsWithAny(String(eventName || ''), BLOCKED_EVENT_PREFIXES);
	}

	function shouldDropParamKey(key) {
		return PARAM_DENYLIST.indexOf(key) > -1 || startsWithAny(key, PARAM_DENY_PREFIXES);
	}

	function safeStringify(obj) {
		var seen = [];
		return JSON.stringify(obj, function (key, value) {
			if (typeof value === 'object' && value !== null) {
				if (seen.indexOf(value) !== -1) return '[Circular]';
				seen.push(value);
			}
			return value;
		});
	}

	function normalizeParamValue(val) {
		if (val === null || val === undefined) return val;
		var t = typeof val;
		if (t === 'string' || t === 'number' || t === 'boolean') return val;
		try { return safeStringify(val); } catch (e) { return String(val); }
	}

	function isEmptyValue(val) {
		return val === null || val === undefined || val === '';
	}

	/******************************
	 * GTAG INITIALIZATION
	 ******************************/
	function initializeGtag() {
		// Initialize custom dataLayer for gtag
		window[RELAY_DATALAYER_NAME] = window[RELAY_DATALAYER_NAME] || [];
		window.relay_gtag = window.relay_gtag || function () {
			window[RELAY_DATALAYER_NAME].push(arguments);
		};

		// Configure gtag immediately (gtag has built-in queueing)
		window.relay_gtag('js', new Date());
		window.relay_gtag('config', MEASUREMENT_ID, {
			send_page_view: false,
			transport_url: SERVER_CONTAINER_URL ? SERVER_CONTAINER_URL.replace(/\/+$/, '') : undefined
		});

		// Load gtag.js script
		var script = document.createElement('script');
		script.async = true;
		var idParam = 'id=' + encodeURIComponent(MEASUREMENT_ID);
		var layerParam = '&l=' + encodeURIComponent(RELAY_DATALAYER_NAME);
		script.src = (LOAD_GTAG_FROM_SST && SERVER_CONTAINER_URL)
			? SERVER_CONTAINER_URL.replace(/\/+$/, '') + '/gtag/js?' + idParam + layerParam
			: 'https://www.googletagmanager.com/gtag/js?' + idParam + layerParam;
		document.head.appendChild(script);
	}

	/******************************
	 * PERSISTENCE
	 ******************************/
	var persistentState = {};

	// UPDATED — now supports prefix groups
	function updatePersistentState(obj) {
		// 1. Save explicit fields first (Original Logic)
		for (var i = 0; i < PERSISTENT_FIELDS.length; i++) {
			var explicit = PERSISTENT_FIELDS[i];
			if (Object.prototype.hasOwnProperty.call(obj, explicit)) {
				var v = obj[explicit];
				if (!isEmptyValue(v)) {
					persistentState[explicit] = v;
					// Restored original logging for explicit fields
					log('[Persistence] Updated %o = %o', explicit, v);
				} else {
					delete persistentState[explicit];
					// Restored original logging for clearing explicit fields
					log('[Persistence] Cleared %o (empty value)', explicit);
				}
			}
		}

		// 2. NEW — capture all keys starting with configured prefixes
		for (var key in obj) {
			if (startsWithAny(key, PERSIST_PREFIXES)) {
				var value = obj[key];
				if (!isEmptyValue(value)) {
					persistentState[key] = value;
					// Use specific logging for prefix fields
					log('[Persist prefix] Updated %o = %o', key, value);
				} else {
					delete persistentState[key];
					log('[Persist prefix] Cleared %o (empty value)', key);
				}
			}
		}
	}

	function mergeWithPersistentState(obj) {
		// Use original check logic which handles both PERSISTENT_FIELDS and PERSIST_PREFIXES via persistentState
		if (!Object.keys(persistentState).length) return obj;

		// Create merged object: persistent state + current event
		var merged = {};
		for (var key in persistentState) {
			merged[key] = persistentState[key];
		}
		for (var key in obj) {
			merged[key] = obj[key];
		}
		return merged;
	}

	/******************************
	 * PARAMETER PROCESSING
	 ******************************/
	function splitAndBundleParams(sourceObj) {
		var topLevel = {};
		var bundle = {};

		for (var key in sourceObj) {
			if (key === 'event') continue;
			if (shouldDropParamKey(key)) continue;

			var val = sourceObj[key];
			if (COMMON_GTAG_PARAM_KEYS[key]) {
				topLevel[key] = normalizeParamValue(val);
			} else {
				bundle[key] = val;
			}
		}

		if (Object.keys(bundle).length) {
			topLevel[BUNDLED_PARAM_NAME] = safeStringify(bundle);
		}
		return topLevel;
	}

	/******************************
	 * EVENT PROCESSING
	 ******************************/
	var eventStats = {
		processed: 0,
		sent: 0,
		blocked: 0
	};

	function sendEvent(eventName, params) {
		params.send_to = MEASUREMENT_ID;
		window.relay_gtag('event', eventName, params);
		eventStats.sent++;
		// Restored original detailed logging
		log('[SST forward] (#%o) gtag("event", %o, %o)', eventStats.sent, eventName, params);
	}

	function processDataLayerObject(obj) {
		if (!obj || typeof obj !== 'object') return;

		// Update persistent state from any dataLayer push
		updatePersistentState(obj);

		// Only forward objects with an event property
		if (!Object.prototype.hasOwnProperty.call(obj, 'event')) {
			// Restored original logging
			log('[SST process] Data-only push (no event property)');
			return;
		}

		eventStats.processed++;
		var eventName = String(obj.event || '').trim();

		// Block filtered events
		if (!eventName || shouldBlockEventName(eventName)) {
			eventStats.blocked++;
			// Restored original logging
			log('[SST blocked] Event blocked: %o', eventName);
			return;
		}

		// Restored original logging
		log('[SST process] Processing event #%o: %o', eventStats.processed, eventName);

		// Merge with persistent state and send
		var mergedObj = mergeWithPersistentState(obj);
		var params = splitAndBundleParams(mergedObj);
		sendEvent(eventName, params);
	}

	/******************************
	 * DATALAYER INTERCEPTION
	 ******************************/
	var dl = window.dataLayer = window.dataLayer || [];
	var originalPush = dl.push.bind(dl);

	// Intercept dataLayer.push
	dl.push = function () {
		// Process and relay events BEFORE adding to dataLayer
		for (var i = 0; i < arguments.length; i++) {
			if (arguments[i] && typeof arguments[i] === 'object') {
				processDataLayerObject(arguments[i]);
			}
		}
		// Then add to dataLayer for other listeners
		var result = originalPush.apply(dl, arguments);
		return result;
	};

	// Process existing dataLayer entries
	try {
		for (var i = 0; i < dl.length; i++) {
			if (dl[i] && typeof dl[i] === 'object') {
				processDataLayerObject(dl[i]);
			}
		}
	} catch (_) { }

	/******************************
	 * INITIALIZATION
	 ******************************/
	// Restored original initialization logging
	log('========================================');
	log('    DataLayer Relay Script Loaded');
	log('    Version:', RELAY_VERSION);
	log('    App DataLayer: window.dataLayer');
	log('    Gtag DataLayer: window.' + RELAY_DATALAYER_NAME);
	log('    Persistent Fields:', PERSISTENT_FIELDS.length ? PERSISTENT_FIELDS : 'None');
	log('    Persistent Prefixes:', PERSIST_PREFIXES.join(', ') || 'None'); // Added new logging line
	log('    Debug Mode:', DEBUG ? 'ON' : 'OFF');
	log('========================================');

	initializeGtag();

	/******************************
	 * DEBUG UTILITIES
	 ******************************/
	window.dataLayerRelayVersion = RELAY_VERSION;
	// Restored original debug utility function
	window.dataLayerRelayStats = function () {
		console.log('========================================');
		console.log('    DataLayer Relay Statistics');
		console.log('    Version:', RELAY_VERSION);
		console.log('----------------------------------------');
		console.log('    Processed:', eventStats.processed, '(events with event property)');
		console.log('    Blocked:', eventStats.blocked, '(filtered events)');
		console.log('    Sent:', eventStats.sent, '(forwarded to SST)');
		console.log('----------------------------------------');
		console.log('    Persistent state:', persistentState);
		console.log('========================================');
		return eventStats;
	};

})(window, document);