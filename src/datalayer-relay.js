/******************************
 * SST (Server-Side Tagging) Relay Script
 * Cookie consent handled in this version 
 * SST endpoint decoupled
 ******************************/

(function (window, document) {
	'use strict';

	/******************************
	 * CONFIG
	 ******************************/
	var MEASUREMENT_ID = 'G-W1SDKXQRTM';
	var SERVER_CONTAINER_URL = 'https://sst.sportingbet.bet.br';
	var COOKIE_DOMAIN = 'sportingbet.bet.br';
	var LOAD_GTAG_FROM_SST = false;
	var DELAY_GTAG_LOAD_MS = 2000;
	var RELAY_VERSION = 'dlr-vanilla-v3.4.0'; // gtag-style consent + cookie banner events forwarded to sGTM

	// Production default
	var DEBUG = false;

	var BLOCKED_EVENT_PREFIXES = ['gtm.', 'js'];
	
	// Convert to object for O(1) lookup performance
	var BLOCKED_EVENT_EXACT = {
		'A message Close': true,
		'advance_filters': true,
		'advfilters': true,
		'error.inbox.claimOffer': true,
		'error.inbox.getMessages': true,
		'Event.Balance_Refresh': true,
		'Event.boris.contactverification': true,
		'Event.ChangePin': true,
		'Event.FastLogin': true,
		'Event.FeebackLoad': true,
		'Event.Functionality.BalanceBreakdown': true,
		'Event.Functionality.BCT': true,
		'Event.Functionality.Cts': true,
		'Event.Functionality.Generic': true,
		'Event.Functionality.JumioKyc': true,
		'Event.Functionality.SELogos': true,
		'Event.inbox.messageDeleted': true,
		'Event.inbox.previewOpenedLessthan1Sec': true,
		'Event.inbox.unknown_source': true,
		'Event.OverAskSKU': true,
		'gameMultiplier': true,
		'GEOLocation.ERROR': true,
		'Integration with message': true,
		'Message View': true,
		'page.referringAction': true,
		'productDetail': true,
		'qubit.experience': true,
		'Session.End': true,
		'shownextraces': true,
		'StaticData': true,
		'Toast message timeout': true
	};

	// Convert to object for O(1) lookup performance
	var PARAM_DENYLIST = {
		'send_to': true,
		'eventCallback': true,
		'eventTimeout': true,
		'gtm.uniqueEventId': true,
		'gtm.start': true,
		'gtm.element': true,
		'gtm.elementText': true,
		'gtm.elementId': true
	};
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

	// Consent Events from OneTrust needed for Google Consent Mode Processing
	var ONETRUST_CONSENT_EVENTS = {
		'OneTrustLoaded': 'default',
		'OneTrustGroupsUpdated': 'update'
	};

	// Gtag-style event allowlist: events that may arrive as Arguments objects
	// when OneTrust SDK calls window.gtag() (defined by client GTM).
	// cookie_banner_* event names are derived server-side from optanonAction param.
	var ONETRUST_BANNER_EVENTS = {
		'trackOptanonEvent': true,
	};

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
		var name = String(eventName || '');
		// Check exact matches first (O(1) lookup)
		if (BLOCKED_EVENT_EXACT[name]) return true;
		// Then check prefixes
		return startsWithAny(name, BLOCKED_EVENT_PREFIXES);
	}

	function shouldDropParamKey(key) {
		return PARAM_DENYLIST[key] || startsWithAny(key, PARAM_DENY_PREFIXES);
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
	 * GTAG-STYLE ARGUMENTS DETECTION
	 ******************************/
	function isGtagArguments(obj) {
		return obj &&
			typeof obj === 'object' &&
			typeof obj[0] === 'string' &&
			Object.prototype.hasOwnProperty.call(obj, '0') &&
			!Object.prototype.hasOwnProperty.call(obj, 'event');
	}

	function handleGtagStyleConsent(obj) {
		if (!isGtagArguments(obj)) return false;

		var command = obj[0];
		var arg1 = obj[1];

		// Handle: gtag('consent', 'default'|'update', {consent_state}) direct passthrough
		if (command === 'consent') {
			var arg2 = obj[2];
			if ((arg1 === 'default' || arg1 === 'update') && arg2 && typeof arg2 === 'object') {
				window.relay_gtag('consent', arg1, arg2);
				log('[DLR] Consent ' + arg1 + ' applied (gtag-style)');
				return true;
			}
			return false;
		}

		// Handle: gtag('event', 'OneTrustLoaded'|'OneTrustGroupsUpdated', {...}), Normalize and delegate to handleOneTrustConsent
		if (command === 'event' && ONETRUST_CONSENT_EVENTS[arg1]) {
			var params = obj[2];
			var groupsStr = params && params.OnetrustActiveGroups;
			if (!groupsStr) return false;

			return handleOneTrustConsent({
				event: arg1,
				OnetrustActiveGroups: groupsStr
			});
		}

		// Handle: gtag('event', 'trackOptanonEvent', {...}) — arrives as Arguments when window.gtag exists
		if (command === 'event' && ONETRUST_BANNER_EVENTS[arg1]) {
			var bannerParams = obj[2] && typeof obj[2] === 'object' ? obj[2] : {};
			var bannerObj = Object.assign({ event: arg1 }, bannerParams);
			updatePersistentState(bannerObj);
			var bannerMerged = mergeWithPersistentState(bannerObj);
			var normalised = splitAndBundleParams(bannerMerged);
			eventStats.processed++;
			queueEvent(arg1, normalised);
			log('[DLR] Gtag-style event queued:', arg1);
			return true;
		}

		return false;
	}

	/******************************
	 * CONSENT HANDLING (NON-BLOCKING)
	 ******************************/
	function parseOneTrustGroups(groupStr) {
		var map = {};
		if (!groupStr || typeof groupStr !== 'string') return map;
		var parts = groupStr.split(',');
		for (var i = 0; i < parts.length; i++) {
			if (parts[i]) map[parts[i]] = true;
		}
		return map;
	}

	function buildConsentFromOneTrust(groupsStr) {
		var groups = parseOneTrustGroups(groupsStr);
		var analyticsGranted = !!groups['C0002'];
		var adsGranted = !!groups['C0004'];

		return {
			analytics_storage: analyticsGranted ? 'granted' : 'denied',
			ad_storage: adsGranted ? 'granted' : 'denied',
			ad_user_data: adsGranted ? 'granted' : 'denied',
			ad_personalization: adsGranted ? 'granted' : 'denied'
		};
	}

	function handleOneTrustConsent(obj) {
		if (!obj || !obj.OnetrustActiveGroups) return false;

		if (obj.event === 'OneTrustLoaded') {
			var state = buildConsentFromOneTrust(obj.OnetrustActiveGroups);
			window.relay_gtag('consent', 'default', state);
			log('[DLR] Consent default applied');
			return true;
		}

		if (obj.event === 'OneTrustGroupsUpdated') {
			var updated = buildConsentFromOneTrust(obj.OnetrustActiveGroups);
			window.relay_gtag('consent', 'update', updated);
			log('[DLR] Consent updated');
			return true;
		}

		return false;
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
			relay_version: RELAY_VERSION,
			cookie_domain: COOKIE_DOMAIN || 'auto',
			cookie_flags: 'secure;samesite=none'
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
			if (DEBUG) {
				console.warn('[DLR] SST gtag load failed. Falling back to Google CDN.');
			}
			var fallbackScript = document.createElement('script');
			fallbackScript.async = true;
			fallbackScript.src = googleSrc;
			setTimeout(function () {
				document.body.appendChild(fallbackScript);
			}, DELAY_GTAG_LOAD_MS);
		};

		script.src = (LOAD_GTAG_FROM_SST && SERVER_CONTAINER_URL)
			? sstSrc
			: googleSrc;

		setTimeout(function () {
			document.body.appendChild(script);
		}, DELAY_GTAG_LOAD_MS);

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

		if (handleGtagStyleConsent(obj)) return;

		if (handleOneTrustConsent(obj)) return;

		updatePersistentState(obj);

		if (!Object.prototype.hasOwnProperty.call(obj, 'event')) return;

		eventStats.processed++;

		var eventName = String(obj.event || '').trim();

		if (!eventName || shouldBlockEventName(eventName)) {
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