/******************************
 * SST (Server-Side Tagging) Relay Script
 *v2.5.3-allowlist-toggle
 * 
 * Event Prefix Allowlist Toggle
 * 
 ******************************/

(function (window, document) {
	'use strict';

	/******************************
	 * CONFIG — EDIT THESE
	 ******************************/
	var MEASUREMENT_ID = '{{GA4_PROPERTY}}';
	var SERVER_CONTAINER_URL = '{{SERVER_CONTAINER_URL}}';
	var LOAD_GTAG_FROM_SST = true;
	var DEBUG = true;

	var BLOCKED_EVENT_PREFIXES = ['gtm.', 'js'];

	/******************************
	* EVENT PREFIX ALLOWLIST TOGGLE
	/******************************/
	var ENABLE_EVENT_PREFIX_ALLOWLIST = true; // default OFF (backward compatible)

	var ALLOWED_EVENT_PREFIXES = [
		'pageView',
		'miniGameOpen', 'gameOpen', 'virtualOpen',
		'firstDeposit', 'deposit',
		'Cart.', 'cart.',
		'Event.',
		'contentView',
		'paymentError', 'error'
	];
	/******************************/

	var PARAM_DENYLIST = [
		'send_to', 'eventCallback', 'eventTimeout',
		'gtm.uniqueEventId', 'gtm.start', 'gtm.element', 'gtm.elementText', 'gtm.elementId'
	];
	var PARAM_DENY_PREFIXES = ['gtm'];

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
	var PERSISTENT_FIELDS = [];
	var RELAY_DATALAYER_NAME = 'relayDL';
	var RELAY_VERSION = 'v2.5.3-event-allowlist';

	/******************************
	 * END CONFIG
	 ******************************/

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

	function isEventAllowedByPrefix(eventName) {
		if (!ENABLE_EVENT_PREFIX_ALLOWLIST) return true;      // toggle OFF → allow all
		if (!ALLOWED_EVENT_PREFIXES.length) return false;     // toggle ON but empty → allow none
		return startsWithAny(eventName, ALLOWED_EVENT_PREFIXES);
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

	function scheduleEvent(callback) {
		if (typeof requestIdleCallback === 'function') {
			requestIdleCallback(callback, { timeout: 1000 });
		} else {
			setTimeout(callback, 0);
		}
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

	function updatePersistentState(obj) {
		for (var i = 0; i < PERSISTENT_FIELDS.length; i++) {
			var explicit = PERSISTENT_FIELDS[i];
			if (Object.prototype.hasOwnProperty.call(obj, explicit)) {
				var v = obj[explicit];
				if (!isEmptyValue(v)) persistentState[explicit] = v;
				else delete persistentState[explicit];
			}
		}

		for (var key in obj) {
			if (startsWithAny(key, PERSIST_PREFIXES)) {
				var value = obj[key];
				if (!isEmptyValue(value)) persistentState[key] = value;
				else delete persistentState[key];
			}
		}
	}

	function mergeWithPersistentState(obj) {
		if (!Object.keys(persistentState).length) return obj;
		var merged = {};
		for (var k in persistentState) merged[k] = persistentState[k];
		for (var k2 in obj) merged[k2] = obj[k2];
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
		blocked: 0,
		notAllowed: 0
	};

	var eventQueue = [];
	var isFlushScheduled = false;

	function flushEventQueue() {
		isFlushScheduled = false;
		while (eventQueue.length > 0) {
			var event = eventQueue.shift();
			event.params.send_to = MEASUREMENT_ID;
			window.relay_gtag('event', event.eventName, event.params);
			eventStats.sent++;
		}
	}

	function queueEvent(eventName, params) {
		eventQueue.push({ eventName: eventName, params: params });
		if (!isFlushScheduled) {
			isFlushScheduled = true;
			scheduleEvent(flushEventQueue);
		}
	}

	function processDataLayerObject(obj) {
		if (!obj || typeof obj !== 'object') return;

		updatePersistentState(obj);

		if (!Object.prototype.hasOwnProperty.call(obj, 'event')) return;

		eventStats.processed++;
		var eventName = String(obj.event || '').trim();

		// Block filtered events
		if (!eventName || shouldBlockEventName(eventName)) {
			eventStats.blocked++;
			return;
		}

		if (!isEventAllowedByPrefix(eventName)) {
			eventStats.notAllowed++;
			log('[SST not-allowed] Event rejected by allowlist:', eventName);
			return;
		}

		var mergedObj = mergeWithPersistentState(obj);
		var params = splitAndBundleParams(mergedObj);
		queueEvent(eventName, params);
	}

	/******************************
	 * DATALAYER INTERCEPTION
	 ******************************/
	var dl = window.dataLayer = window.dataLayer || [];
	var originalPush = dl.push.bind(dl);

	// Intercept dataLayer.push
	dl.push = function () {
		for (var i = 0; i < arguments.length; i++) {
			if (arguments[i] && typeof arguments[i] === 'object') {
				processDataLayerObject(arguments[i]);
			}
		}
		return originalPush.apply(dl, arguments);
	};

	try {
		for (var j = 0; j < dl.length; j++) {
			if (dl[j] && typeof dl[j] === 'object') processDataLayerObject(dl[j]);
		}
	} catch (_) { }

	/******************************
	 * INITIALIZATION
	 ******************************/
	log('========================================');
	log(' DataLayer Relay Script Loaded');
	log(' Version:', RELAY_VERSION);
	log(' Allowlist Enabled:', ENABLE_EVENT_PREFIX_ALLOWLIST);
	log(' Allowed Prefixes:', ALLOWED_EVENT_PREFIXES.length ? ALLOWED_EVENT_PREFIXES.join(', ') : 'ALL');
	log('========================================');

	initializeGtag();

	/******************************
	 * DEBUG
	 ******************************/
	window.dataLayerRelayVersion = RELAY_VERSION;
	window.dataLayerRelayStats = function () {
		console.table(eventStats);
		return eventStats;
	};

})(window, document);