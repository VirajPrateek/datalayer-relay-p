/******************************
 * SST (Server-Side Tagging) Relay Script
 * Optimized version based on Performance Review (Jan 2026)
 ******************************/

(function (window, document) {
	'use strict';

	/******************************
	 * CONFIG
	 ******************************/
	var MEASUREMENT_ID = '{{GA4_PROPERTY}}';
	var SERVER_CONTAINER_URL = '{{SERVER_CONTAINER_URL}}';
	var LOAD_GTAG_FROM_SST = true;
	var RELAY_VERSION = 'dlr-vanilla-v2.7.0'; // perfomance optmized + sst dependency fix

	// Production default
	var DEBUG = false;

	var BLOCKED_EVENT_PREFIXES = ['gtm.', 'js'];

	/******************************
	* EVENT PREFIX ALLOWLIST TOGGLE
	/******************************/
	var ENABLE_EVENT_PREFIX_ALLOWLIST = false; // default OFF (backward compatible)

	var ALLOWED_EVENT_PREFIXES = [
		'pageView',
		'miniGameOpen', 'gameOpen', 'virtualOpen',
		'firstDeposit', 'deposit',
		'Cart.', 'cart.',
		'Event.Reg', 'Event.Track', 'Event.UKGC', 'Event.kyc', 'Event.KYC', 'Event.Login',
		'contentView',
		'paymentError', 'error'
	];
	/******************************/

	var PARAM_DENYLIST = [
		'send_to', 'eventCallback', 'eventTimeout',
		'gtm.uniqueEventId', 'gtm.start', 'gtm.element',
		'gtm.elementText', 'gtm.elementId'
	];
	var PARAM_DENY_PREFIXES = ['gtm'];

	var PERSIST_PREFIXES = ['browser.', 'page.', 'user.', 'device.', 'native.'];

	var BUNDLED_PARAM_NAME = 'datalayer';
	var PERSISTENT_FIELDS = [];
	var RELAY_DATALAYER_NAME = 'relayDL';


	// Persistent state limits
	var PERSIST_MAX_KEYS = 200;
	var PERSIST_TTL_MS = 30 * 60 * 1000; // 30 minutes

	/******************************
	 * FAST LOOKUPS
	 ******************************/
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

	var COMMON_GTAG_PARAM_KEYS = {};
	for (var i = 0; i < COMMON_GTAG_PARAMS.length; i++) {
		COMMON_GTAG_PARAM_KEYS[COMMON_GTAG_PARAMS[i]] = true;
	}

	/******************************
	 * LOGGING (true no-op when DEBUG=false)
	 ******************************/
	var log = DEBUG
		? function () { console.log.apply(console, arguments); }
		: function () { };

	/******************************
	 * HELPERS
	 ******************************/
	function startsWithAny(str, prefixes) {
		if (!str) return false;
		for (var i = 0; i < prefixes.length; i++) {
			if (str.startsWith(prefixes[i])) return true;
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
		var seen = new WeakSet();
		return JSON.stringify(obj, function (key, value) {
			if (typeof value === 'object' && value !== null) {
				if (seen.has(value)) return '[Circular]';
				seen.add(value);
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
	 * GTAG INIT
	 ******************************/
	function initializeGtag() {
		window[RELAY_DATALAYER_NAME] = window[RELAY_DATALAYER_NAME] || [];
		window.relay_gtag = window.relay_gtag || function () {
			window[RELAY_DATALAYER_NAME].push(arguments);
		};

		window.relay_gtag('js', new Date());
		window.relay_gtag('config', MEASUREMENT_ID, {
			send_page_view: false,
			transport_url: SERVER_CONTAINER_URL
				? SERVER_CONTAINER_URL.replace(/\/+$/, '')
				: undefined,
			relay_version: RELAY_VERSION
		});

		var script = document.createElement('script');
		script.async = true;

		var idParam = 'id=' + encodeURIComponent(MEASUREMENT_ID);
		var layerParam = '&l=' + encodeURIComponent(RELAY_DATALAYER_NAME);

		var sstSrc = SERVER_CONTAINER_URL.replace(/\/+$/, '') +
			'/gtag/js?' + idParam + layerParam;

		var googleSrc =
			'https://www.googletagmanager.com/gtag/js?' +
			idParam + layerParam;

		var fallbackTriggered = false;

		script.onerror = function () {
			if (fallbackTriggered) return;
			fallbackTriggered = true;

			console.warn('[DLR] SST gtag load failed. Falling back to Google CDN.');

			var fallbackScript = document.createElement('script');
			fallbackScript.async = true;
			fallbackScript.src = googleSrc;
			document.body.appendChild(fallbackScript);
		};

		script.src = (LOAD_GTAG_FROM_SST && SERVER_CONTAINER_URL)
			? sstSrc
			: googleSrc;

		document.body.appendChild(script);
	}

	/******************************
	 * PERSISTENT STATE (bounded)
	 ******************************/
	var persistentState = {};
	var persistentMeta = {}; // { key: lastUpdated }

	function cleanupPersistentState(now) {
		for (var k in persistentMeta) {
			if (now - persistentMeta[k] > PERSIST_TTL_MS) {
				delete persistentMeta[k];
				delete persistentState[k];
			}
		}
	}

	function enforcePersistentLimit() {
		var keys = Object.keys(persistentState);
		if (keys.length <= PERSIST_MAX_KEYS) return;

		keys.sort(function (a, b) {
			return persistentMeta[a] - persistentMeta[b];
		});

		while (keys.length > PERSIST_MAX_KEYS) {
			var oldest = keys.shift();
			delete persistentState[oldest];
			delete persistentMeta[oldest];
		}
	}

	function updatePersistentState(obj) {
		var now = Date.now();
		cleanupPersistentState(now);

		for (var i = 0; i < PERSISTENT_FIELDS.length; i++) {
			var explicit = PERSISTENT_FIELDS[i];
			if (Object.prototype.hasOwnProperty.call(obj, explicit)) {
				var v = obj[explicit];
				if (!isEmptyValue(v)) {
					persistentState[explicit] = v;
					persistentMeta[explicit] = now;
				} else {
					delete persistentState[explicit];
					delete persistentMeta[explicit];
				}
			}
		}

		for (var key in obj) {
			if (startsWithAny(key, PERSIST_PREFIXES)) {
				var value = obj[key];
				if (!isEmptyValue(value)) {
					persistentState[key] = value;
					persistentMeta[key] = now;
				} else {
					delete persistentState[key];
					delete persistentMeta[key];
				}
			}
		}

		enforcePersistentLimit();
	}

	function mergeWithPersistentState(obj) {
		return Object.keys(persistentState).length
			? Object.assign({}, persistentState, obj)
			: obj;
	}

	/******************************
	 * PARAM PROCESSING
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
	 * EVENT QUEUE + ERROR HANDLING
	 ******************************/
	var eventStats = { processed: 0, sent: 0, blocked: 0 };
	var eventQueue = [];
	var retryQueue = [];
	var isFlushScheduled = false;

	function sendEvent(event) {
		try {
			event.params.send_to = MEASUREMENT_ID;
			window.relay_gtag('event', event.eventName, event.params);
			eventStats.sent++;
		} catch (err) {
			retryQueue.push(event);
			log('[SST error] gtag failed, queued for retry', err);
		}
	}

	function flushEventQueue() {
		isFlushScheduled = false;

		while (eventQueue.length > 0) {
			sendEvent(eventQueue.shift());
		}

		if (retryQueue.length) {
			var tmp = retryQueue.slice();
			retryQueue.length = 0;
			for (var i = 0; i < tmp.length; i++) {
				sendEvent(tmp[i]);
			}
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

		if (!eventName || shouldBlockEventName(eventName) || !isEventAllowedByPrefix(eventName)) {
			eventStats.blocked++;
			return;
		}

		var mergedObj = mergeWithPersistentState(obj);
		var params = splitAndBundleParams(mergedObj);
		queueEvent(eventName, params);
	}

	/******************************
	 * DATALAYER INTERCEPT
	 ******************************/
	var dl = window.dataLayer = window.dataLayer || [];
	var originalPush = dl.push.bind(dl);

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
			if (dl[j] && typeof dl[j] === 'object') {
				processDataLayerObject(dl[j]);
			}
		}
	} catch (_) { }

	/******************************
	 * INIT
	 ******************************/
	log('DLR loaded', RELAY_VERSION);
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