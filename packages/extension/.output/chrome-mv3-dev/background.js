var background = (function() {
	//#region node_modules/wxt/dist/utils/define-background.mjs
	function defineBackground(arg) {
		if (arg == null || typeof arg === "function") return { main: arg };
		return arg;
	}
	//#endregion
	//#region src/entrypoints/background.ts
	var background_default = defineBackground(() => {
		console.log("[Yeshie] Background worker started");
		chrome.runtime.onInstalled.addListener((details) => {
			if (details.reason === "update" || details.reason === "install") chrome.tabs.query({ active: true }, (tabs) => {
				tabs.forEach((tab) => {
					if (tab.id && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) chrome.tabs.reload(tab.id);
				});
			});
		});
		const runs = /* @__PURE__ */ new Map();
		function interpolate(str, params) {
			if (typeof str !== "string") return str;
			return str.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? "");
		}
		function PRE_RESOLVE_TARGET(abstractTarget) {
			const CACHE_MS = 720 * 60 * 60 * 1e3;
			if (abstractTarget.cachedSelector && (abstractTarget.cachedConfidence || 0) >= .85 && abstractTarget.resolvedOn) {
				if (Date.now() - new Date(abstractTarget.resolvedOn).getTime() < CACHE_MS) {
					if (document.querySelector(abstractTarget.cachedSelector)) return {
						selector: abstractTarget.cachedSelector,
						confidence: abstractTarget.cachedConfidence,
						resolvedVia: "cached",
						found: true
					};
				}
			}
			const labels = abstractTarget.match?.vuetify_label || abstractTarget.semanticKeys || [];
			for (const labelText of labels) {
				const l = labelText.toLowerCase();
				for (const lb of document.querySelectorAll(".v-label")) if (lb.textContent?.trim().toLowerCase().includes(l)) {
					const inp = lb.closest(".v-input")?.querySelector("input,textarea");
					if (inp) return {
						selector: inp.id ? "#" + inp.id : null,
						confidence: .88,
						resolvedVia: "vuetify_label_match",
						found: true,
						elementId: inp.id
					};
				}
				for (const div of document.querySelectorAll(".mb-2,.text-body-2")) if (div.textContent?.trim().toLowerCase().includes(l) && !div.querySelector("input")) {
					let sib = div.nextElementSibling;
					while (sib) {
						const inp = sib.querySelector("input,textarea");
						if (inp) return {
							selector: inp.id ? "#" + inp.id : null,
							confidence: .88,
							resolvedVia: "vuetify_label_match",
							found: true,
							elementId: inp.id
						};
						sib = sib.nextElementSibling;
					}
					const inp = div.parentElement?.nextElementSibling?.querySelector("input,textarea");
					if (inp) return {
						selector: inp.id ? "#" + inp.id : null,
						confidence: .88,
						resolvedVia: "vuetify_label_match",
						found: true,
						elementId: inp.id
					};
				}
			}
			if (abstractTarget.match?.name_contains) for (const nm of abstractTarget.match.name_contains) {
				const btn = Array.from(document.querySelectorAll("button,[role=\"button\"]")).find((b) => b.textContent?.trim().toLowerCase().includes(nm.toLowerCase()) || b.getAttribute("aria-label")?.toLowerCase().includes(nm.toLowerCase()));
				if (btn) return {
					selector: btn.id ? "#" + btn.id : null,
					confidence: .85,
					resolvedVia: "aria",
					found: true,
					buttonText: btn.textContent?.trim()
				};
			}
			for (const sel of abstractTarget.fallbackSelectors || []) if (document.querySelector(sel)) return {
				selector: sel,
				confidence: .6,
				resolvedVia: "css_cascade",
				found: true
			};
			return {
				found: false,
				selector: null,
				confidence: 0,
				resolvedVia: "escalate"
			};
		}
		function PRE_GUARDED_CLICK(selector, buttonText) {
			let el = selector ? document.querySelector(selector) : null;
			if (!el && buttonText) el = Array.from(document.querySelectorAll("button,[role=\"button\"],a")).find((b) => b.textContent?.trim().toLowerCase().includes(buttonText.toLowerCase())) || null;
			if (!el) return {
				ok: false,
				error: "Not found: " + (selector || buttonText)
			};
			el.click();
			return {
				ok: true,
				tag: el.tagName
			};
		}
		function PRE_GUARDED_READ(candidates) {
			for (const sel of candidates || []) {
				const el = document.querySelector(sel);
				if (el) return {
					text: el.textContent?.trim() || null,
					selector: sel,
					found: true
				};
			}
			return {
				text: null,
				found: false
			};
		}
		function PRE_ASSESS_STATE(stateGraph) {
			if (!stateGraph?.nodes) return { state: "unknown" };
			for (const [name, node] of Object.entries(stateGraph.nodes)) {
				if (!node.signals?.length) continue;
				if (node.signals.every((sig) => {
					if (sig.type === "url_matches") return new RegExp(sig.pattern).test(window.location.pathname);
					if (sig.type === "element_visible") return !!document.querySelector(sig.selector);
					if (sig.type === "element_text") return document.querySelector(sig.selector)?.textContent?.includes(sig.text) ?? false;
					return false;
				})) return { state: name };
			}
			return { state: "unknown" };
		}
		function PRE_FIND_ROW_AND_CLICK(identifier) {
			const rows = Array.from(document.querySelectorAll(".v-data-table__tr,tbody tr"));
			const match = rows.find((r) => r.textContent?.toLowerCase().includes(identifier.toLowerCase()));
			if (!match) return {
				found: false,
				rowCount: rows.length
			};
			const link = match.querySelector("a[href]");
			if (link) {
				link.click();
				return {
					found: true,
					href: link.href
				};
			}
			match.click();
			return {
				found: true,
				clicked: true
			};
		}
		function PRE_FIND_AND_CLICK_TEXT(text) {
			const match = Array.from(document.querySelectorAll("a,button,[role=\"button\"],[role=\"menuitem\"]")).find((e) => e.textContent?.trim().toLowerCase().includes(text.toLowerCase()));
			if (!match) return { found: false };
			match.click();
			return {
				found: true,
				tag: match.tagName,
				text: match.textContent?.trim()
			};
		}
		async function trustedType(tabId, selector, text) {
			const target = { tabId };
			try {
				await chrome.debugger.attach(target, "1.3");
			} catch (e) {
				if (!e.message?.includes("already attached")) throw e;
			}
			try {
				await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
					expression: `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.focus();el.click();el.select&&el.select();return true;})()`,
					returnByValue: true
				});
				await new Promise((r) => setTimeout(r, 80));
				await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
					type: "keyDown",
					key: "a",
					code: "KeyA",
					modifiers: 2,
					windowsVirtualKeyCode: 65,
					nativeVirtualKeyCode: 65
				});
				await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
					type: "keyUp",
					key: "a",
					code: "KeyA",
					modifiers: 2,
					windowsVirtualKeyCode: 65,
					nativeVirtualKeyCode: 65
				});
				await chrome.debugger.sendCommand(target, "Input.insertText", { text });
				await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
					type: "keyDown",
					key: "Tab",
					code: "Tab",
					windowsVirtualKeyCode: 9,
					nativeVirtualKeyCode: 9
				});
				await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
					type: "keyUp",
					key: "Tab",
					code: "Tab",
					windowsVirtualKeyCode: 9,
					nativeVirtualKeyCode: 9
				});
				return { ok: true };
			} finally {
				try {
					await chrome.debugger.detach(target);
				} catch (_) {}
			}
		}
		function navigateAndWait(tabId, url) {
			return new Promise((resolve) => {
				chrome.tabs.update(tabId, { url });
				function listener(updatedTabId, info) {
					if (updatedTabId === tabId && info.status === "complete") {
						chrome.tabs.onUpdated.removeListener(listener);
						setTimeout(() => resolve({
							ok: true,
							url
						}), 600);
					}
				}
				chrome.tabs.onUpdated.addListener(listener);
				setTimeout(() => {
					chrome.tabs.onUpdated.removeListener(listener);
					resolve({
						ok: true,
						url
					});
				}, 15e3);
			});
		}
		async function execInTab(tabId, func, args) {
			return (await chrome.scripting.executeScript({
				target: { tabId },
				func,
				args,
				world: "MAIN"
			}))?.[0]?.result;
		}
		async function executeStep(step, run) {
			const t0 = Date.now();
			const { tabId, params, buffer, abstractTargets } = run;
			const a = step.action;
			if (step.condition) {
				const val = interpolate(step.condition, {
					...params,
					...buffer
				});
				if (!val || val === "false" || val === "0" || val === "undefined") return {
					stepId: step.stepId,
					action: a,
					status: "skipped",
					durationMs: 0
				};
			}
			try {
				if (a === "navigate") {
					const r = await navigateAndWait(tabId, interpolate(step.url, {
						...params,
						...buffer
					}));
					return {
						stepId: step.stepId,
						action: a,
						status: "ok",
						url: r.url,
						durationMs: Date.now() - t0
					};
				}
				if (a === "type") {
					const value = interpolate(step.value || "", {
						...params,
						...buffer
					});
					const tgt = step.target ? abstractTargets?.[step.target] : null;
					let resolvedSelector = step.selector || null;
					let resolvedVia = "direct";
					let confidence = 1;
					if (tgt) {
						const res = await execInTab(tabId, PRE_RESOLVE_TARGET, [tgt]);
						if (!res?.found) throw new Error("Cannot resolve: " + step.target);
						resolvedSelector = res.selector;
						resolvedVia = res.resolvedVia;
						confidence = res.confidence;
						if (resolvedSelector && res.resolvedVia !== "cached") {
							tgt.cachedSelector = resolvedSelector;
							tgt.cachedConfidence = res.confidence;
							tgt.resolvedOn = (/* @__PURE__ */ new Date()).toISOString();
						}
					}
					if (!resolvedSelector) throw new Error("No selector for: " + (step.target || step.selector));
					await trustedType(tabId, resolvedSelector, value);
					return {
						stepId: step.stepId,
						action: a,
						status: "ok",
						value,
						selector: resolvedSelector,
						resolvedVia,
						confidence,
						target: step.target,
						durationMs: Date.now() - t0
					};
				}
				if (a === "click") {
					const tgt = step.target ? abstractTargets?.[step.target] : null;
					let resolvedSelector = step.selector || null;
					let resolvedVia = "direct";
					let buttonText = null;
					if (tgt) {
						const res = await execInTab(tabId, PRE_RESOLVE_TARGET, [tgt]);
						if (!res?.found) throw new Error("Cannot resolve: " + step.target);
						resolvedSelector = res.selector;
						resolvedVia = res.resolvedVia;
						buttonText = res.buttonText || null;
					}
					const r = await execInTab(tabId, PRE_GUARDED_CLICK, [resolvedSelector, buttonText]);
					if (!r?.ok) throw new Error(r?.error || "Click failed");
					return {
						stepId: step.stepId,
						action: a,
						status: "ok",
						selector: resolvedSelector,
						resolvedVia,
						target: step.target,
						durationMs: Date.now() - t0
					};
				}
				if (a === "wait_for") {
					const sel = interpolate(step.selector || step.target || "", params);
					const timeout = step.timeout || 8e3;
					const start = Date.now();
					while (Date.now() - start < timeout) {
						if (await execInTab(tabId, (s) => !!document.querySelector(s), [sel])) return {
							stepId: step.stepId,
							action: a,
							status: "ok",
							selector: sel,
							durationMs: Date.now() - t0
						};
						await new Promise((r) => setTimeout(r, 300));
					}
					throw new Error("wait_for timeout: " + sel);
				}
				if (a === "read") {
					const r = await execInTab(tabId, PRE_GUARDED_READ, [step.candidates || (step.selector ? [step.selector] : [])]);
					if (step.store_as) buffer[step.store_as] = r?.text || null;
					return {
						stepId: step.stepId,
						action: a,
						status: "ok",
						text: r?.text || null,
						selector: r?.selector,
						durationMs: Date.now() - t0
					};
				}
				if (a === "assess_state") {
					const r = await execInTab(tabId, PRE_ASSESS_STATE, [step.stateGraph || run.payload?.stateGraph || { nodes: {} }]);
					const matched = !step.expect?.state || r?.state === step.expect.state;
					return {
						stepId: step.stepId,
						action: a,
						status: "ok",
						state: r?.state,
						matched,
						durationMs: Date.now() - t0
					};
				}
				if (a === "js") {
					const r = await execInTab(tabId, (c) => {
						try {
							return new Function(c)();
						} catch (e) {
							return { __error: e.message };
						}
					}, [interpolate(step.code || "", {
						...params,
						...buffer
					})]);
					if (r?.__error) throw new Error(r.__error);
					if (step.store_as) buffer[step.store_as] = r;
					return {
						stepId: step.stepId,
						action: a,
						status: "ok",
						result: r,
						durationMs: Date.now() - t0
					};
				}
				if (a === "find_row") {
					const identifier = interpolate(step.identifier || step.value || "", {
						...params,
						...buffer
					});
					const r = await execInTab(tabId, PRE_FIND_ROW_AND_CLICK, [identifier]);
					if (!r?.found) throw new Error("Row not found: " + identifier);
					return {
						stepId: step.stepId,
						action: a,
						status: "ok",
						result: r,
						durationMs: Date.now() - t0
					};
				}
				if (a === "click_text") {
					const text = interpolate(step.text || "", {
						...params,
						...buffer
					});
					const r = await execInTab(tabId, PRE_FIND_AND_CLICK_TEXT, [text]);
					if (!r?.found) throw new Error("Text not found: " + text);
					return {
						stepId: step.stepId,
						action: a,
						status: "ok",
						result: r,
						durationMs: Date.now() - t0
					};
				}
				return {
					stepId: step.stepId,
					action: a,
					status: "unsupported",
					durationMs: Date.now() - t0
				};
			} catch (err) {
				return {
					stepId: step.stepId,
					action: a,
					status: "error",
					error: err.message,
					durationMs: Date.now() - t0
				};
			}
		}
		async function startRun(runId, payload, params, tabId) {
			const chain = payload.chain || [];
			const run = {
				runId,
				payload,
				params,
				tabId,
				abstractTargets: JSON.parse(JSON.stringify(payload.abstractTargets || {})),
				buffer: {},
				stepIndex: 0,
				status: "running",
				result: null,
				stepResults: [],
				resolvedTargets: []
			};
			runs.set(runId, run);
			const t0 = Date.now();
			try {
				for (let i = 0; i < chain.length; i++) {
					run.stepIndex = i;
					const step = chain[i];
					const res = await executeStep(step, run);
					run.stepResults.push(res);
					if (res.selector && res.resolvedVia && step.target) run.resolvedTargets.push({
						abstractName: step.target,
						selector: res.selector,
						confidence: res.confidence || 0,
						resolvedVia: res.resolvedVia,
						resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					if (step.action === "assess_state" && !res.matched && step.onMismatch) {
						const branchName = step.onMismatch.replace("branch:", "");
						const branchSteps = payload.branches?.[branchName]?.steps || payload.branches?.[branchName] || [];
						for (const bStep of branchSteps) {
							const bRes = await executeStep(bStep, run);
							run.stepResults.push(bRes);
							if (bRes.status === "error") {
								run.status = "failed";
								run.result = {
									success: false,
									error: bRes.error,
									stepsExecuted: run.stepResults.length,
									stepResults: run.stepResults,
									buffer: run.buffer,
									durationMs: Date.now() - t0,
									resolvedTargets: run.resolvedTargets
								};
								await chrome.storage.session.set({ [runId]: run.result });
								return;
							}
						}
					}
					if (res.status === "error") {
						run.status = "failed";
						run.result = {
							success: false,
							error: res.error,
							stepsExecuted: run.stepResults.length,
							stepResults: run.stepResults,
							buffer: run.buffer,
							durationMs: Date.now() - t0,
							resolvedTargets: run.resolvedTargets
						};
						await chrome.storage.session.set({ [runId]: run.result });
						return;
					}
				}
				run.status = "complete";
				run.result = {
					success: true,
					stepsExecuted: run.stepResults.length,
					stepResults: run.stepResults,
					buffer: run.buffer,
					durationMs: Date.now() - t0,
					resolvedTargets: run.resolvedTargets
				};
				await chrome.storage.session.set({ [runId]: run.result });
			} catch (err) {
				run.status = "failed";
				run.result = {
					success: false,
					error: err.message,
					stepsExecuted: run.stepResults.length,
					stepResults: run.stepResults,
					buffer: run.buffer,
					durationMs: Date.now() - t0,
					resolvedTargets: run.resolvedTargets
				};
				await chrome.storage.session.set({ [runId]: run.result });
			}
		}
		chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
			if (msg.type === "skill_run") {
				const runId = crypto.randomUUID();
				const tabId = msg.tabId || sender.tab?.id;
				if (!tabId) {
					sendResponse({ error: "No tabId" });
					return true;
				}
				startRun(runId, msg.payload, msg.params || {}, tabId);
				sendResponse({
					runId,
					status: "started"
				});
				return true;
			}
			if (msg.type === "get_status") {
				const run = runs.get(msg.runId);
				if (run) sendResponse({
					status: run.status,
					stepIndex: run.stepIndex,
					totalSteps: run.payload?.chain?.length || 0,
					result: run.result
				});
				else chrome.storage.session.get(msg.runId).then((data) => {
					const result = data[msg.runId];
					sendResponse(result ? {
						status: "complete",
						result
					} : { status: "not_found" });
				});
				return true;
			}
			if (msg.type === "abort") {
				const run = runs.get(msg.runId);
				if (run) {
					run.status = "aborted";
					runs.delete(msg.runId);
				}
				sendResponse({ aborted: true });
				return true;
			}
			if (msg.type === "content_ready") return false;
		});
	});
	//#endregion
	//#region node_modules/wxt/dist/browser.mjs
	/**
	* Contains the `browser` export which you should use to access the extension
	* APIs in your project:
	*
	* ```ts
	* import { browser } from 'wxt/browser';
	*
	* browser.runtime.onInstalled.addListener(() => {
	*   // ...
	* });
	* ```
	*
	* @module wxt/browser
	*/
	var browser = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
	//#endregion
	//#region node_modules/@webext-core/match-patterns/lib/index.js
	var _MatchPattern = class {
		constructor(matchPattern) {
			if (matchPattern === "<all_urls>") {
				this.isAllUrls = true;
				this.protocolMatches = [..._MatchPattern.PROTOCOLS];
				this.hostnameMatch = "*";
				this.pathnameMatch = "*";
			} else {
				const groups = /(.*):\/\/(.*?)(\/.*)/.exec(matchPattern);
				if (groups == null) throw new InvalidMatchPattern(matchPattern, "Incorrect format");
				const [_, protocol, hostname, pathname] = groups;
				validateProtocol(matchPattern, protocol);
				validateHostname(matchPattern, hostname);
				validatePathname(matchPattern, pathname);
				this.protocolMatches = protocol === "*" ? ["http", "https"] : [protocol];
				this.hostnameMatch = hostname;
				this.pathnameMatch = pathname;
			}
		}
		includes(url) {
			if (this.isAllUrls) return true;
			const u = typeof url === "string" ? new URL(url) : url instanceof Location ? new URL(url.href) : url;
			return !!this.protocolMatches.find((protocol) => {
				if (protocol === "http") return this.isHttpMatch(u);
				if (protocol === "https") return this.isHttpsMatch(u);
				if (protocol === "file") return this.isFileMatch(u);
				if (protocol === "ftp") return this.isFtpMatch(u);
				if (protocol === "urn") return this.isUrnMatch(u);
			});
		}
		isHttpMatch(url) {
			return url.protocol === "http:" && this.isHostPathMatch(url);
		}
		isHttpsMatch(url) {
			return url.protocol === "https:" && this.isHostPathMatch(url);
		}
		isHostPathMatch(url) {
			if (!this.hostnameMatch || !this.pathnameMatch) return false;
			const hostnameMatchRegexs = [this.convertPatternToRegex(this.hostnameMatch), this.convertPatternToRegex(this.hostnameMatch.replace(/^\*\./, ""))];
			const pathnameMatchRegex = this.convertPatternToRegex(this.pathnameMatch);
			return !!hostnameMatchRegexs.find((regex) => regex.test(url.hostname)) && pathnameMatchRegex.test(url.pathname);
		}
		isFileMatch(url) {
			throw Error("Not implemented: file:// pattern matching. Open a PR to add support");
		}
		isFtpMatch(url) {
			throw Error("Not implemented: ftp:// pattern matching. Open a PR to add support");
		}
		isUrnMatch(url) {
			throw Error("Not implemented: urn:// pattern matching. Open a PR to add support");
		}
		convertPatternToRegex(pattern) {
			const starsReplaced = this.escapeForRegex(pattern).replace(/\\\*/g, ".*");
			return RegExp(`^${starsReplaced}$`);
		}
		escapeForRegex(string) {
			return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
	};
	var MatchPattern = _MatchPattern;
	MatchPattern.PROTOCOLS = [
		"http",
		"https",
		"file",
		"ftp",
		"urn"
	];
	var InvalidMatchPattern = class extends Error {
		constructor(matchPattern, reason) {
			super(`Invalid match pattern "${matchPattern}": ${reason}`);
		}
	};
	function validateProtocol(matchPattern, protocol) {
		if (!MatchPattern.PROTOCOLS.includes(protocol) && protocol !== "*") throw new InvalidMatchPattern(matchPattern, `${protocol} not a valid protocol (${MatchPattern.PROTOCOLS.join(", ")})`);
	}
	function validateHostname(matchPattern, hostname) {
		if (hostname.includes(":")) throw new InvalidMatchPattern(matchPattern, `Hostname cannot include a port`);
		if (hostname.includes("*") && hostname.length > 1 && !hostname.startsWith("*.")) throw new InvalidMatchPattern(matchPattern, `If using a wildcard (*), it must go at the start of the hostname`);
	}
	function validatePathname(matchPattern, pathname) {}
	//#endregion
	//#region \0virtual:wxt-background-entrypoint?/Users/mikewolf/Projects/yeshie/packages/extension/src/entrypoints/background.ts
	function print(method, ...args) {
		if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
		else method("[wxt]", ...args);
	}
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger = {
		debug: (...args) => print(console.debug, ...args),
		log: (...args) => print(console.log, ...args),
		warn: (...args) => print(console.warn, ...args),
		error: (...args) => print(console.error, ...args)
	};
	var ws;
	/** Connect to the websocket and listen for messages. */
	function getDevServerWebSocket() {
		if (ws == null) {
			const serverUrl = "ws://localhost:3000";
			logger.debug("Connecting to dev server @", serverUrl);
			ws = new WebSocket(serverUrl, "vite-hmr");
			ws.addWxtEventListener = ws.addEventListener.bind(ws);
			ws.sendCustom = (event, payload) => ws?.send(JSON.stringify({
				type: "custom",
				event,
				payload
			}));
			ws.addEventListener("open", () => {
				logger.debug("Connected to dev server");
			});
			ws.addEventListener("close", () => {
				logger.debug("Disconnected from dev server");
			});
			ws.addEventListener("error", (event) => {
				logger.error("Failed to connect to dev server", event);
			});
			ws.addEventListener("message", (e) => {
				try {
					const message = JSON.parse(e.data);
					if (message.type === "custom") ws?.dispatchEvent(new CustomEvent(message.event, { detail: message.data }));
				} catch (err) {
					logger.error("Failed to handle message", err);
				}
			});
		}
		return ws;
	}
	/** https://developer.chrome.com/blog/longer-esw-lifetimes/ */
	function keepServiceWorkerAlive() {
		setInterval(async () => {
			await browser.runtime.getPlatformInfo();
		}, 5e3);
	}
	function reloadContentScript(payload) {
		if (browser.runtime.getManifest().manifest_version == 2) reloadContentScriptMv2(payload);
		else reloadContentScriptMv3(payload);
	}
	async function reloadContentScriptMv3({ registration, contentScript }) {
		if (registration === "runtime") await reloadRuntimeContentScriptMv3(contentScript);
		else await reloadManifestContentScriptMv3(contentScript);
	}
	async function reloadManifestContentScriptMv3(contentScript) {
		const id = `wxt:${contentScript.js[0]}`;
		logger.log("Reloading content script:", contentScript);
		const registered = await browser.scripting.getRegisteredContentScripts();
		logger.debug("Existing scripts:", registered);
		const existing = registered.find((cs) => cs.id === id);
		if (existing) {
			logger.debug("Updating content script", existing);
			await browser.scripting.updateContentScripts([{
				...contentScript,
				id,
				css: contentScript.css ?? []
			}]);
		} else {
			logger.debug("Registering new content script...");
			await browser.scripting.registerContentScripts([{
				...contentScript,
				id,
				css: contentScript.css ?? []
			}]);
		}
		await reloadTabsForContentScript(contentScript);
	}
	async function reloadRuntimeContentScriptMv3(contentScript) {
		logger.log("Reloading content script:", contentScript);
		const registered = await browser.scripting.getRegisteredContentScripts();
		logger.debug("Existing scripts:", registered);
		const matches = registered.filter((cs) => {
			const hasJs = contentScript.js?.find((js) => cs.js?.includes(js));
			const hasCss = contentScript.css?.find((css) => cs.css?.includes(css));
			return hasJs || hasCss;
		});
		if (matches.length === 0) {
			logger.log("Content script is not registered yet, nothing to reload", contentScript);
			return;
		}
		await browser.scripting.updateContentScripts(matches);
		await reloadTabsForContentScript(contentScript);
	}
	async function reloadTabsForContentScript(contentScript) {
		const allTabs = await browser.tabs.query({});
		const matchPatterns = contentScript.matches.map((match) => new MatchPattern(match));
		const matchingTabs = allTabs.filter((tab) => {
			const url = tab.url;
			if (!url) return false;
			return !!matchPatterns.find((pattern) => pattern.includes(url));
		});
		await Promise.all(matchingTabs.map(async (tab) => {
			try {
				await browser.tabs.reload(tab.id);
			} catch (err) {
				logger.warn("Failed to reload tab:", err);
			}
		}));
	}
	async function reloadContentScriptMv2(_payload) {
		throw Error("TODO: reloadContentScriptMv2");
	}
	try {
		const ws = getDevServerWebSocket();
		ws.addWxtEventListener("wxt:reload-extension", () => {
			browser.runtime.reload();
		});
		ws.addWxtEventListener("wxt:reload-content-script", (event) => {
			reloadContentScript(event.detail);
		});
		ws.addEventListener("open", () => ws.sendCustom("wxt:background-initialized"));
		keepServiceWorkerAlive();
	} catch (err) {
		logger.error("Failed to setup web socket connection with dev server", err);
	}
	browser.commands.onCommand.addListener((command) => {
		if (command === "wxt:reload-extension") browser.runtime.reload();
	});
	var result;
	try {
		result = background_default.main();
		if (result instanceof Promise) console.warn("The background's main() function return a promise, but it must be synchronous");
	} catch (err) {
		logger.error("The background crashed on startup!");
		throw err;
	}
	//#endregion
	return result;
})();

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsIm5hbWVzIjpbImJyb3dzZXIiXSwic291cmNlcyI6WyIuLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvZGVmaW5lLWJhY2tncm91bmQubWpzIiwiLi4vLi4vc3JjL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0B3ZWJleHQtY29yZS9tYXRjaC1wYXR0ZXJucy9saWIvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8jcmVnaW9uIHNyYy91dGlscy9kZWZpbmUtYmFja2dyb3VuZC50c1xuZnVuY3Rpb24gZGVmaW5lQmFja2dyb3VuZChhcmcpIHtcblx0aWYgKGFyZyA9PSBudWxsIHx8IHR5cGVvZiBhcmcgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIHsgbWFpbjogYXJnIH07XG5cdHJldHVybiBhcmc7XG59XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGRlZmluZUJhY2tncm91bmQgfTtcbiIsImV4cG9ydCBkZWZhdWx0IGRlZmluZUJhY2tncm91bmQoKCkgPT4ge1xuICBjb25zb2xlLmxvZygnW1llc2hpZV0gQmFja2dyb3VuZCB3b3JrZXIgc3RhcnRlZCcpO1xuXG4gIC8vIOKUgOKUgCBEZXY6IHJlbG9hZCBhY3RpdmUgdGFicyB3aGVuIGV4dGVuc2lvbiB1cGRhdGVzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAvLyBXWFQgaGFuZGxlcyBITVIgZm9yIHRoZSBleHRlbnNpb24gaXRzZWxmOyB0aGlzIHJlbG9hZHMgdGhlIGFjdGl2ZSBwYWdlXG4gIC8vIHNvIHRoZSBuZXcgY29udGVudCBzY3JpcHQgaXMgaW5qZWN0ZWQgYXV0b21hdGljYWxseVxuICBjaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcigoZGV0YWlscykgPT4ge1xuICAgIGlmIChkZXRhaWxzLnJlYXNvbiA9PT0gJ3VwZGF0ZScgfHwgZGV0YWlscy5yZWFzb24gPT09ICdpbnN0YWxsJykge1xuICAgICAgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUgfSwgKHRhYnMpID0+IHtcbiAgICAgICAgdGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgICAgaWYgKHRhYi5pZCAmJiB0YWIudXJsICYmICF0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZTovLycpICYmICF0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1leHRlbnNpb246Ly8nKSkge1xuICAgICAgICAgICAgY2hyb21lLnRhYnMucmVsb2FkKHRhYi5pZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8g4pSA4pSAIFJ1biBzdGF0ZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgY29uc3QgcnVucyA9IG5ldyBNYXA8c3RyaW5nLCBhbnk+KCk7XG5cbiAgLy8g4pSA4pSAIEhlbHBlcnMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIGZ1bmN0aW9uIGludGVycG9sYXRlKHN0cjogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBzdHJpbmcge1xuICAgIGlmICh0eXBlb2Ygc3RyICE9PSAnc3RyaW5nJykgcmV0dXJuIHN0cjtcbiAgICByZXR1cm4gc3RyLnJlcGxhY2UoL1xce1xceyhcXHcrKVxcfVxcfS9nLCAoXywgaykgPT4gcGFyYW1zW2tdID8/ICcnKTtcbiAgfVxuXG4gIC8vIOKUgOKUgCBQcmUtYnVuZGxlZCBmdW5jdGlvbnMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIC8vIFNlbGYtY29udGFpbmVkIOKAlCBwYXNzZWQgYXMgZnVuYyB0byBleGVjdXRlU2NyaXB0IChNQUlOIHdvcmxkLCBubyBpbXBvcnRzKVxuXG4gIGZ1bmN0aW9uIFBSRV9GSU5EX0JZX0xBQkVMKGxhYmVsVGV4dDogc3RyaW5nKSB7XG4gICAgY29uc3QgbG93ZXIgPSBsYWJlbFRleHQudG9Mb3dlckNhc2UoKTtcbiAgICBmb3IgKGNvbnN0IGxiIG9mIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy52LWxhYmVsJykpIHtcbiAgICAgIGlmIChsYi50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobG93ZXIpKSB7XG4gICAgICAgIGNvbnN0IGlucCA9IGxiLmNsb3Nlc3QoJy52LWlucHV0Jyk/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LHRleHRhcmVhJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgICAgIGlmIChpbnApIHJldHVybiB7IGlkOiBpbnAuaWQsIHNlbGVjdG9yOiBpbnAuaWQgPyAnIycgKyBpbnAuaWQgOiBudWxsLCBmb3VuZDogdHJ1ZSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGRpdiBvZiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubWItMiwudGV4dC1ib2R5LTInKSkge1xuICAgICAgaWYgKGRpdi50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobG93ZXIpICYmICFkaXYucXVlcnlTZWxlY3RvcignaW5wdXQnKSkge1xuICAgICAgICBsZXQgc2liID0gZGl2Lm5leHRFbGVtZW50U2libGluZztcbiAgICAgICAgd2hpbGUgKHNpYikge1xuICAgICAgICAgIGNvbnN0IGlucCA9IHNpYi5xdWVyeVNlbGVjdG9yKCdpbnB1dCx0ZXh0YXJlYScpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgICAgICAgIGlmIChpbnApIHJldHVybiB7IGlkOiBpbnAuaWQsIHNlbGVjdG9yOiBpbnAuaWQgPyAnIycgKyBpbnAuaWQgOiBudWxsLCBmb3VuZDogdHJ1ZSB9O1xuICAgICAgICAgIHNpYiA9IHNpYi5uZXh0RWxlbWVudFNpYmxpbmc7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaW5wID0gZGl2LnBhcmVudEVsZW1lbnQ/Lm5leHRFbGVtZW50U2libGluZz8ucXVlcnlTZWxlY3RvcignaW5wdXQsdGV4dGFyZWEnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKGlucCkgcmV0dXJuIHsgaWQ6IGlucC5pZCwgc2VsZWN0b3I6IGlucC5pZCA/ICcjJyArIGlucC5pZCA6IG51bGwsIGZvdW5kOiB0cnVlIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgaW5wdXRbYXJpYS1sYWJlbCo9XCIke2xhYmVsVGV4dH1cIiBpXSxpbnB1dFtwbGFjZWhvbGRlcio9XCIke2xhYmVsVGV4dH1cIiBpXWApIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIGlmIChlbCkgcmV0dXJuIHsgaWQ6IGVsLmlkLCBzZWxlY3RvcjogZWwuaWQgPyAnIycgKyBlbC5pZCA6IG51bGwsIGZvdW5kOiB0cnVlIH07XG4gICAgcmV0dXJuIHsgZm91bmQ6IGZhbHNlLCBzZWxlY3RvcjogbnVsbCB9O1xuICB9XG5cbiAgZnVuY3Rpb24gUFJFX1JFU09MVkVfVEFSR0VUKGFic3RyYWN0VGFyZ2V0OiBhbnkpIHtcbiAgICBjb25zdCBDQUNIRV9NUyA9IDMwICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICBpZiAoYWJzdHJhY3RUYXJnZXQuY2FjaGVkU2VsZWN0b3IgJiYgKGFic3RyYWN0VGFyZ2V0LmNhY2hlZENvbmZpZGVuY2UgfHwgMCkgPj0gMC44NSAmJiBhYnN0cmFjdFRhcmdldC5yZXNvbHZlZE9uKSB7XG4gICAgICBjb25zdCBhZ2UgPSBEYXRlLm5vdygpIC0gbmV3IERhdGUoYWJzdHJhY3RUYXJnZXQucmVzb2x2ZWRPbikuZ2V0VGltZSgpO1xuICAgICAgaWYgKGFnZSA8IENBQ0hFX01TKSB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhYnN0cmFjdFRhcmdldC5jYWNoZWRTZWxlY3Rvcik7XG4gICAgICAgIGlmIChlbCkgcmV0dXJuIHsgc2VsZWN0b3I6IGFic3RyYWN0VGFyZ2V0LmNhY2hlZFNlbGVjdG9yLCBjb25maWRlbmNlOiBhYnN0cmFjdFRhcmdldC5jYWNoZWRDb25maWRlbmNlLCByZXNvbHZlZFZpYTogJ2NhY2hlZCcsIGZvdW5kOiB0cnVlIH07XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGxhYmVsczogc3RyaW5nW10gPSBhYnN0cmFjdFRhcmdldC5tYXRjaD8udnVldGlmeV9sYWJlbCB8fCBhYnN0cmFjdFRhcmdldC5zZW1hbnRpY0tleXMgfHwgW107XG4gICAgZm9yIChjb25zdCBsYWJlbFRleHQgb2YgbGFiZWxzKSB7XG4gICAgICBjb25zdCBsID0gbGFiZWxUZXh0LnRvTG93ZXJDYXNlKCk7XG4gICAgICBmb3IgKGNvbnN0IGxiIG9mIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy52LWxhYmVsJykpIHtcbiAgICAgICAgaWYgKGxiLnRleHRDb250ZW50Py50cmltKCkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhsKSkge1xuICAgICAgICAgIGNvbnN0IGlucCA9IGxiLmNsb3Nlc3QoJy52LWlucHV0Jyk/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LHRleHRhcmVhJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgICAgICAgaWYgKGlucCkgcmV0dXJuIHsgc2VsZWN0b3I6IGlucC5pZCA/ICcjJyArIGlucC5pZCA6IG51bGwsIGNvbmZpZGVuY2U6IDAuODgsIHJlc29sdmVkVmlhOiAndnVldGlmeV9sYWJlbF9tYXRjaCcsIGZvdW5kOiB0cnVlLCBlbGVtZW50SWQ6IGlucC5pZCB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IGRpdiBvZiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubWItMiwudGV4dC1ib2R5LTInKSkge1xuICAgICAgICBpZiAoZGl2LnRleHRDb250ZW50Py50cmltKCkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhsKSAmJiAhZGl2LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykpIHtcbiAgICAgICAgICBsZXQgc2liID0gZGl2Lm5leHRFbGVtZW50U2libGluZztcbiAgICAgICAgICB3aGlsZSAoc2liKSB7XG4gICAgICAgICAgICBjb25zdCBpbnAgPSBzaWIucXVlcnlTZWxlY3RvcignaW5wdXQsdGV4dGFyZWEnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgICAgIGlmIChpbnApIHJldHVybiB7IHNlbGVjdG9yOiBpbnAuaWQgPyAnIycgKyBpbnAuaWQgOiBudWxsLCBjb25maWRlbmNlOiAwLjg4LCByZXNvbHZlZFZpYTogJ3Z1ZXRpZnlfbGFiZWxfbWF0Y2gnLCBmb3VuZDogdHJ1ZSwgZWxlbWVudElkOiBpbnAuaWQgfTtcbiAgICAgICAgICAgIHNpYiA9IHNpYi5uZXh0RWxlbWVudFNpYmxpbmc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IGlucCA9IGRpdi5wYXJlbnRFbGVtZW50Py5uZXh0RWxlbWVudFNpYmxpbmc/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LHRleHRhcmVhJykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgICAgICAgaWYgKGlucCkgcmV0dXJuIHsgc2VsZWN0b3I6IGlucC5pZCA/ICcjJyArIGlucC5pZCA6IG51bGwsIGNvbmZpZGVuY2U6IDAuODgsIHJlc29sdmVkVmlhOiAndnVldGlmeV9sYWJlbF9tYXRjaCcsIGZvdW5kOiB0cnVlLCBlbGVtZW50SWQ6IGlucC5pZCB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChhYnN0cmFjdFRhcmdldC5tYXRjaD8ubmFtZV9jb250YWlucykge1xuICAgICAgZm9yIChjb25zdCBubSBvZiBhYnN0cmFjdFRhcmdldC5tYXRjaC5uYW1lX2NvbnRhaW5zKSB7XG4gICAgICAgIGNvbnN0IGJ0biA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uLFtyb2xlPVwiYnV0dG9uXCJdJykpXG4gICAgICAgICAgLmZpbmQoKGI6IGFueSkgPT4gYi50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobm0udG9Mb3dlckNhc2UoKSkgfHwgYi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKT8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhubS50b0xvd2VyQ2FzZSgpKSkgYXMgSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChidG4pIHJldHVybiB7IHNlbGVjdG9yOiAoYnRuIGFzIEhUTUxFbGVtZW50KS5pZCA/ICcjJyArIChidG4gYXMgSFRNTEVsZW1lbnQpLmlkIDogbnVsbCwgY29uZmlkZW5jZTogMC44NSwgcmVzb2x2ZWRWaWE6ICdhcmlhJywgZm91bmQ6IHRydWUsIGJ1dHRvblRleHQ6IGJ0bi50ZXh0Q29udGVudD8udHJpbSgpIH07XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc2VsIG9mIChhYnN0cmFjdFRhcmdldC5mYWxsYmFja1NlbGVjdG9ycyB8fCBbXSkpIHtcbiAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWwpO1xuICAgICAgaWYgKGVsKSByZXR1cm4geyBzZWxlY3Rvcjogc2VsLCBjb25maWRlbmNlOiAwLjYsIHJlc29sdmVkVmlhOiAnY3NzX2Nhc2NhZGUnLCBmb3VuZDogdHJ1ZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBmb3VuZDogZmFsc2UsIHNlbGVjdG9yOiBudWxsLCBjb25maWRlbmNlOiAwLCByZXNvbHZlZFZpYTogJ2VzY2FsYXRlJyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gUFJFX0dVQVJERURfQ0xJQ0soc2VsZWN0b3I6IHN0cmluZyB8IG51bGwsIGJ1dHRvblRleHQ6IHN0cmluZyB8IG51bGwpIHtcbiAgICBsZXQgZWw6IEVsZW1lbnQgfCBudWxsID0gc2VsZWN0b3IgPyBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKSA6IG51bGw7XG4gICAgaWYgKCFlbCAmJiBidXR0b25UZXh0KSB7XG4gICAgICBlbCA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uLFtyb2xlPVwiYnV0dG9uXCJdLGEnKSlcbiAgICAgICAgLmZpbmQoKGI6IGFueSkgPT4gYi50ZXh0Q29udGVudD8udHJpbSgpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoYnV0dG9uVGV4dC50b0xvd2VyQ2FzZSgpKSkgfHwgbnVsbDtcbiAgICB9XG4gICAgaWYgKCFlbCkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ05vdCBmb3VuZDogJyArIChzZWxlY3RvciB8fCBidXR0b25UZXh0KSB9O1xuICAgIChlbCBhcyBIVE1MRWxlbWVudCkuY2xpY2soKTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgdGFnOiBlbC50YWdOYW1lIH07XG4gIH1cblxuICBmdW5jdGlvbiBQUkVfR1VBUkRFRF9SRUFEKGNhbmRpZGF0ZXM6IHN0cmluZ1tdKSB7XG4gICAgZm9yIChjb25zdCBzZWwgb2YgKGNhbmRpZGF0ZXMgfHwgW10pKSB7XG4gICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgIGlmIChlbCkgcmV0dXJuIHsgdGV4dDogZWwudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBudWxsLCBzZWxlY3Rvcjogc2VsLCBmb3VuZDogdHJ1ZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyB0ZXh0OiBudWxsLCBmb3VuZDogZmFsc2UgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIFBSRV9BU1NFU1NfU1RBVEUoc3RhdGVHcmFwaDogYW55KSB7XG4gICAgaWYgKCFzdGF0ZUdyYXBoPy5ub2RlcykgcmV0dXJuIHsgc3RhdGU6ICd1bmtub3duJyB9O1xuICAgIGZvciAoY29uc3QgW25hbWUsIG5vZGVdIG9mIE9iamVjdC5lbnRyaWVzKHN0YXRlR3JhcGgubm9kZXMpIGFzIGFueSkge1xuICAgICAgaWYgKCFub2RlLnNpZ25hbHM/Lmxlbmd0aCkgY29udGludWU7XG4gICAgICBjb25zdCBhbGxNYXRjaCA9IG5vZGUuc2lnbmFscy5ldmVyeSgoc2lnOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKHNpZy50eXBlID09PSAndXJsX21hdGNoZXMnKSByZXR1cm4gbmV3IFJlZ0V4cChzaWcucGF0dGVybikudGVzdCh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUpO1xuICAgICAgICBpZiAoc2lnLnR5cGUgPT09ICdlbGVtZW50X3Zpc2libGUnKSByZXR1cm4gISFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNpZy5zZWxlY3Rvcik7XG4gICAgICAgIGlmIChzaWcudHlwZSA9PT0gJ2VsZW1lbnRfdGV4dCcpIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNpZy5zZWxlY3Rvcik/LnRleHRDb250ZW50Py5pbmNsdWRlcyhzaWcudGV4dCkgPz8gZmFsc2U7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICAgICAgaWYgKGFsbE1hdGNoKSByZXR1cm4geyBzdGF0ZTogbmFtZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBzdGF0ZTogJ3Vua25vd24nIH07XG4gIH1cblxuICBmdW5jdGlvbiBQUkVfRklORF9ST1dfQU5EX0NMSUNLKGlkZW50aWZpZXI6IHN0cmluZykge1xuICAgIGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy52LWRhdGEtdGFibGVfX3RyLHRib2R5IHRyJykpO1xuICAgIGNvbnN0IG1hdGNoID0gcm93cy5maW5kKHIgPT4gci50ZXh0Q29udGVudD8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhpZGVudGlmaWVyLnRvTG93ZXJDYXNlKCkpKTtcbiAgICBpZiAoIW1hdGNoKSByZXR1cm4geyBmb3VuZDogZmFsc2UsIHJvd0NvdW50OiByb3dzLmxlbmd0aCB9O1xuICAgIGNvbnN0IGxpbmsgPSBtYXRjaC5xdWVyeVNlbGVjdG9yKCdhW2hyZWZdJykgYXMgSFRNTEFuY2hvckVsZW1lbnQgfCBudWxsO1xuICAgIGlmIChsaW5rKSB7IGxpbmsuY2xpY2soKTsgcmV0dXJuIHsgZm91bmQ6IHRydWUsIGhyZWY6IGxpbmsuaHJlZiB9OyB9XG4gICAgKG1hdGNoIGFzIEhUTUxFbGVtZW50KS5jbGljaygpO1xuICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCBjbGlja2VkOiB0cnVlIH07XG4gIH1cblxuICBmdW5jdGlvbiBQUkVfRklORF9BTkRfQ0xJQ0tfVEVYVCh0ZXh0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBlbHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2EsYnV0dG9uLFtyb2xlPVwiYnV0dG9uXCJdLFtyb2xlPVwibWVudWl0ZW1cIl0nKSk7XG4gICAgY29uc3QgbWF0Y2ggPSBlbHMuZmluZCgoZTogYW55KSA9PiBlLnRleHRDb250ZW50Py50cmltKCkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXh0LnRvTG93ZXJDYXNlKCkpKSBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcbiAgICBpZiAoIW1hdGNoKSByZXR1cm4geyBmb3VuZDogZmFsc2UgfTtcbiAgICBtYXRjaC5jbGljaygpO1xuICAgIHJldHVybiB7IGZvdW5kOiB0cnVlLCB0YWc6IG1hdGNoLnRhZ05hbWUsIHRleHQ6IG1hdGNoLnRleHRDb250ZW50Py50cmltKCkgfTtcbiAgfVxuXG4gIC8vIOKUgOKUgCBUcnVzdGVkIHR5cGUgdmlhIGNocm9tZS5kZWJ1Z2dlciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgYXN5bmMgZnVuY3Rpb24gdHJ1c3RlZFR5cGUodGFiSWQ6IG51bWJlciwgc2VsZWN0b3I6IHN0cmluZywgdGV4dDogc3RyaW5nKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0geyB0YWJJZCB9O1xuICAgIHRyeSB7IGF3YWl0IGNocm9tZS5kZWJ1Z2dlci5hdHRhY2godGFyZ2V0LCAnMS4zJyk7IH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgaWYgKCFlLm1lc3NhZ2U/LmluY2x1ZGVzKCdhbHJlYWR5IGF0dGFjaGVkJykpIHRocm93IGU7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjaHJvbWUuZGVidWdnZXIuc2VuZENvbW1hbmQodGFyZ2V0LCAnUnVudGltZS5ldmFsdWF0ZScsIHtcbiAgICAgICAgZXhwcmVzc2lvbjogYChmdW5jdGlvbigpe2NvbnN0IGVsPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJHtKU09OLnN0cmluZ2lmeShzZWxlY3Rvcil9KTtpZighZWwpcmV0dXJuIGZhbHNlO2VsLmZvY3VzKCk7ZWwuY2xpY2soKTtlbC5zZWxlY3QmJmVsLnNlbGVjdCgpO3JldHVybiB0cnVlO30pKClgLFxuICAgICAgICByZXR1cm5CeVZhbHVlOiB0cnVlXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA4MCkpO1xuICAgICAgYXdhaXQgY2hyb21lLmRlYnVnZ2VyLnNlbmRDb21tYW5kKHRhcmdldCwgJ0lucHV0LmRpc3BhdGNoS2V5RXZlbnQnLCB7IHR5cGU6ICdrZXlEb3duJywga2V5OiAnYScsIGNvZGU6ICdLZXlBJywgbW9kaWZpZXJzOiAyLCB3aW5kb3dzVmlydHVhbEtleUNvZGU6IDY1LCBuYXRpdmVWaXJ0dWFsS2V5Q29kZTogNjUgfSk7XG4gICAgICBhd2FpdCBjaHJvbWUuZGVidWdnZXIuc2VuZENvbW1hbmQodGFyZ2V0LCAnSW5wdXQuZGlzcGF0Y2hLZXlFdmVudCcsIHsgdHlwZTogJ2tleVVwJywga2V5OiAnYScsIGNvZGU6ICdLZXlBJywgbW9kaWZpZXJzOiAyLCB3aW5kb3dzVmlydHVhbEtleUNvZGU6IDY1LCBuYXRpdmVWaXJ0dWFsS2V5Q29kZTogNjUgfSk7XG4gICAgICBhd2FpdCBjaHJvbWUuZGVidWdnZXIuc2VuZENvbW1hbmQodGFyZ2V0LCAnSW5wdXQuaW5zZXJ0VGV4dCcsIHsgdGV4dCB9KTtcbiAgICAgIGF3YWl0IGNocm9tZS5kZWJ1Z2dlci5zZW5kQ29tbWFuZCh0YXJnZXQsICdJbnB1dC5kaXNwYXRjaEtleUV2ZW50JywgeyB0eXBlOiAna2V5RG93bicsIGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCB3aW5kb3dzVmlydHVhbEtleUNvZGU6IDksIG5hdGl2ZVZpcnR1YWxLZXlDb2RlOiA5IH0pO1xuICAgICAgYXdhaXQgY2hyb21lLmRlYnVnZ2VyLnNlbmRDb21tYW5kKHRhcmdldCwgJ0lucHV0LmRpc3BhdGNoS2V5RXZlbnQnLCB7IHR5cGU6ICdrZXlVcCcsIGtleTogJ1RhYicsIGNvZGU6ICdUYWInLCB3aW5kb3dzVmlydHVhbEtleUNvZGU6IDksIG5hdGl2ZVZpcnR1YWxLZXlDb2RlOiA5IH0pO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdHJ5IHsgYXdhaXQgY2hyb21lLmRlYnVnZ2VyLmRldGFjaCh0YXJnZXQpOyB9IGNhdGNoIChfKSB7fVxuICAgIH1cbiAgfVxuXG4gIC8vIOKUgOKUgCBOYXZpZ2F0aW9uIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBmdW5jdGlvbiBuYXZpZ2F0ZUFuZFdhaXQodGFiSWQ6IG51bWJlciwgdXJsOiBzdHJpbmcpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IHVybDogc3RyaW5nIH0+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNocm9tZS50YWJzLnVwZGF0ZSh0YWJJZCwgeyB1cmwgfSk7XG4gICAgICBmdW5jdGlvbiBsaXN0ZW5lcih1cGRhdGVkVGFiSWQ6IG51bWJlciwgaW5mbzogY2hyb21lLnRhYnMuVGFiQ2hhbmdlSW5mbykge1xuICAgICAgICBpZiAodXBkYXRlZFRhYklkID09PSB0YWJJZCAmJiBpbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgICAgICAgIGNocm9tZS50YWJzLm9uVXBkYXRlZC5yZW1vdmVMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKHsgb2s6IHRydWUsIHVybCB9KSwgNjAwKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKGxpc3RlbmVyKTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4geyBjaHJvbWUudGFicy5vblVwZGF0ZWQucmVtb3ZlTGlzdGVuZXIobGlzdGVuZXIpOyByZXNvbHZlKHsgb2s6IHRydWUsIHVybCB9KTsgfSwgMTUwMDApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8g4pSA4pSAIGV4ZWN1dGVTY3JpcHQgaGVscGVyIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBhc3luYyBmdW5jdGlvbiBleGVjSW5UYWIodGFiSWQ6IG51bWJlciwgZnVuYzogRnVuY3Rpb24sIGFyZ3M6IGFueVtdKSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IGNocm9tZS5zY3JpcHRpbmcuZXhlY3V0ZVNjcmlwdCh7XG4gICAgICB0YXJnZXQ6IHsgdGFiSWQgfSxcbiAgICAgIGZ1bmM6IGZ1bmMgYXMgYW55LFxuICAgICAgYXJncyxcbiAgICAgIHdvcmxkOiAnTUFJTidcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cz8uWzBdPy5yZXN1bHQ7XG4gIH1cblxuICAvLyDilIDilIAgU3RlcCBleGVjdXRvciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVN0ZXAoc3RlcDogYW55LCBydW46IGFueSkge1xuICAgIGNvbnN0IHQwID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCB7IHRhYklkLCBwYXJhbXMsIGJ1ZmZlciwgYWJzdHJhY3RUYXJnZXRzIH0gPSBydW47XG4gICAgY29uc3QgYSA9IHN0ZXAuYWN0aW9uO1xuXG4gICAgaWYgKHN0ZXAuY29uZGl0aW9uKSB7XG4gICAgICBjb25zdCB2YWwgPSBpbnRlcnBvbGF0ZShzdGVwLmNvbmRpdGlvbiwgeyAuLi5wYXJhbXMsIC4uLmJ1ZmZlciB9KTtcbiAgICAgIGlmICghdmFsIHx8IHZhbCA9PT0gJ2ZhbHNlJyB8fCB2YWwgPT09ICcwJyB8fCB2YWwgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiB7IHN0ZXBJZDogc3RlcC5zdGVwSWQsIGFjdGlvbjogYSwgc3RhdHVzOiAnc2tpcHBlZCcsIGR1cmF0aW9uTXM6IDAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgaWYgKGEgPT09ICduYXZpZ2F0ZScpIHtcbiAgICAgICAgY29uc3QgdXJsID0gaW50ZXJwb2xhdGUoc3RlcC51cmwsIHsgLi4ucGFyYW1zLCAuLi5idWZmZXIgfSk7XG4gICAgICAgIGNvbnN0IHIgPSBhd2FpdCBuYXZpZ2F0ZUFuZFdhaXQodGFiSWQsIHVybCk7XG4gICAgICAgIHJldHVybiB7IHN0ZXBJZDogc3RlcC5zdGVwSWQsIGFjdGlvbjogYSwgc3RhdHVzOiAnb2snLCB1cmw6IHIudXJsLCBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gdDAgfTtcbiAgICAgIH1cblxuICAgICAgaWYgKGEgPT09ICd0eXBlJykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGludGVycG9sYXRlKHN0ZXAudmFsdWUgfHwgJycsIHsgLi4ucGFyYW1zLCAuLi5idWZmZXIgfSk7XG4gICAgICAgIGNvbnN0IHRndCA9IHN0ZXAudGFyZ2V0ID8gYWJzdHJhY3RUYXJnZXRzPy5bc3RlcC50YXJnZXRdIDogbnVsbDtcbiAgICAgICAgbGV0IHJlc29sdmVkU2VsZWN0b3IgPSBzdGVwLnNlbGVjdG9yIHx8IG51bGw7XG4gICAgICAgIGxldCByZXNvbHZlZFZpYSA9ICdkaXJlY3QnO1xuICAgICAgICBsZXQgY29uZmlkZW5jZSA9IDEuMDtcbiAgICAgICAgaWYgKHRndCkge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGV4ZWNJblRhYih0YWJJZCwgUFJFX1JFU09MVkVfVEFSR0VULCBbdGd0XSk7XG4gICAgICAgICAgaWYgKCFyZXM/LmZvdW5kKSB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZXNvbHZlOiAnICsgc3RlcC50YXJnZXQpO1xuICAgICAgICAgIHJlc29sdmVkU2VsZWN0b3IgPSByZXMuc2VsZWN0b3I7XG4gICAgICAgICAgcmVzb2x2ZWRWaWEgPSByZXMucmVzb2x2ZWRWaWE7XG4gICAgICAgICAgY29uZmlkZW5jZSA9IHJlcy5jb25maWRlbmNlO1xuICAgICAgICAgIGlmIChyZXNvbHZlZFNlbGVjdG9yICYmIHJlcy5yZXNvbHZlZFZpYSAhPT0gJ2NhY2hlZCcpIHtcbiAgICAgICAgICAgIHRndC5jYWNoZWRTZWxlY3RvciA9IHJlc29sdmVkU2VsZWN0b3I7XG4gICAgICAgICAgICB0Z3QuY2FjaGVkQ29uZmlkZW5jZSA9IHJlcy5jb25maWRlbmNlO1xuICAgICAgICAgICAgdGd0LnJlc29sdmVkT24gPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICghcmVzb2x2ZWRTZWxlY3RvcikgdGhyb3cgbmV3IEVycm9yKCdObyBzZWxlY3RvciBmb3I6ICcgKyAoc3RlcC50YXJnZXQgfHwgc3RlcC5zZWxlY3RvcikpO1xuICAgICAgICBhd2FpdCB0cnVzdGVkVHlwZSh0YWJJZCwgcmVzb2x2ZWRTZWxlY3RvciwgdmFsdWUpO1xuICAgICAgICByZXR1cm4geyBzdGVwSWQ6IHN0ZXAuc3RlcElkLCBhY3Rpb246IGEsIHN0YXR1czogJ29rJywgdmFsdWUsIHNlbGVjdG9yOiByZXNvbHZlZFNlbGVjdG9yLCByZXNvbHZlZFZpYSwgY29uZmlkZW5jZSwgdGFyZ2V0OiBzdGVwLnRhcmdldCwgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHQwIH07XG4gICAgICB9XG5cbiAgICAgIGlmIChhID09PSAnY2xpY2snKSB7XG4gICAgICAgIGNvbnN0IHRndCA9IHN0ZXAudGFyZ2V0ID8gYWJzdHJhY3RUYXJnZXRzPy5bc3RlcC50YXJnZXRdIDogbnVsbDtcbiAgICAgICAgbGV0IHJlc29sdmVkU2VsZWN0b3IgPSBzdGVwLnNlbGVjdG9yIHx8IG51bGw7XG4gICAgICAgIGxldCByZXNvbHZlZFZpYSA9ICdkaXJlY3QnO1xuICAgICAgICBsZXQgYnV0dG9uVGV4dCA9IG51bGw7XG4gICAgICAgIGlmICh0Z3QpIHtcbiAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBleGVjSW5UYWIodGFiSWQsIFBSRV9SRVNPTFZFX1RBUkdFVCwgW3RndF0pO1xuICAgICAgICAgIGlmICghcmVzPy5mb3VuZCkgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcmVzb2x2ZTogJyArIHN0ZXAudGFyZ2V0KTtcbiAgICAgICAgICByZXNvbHZlZFNlbGVjdG9yID0gcmVzLnNlbGVjdG9yO1xuICAgICAgICAgIHJlc29sdmVkVmlhID0gcmVzLnJlc29sdmVkVmlhO1xuICAgICAgICAgIGJ1dHRvblRleHQgPSByZXMuYnV0dG9uVGV4dCB8fCBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHIgPSBhd2FpdCBleGVjSW5UYWIodGFiSWQsIFBSRV9HVUFSREVEX0NMSUNLLCBbcmVzb2x2ZWRTZWxlY3RvciwgYnV0dG9uVGV4dF0pO1xuICAgICAgICBpZiAoIXI/Lm9rKSB0aHJvdyBuZXcgRXJyb3Iocj8uZXJyb3IgfHwgJ0NsaWNrIGZhaWxlZCcpO1xuICAgICAgICByZXR1cm4geyBzdGVwSWQ6IHN0ZXAuc3RlcElkLCBhY3Rpb246IGEsIHN0YXR1czogJ29rJywgc2VsZWN0b3I6IHJlc29sdmVkU2VsZWN0b3IsIHJlc29sdmVkVmlhLCB0YXJnZXQ6IHN0ZXAudGFyZ2V0LCBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gdDAgfTtcbiAgICAgIH1cblxuICAgICAgaWYgKGEgPT09ICd3YWl0X2ZvcicpIHtcbiAgICAgICAgY29uc3Qgc2VsID0gaW50ZXJwb2xhdGUoc3RlcC5zZWxlY3RvciB8fCBzdGVwLnRhcmdldCB8fCAnJywgcGFyYW1zKTtcbiAgICAgICAgY29uc3QgdGltZW91dCA9IHN0ZXAudGltZW91dCB8fCA4MDAwO1xuICAgICAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG4gICAgICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0KSB7XG4gICAgICAgICAgY29uc3QgZm91bmQgPSBhd2FpdCBleGVjSW5UYWIodGFiSWQsIChzOiBzdHJpbmcpID0+ICEhZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzKSwgW3NlbF0pO1xuICAgICAgICAgIGlmIChmb3VuZCkgcmV0dXJuIHsgc3RlcElkOiBzdGVwLnN0ZXBJZCwgYWN0aW9uOiBhLCBzdGF0dXM6ICdvaycsIHNlbGVjdG9yOiBzZWwsIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSB0MCB9O1xuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMDApKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3dhaXRfZm9yIHRpbWVvdXQ6ICcgKyBzZWwpO1xuICAgICAgfVxuXG4gICAgICBpZiAoYSA9PT0gJ3JlYWQnKSB7XG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBzdGVwLmNhbmRpZGF0ZXMgfHwgKHN0ZXAuc2VsZWN0b3IgPyBbc3RlcC5zZWxlY3Rvcl0gOiBbXSk7XG4gICAgICAgIGNvbnN0IHIgPSBhd2FpdCBleGVjSW5UYWIodGFiSWQsIFBSRV9HVUFSREVEX1JFQUQsIFtjYW5kaWRhdGVzXSk7XG4gICAgICAgIGlmIChzdGVwLnN0b3JlX2FzKSBidWZmZXJbc3RlcC5zdG9yZV9hc10gPSByPy50ZXh0IHx8IG51bGw7XG4gICAgICAgIHJldHVybiB7IHN0ZXBJZDogc3RlcC5zdGVwSWQsIGFjdGlvbjogYSwgc3RhdHVzOiAnb2snLCB0ZXh0OiByPy50ZXh0IHx8IG51bGwsIHNlbGVjdG9yOiByPy5zZWxlY3RvciwgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHQwIH07XG4gICAgICB9XG5cbiAgICAgIGlmIChhID09PSAnYXNzZXNzX3N0YXRlJykge1xuICAgICAgICBjb25zdCBzZyA9IHN0ZXAuc3RhdGVHcmFwaCB8fCBydW4ucGF5bG9hZD8uc3RhdGVHcmFwaCB8fCB7IG5vZGVzOiB7fSB9O1xuICAgICAgICBjb25zdCByID0gYXdhaXQgZXhlY0luVGFiKHRhYklkLCBQUkVfQVNTRVNTX1NUQVRFLCBbc2ddKTtcbiAgICAgICAgY29uc3QgbWF0Y2hlZCA9ICFzdGVwLmV4cGVjdD8uc3RhdGUgfHwgcj8uc3RhdGUgPT09IHN0ZXAuZXhwZWN0LnN0YXRlO1xuICAgICAgICByZXR1cm4geyBzdGVwSWQ6IHN0ZXAuc3RlcElkLCBhY3Rpb246IGEsIHN0YXR1czogJ29rJywgc3RhdGU6IHI/LnN0YXRlLCBtYXRjaGVkLCBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gdDAgfTtcbiAgICAgIH1cblxuICAgICAgaWYgKGEgPT09ICdqcycpIHtcbiAgICAgICAgY29uc3QgY29kZSA9IGludGVycG9sYXRlKHN0ZXAuY29kZSB8fCAnJywgeyAuLi5wYXJhbXMsIC4uLmJ1ZmZlciB9KTtcbiAgICAgICAgLy8gbmV3IEZ1bmN0aW9uKCkgd29ya3MgaW4gZXh0ZW5zaW9uIE1BSU4gd29ybGQg4oCUIE5PVCBzdWJqZWN0IHRvIHBhZ2UgQ1NQXG4gICAgICAgIGNvbnN0IHIgPSBhd2FpdCBleGVjSW5UYWIodGFiSWQsIChjOiBzdHJpbmcpID0+IHsgdHJ5IHsgcmV0dXJuIG5ldyBGdW5jdGlvbihjKSgpOyB9IGNhdGNoKGU6IGFueSkgeyByZXR1cm4geyBfX2Vycm9yOiBlLm1lc3NhZ2UgfTsgfSB9LCBbY29kZV0pO1xuICAgICAgICBpZiAocj8uX19lcnJvcikgdGhyb3cgbmV3IEVycm9yKHIuX19lcnJvcik7XG4gICAgICAgIGlmIChzdGVwLnN0b3JlX2FzKSBidWZmZXJbc3RlcC5zdG9yZV9hc10gPSByO1xuICAgICAgICByZXR1cm4geyBzdGVwSWQ6IHN0ZXAuc3RlcElkLCBhY3Rpb246IGEsIHN0YXR1czogJ29rJywgcmVzdWx0OiByLCBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gdDAgfTtcbiAgICAgIH1cblxuICAgICAgaWYgKGEgPT09ICdmaW5kX3JvdycpIHtcbiAgICAgICAgY29uc3QgaWRlbnRpZmllciA9IGludGVycG9sYXRlKHN0ZXAuaWRlbnRpZmllciB8fCBzdGVwLnZhbHVlIHx8ICcnLCB7IC4uLnBhcmFtcywgLi4uYnVmZmVyIH0pO1xuICAgICAgICBjb25zdCByID0gYXdhaXQgZXhlY0luVGFiKHRhYklkLCBQUkVfRklORF9ST1dfQU5EX0NMSUNLLCBbaWRlbnRpZmllcl0pO1xuICAgICAgICBpZiAoIXI/LmZvdW5kKSB0aHJvdyBuZXcgRXJyb3IoJ1JvdyBub3QgZm91bmQ6ICcgKyBpZGVudGlmaWVyKTtcbiAgICAgICAgcmV0dXJuIHsgc3RlcElkOiBzdGVwLnN0ZXBJZCwgYWN0aW9uOiBhLCBzdGF0dXM6ICdvaycsIHJlc3VsdDogciwgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHQwIH07XG4gICAgICB9XG5cbiAgICAgIGlmIChhID09PSAnY2xpY2tfdGV4dCcpIHtcbiAgICAgICAgY29uc3QgdGV4dCA9IGludGVycG9sYXRlKHN0ZXAudGV4dCB8fCAnJywgeyAuLi5wYXJhbXMsIC4uLmJ1ZmZlciB9KTtcbiAgICAgICAgY29uc3QgciA9IGF3YWl0IGV4ZWNJblRhYih0YWJJZCwgUFJFX0ZJTkRfQU5EX0NMSUNLX1RFWFQsIFt0ZXh0XSk7XG4gICAgICAgIGlmICghcj8uZm91bmQpIHRocm93IG5ldyBFcnJvcignVGV4dCBub3QgZm91bmQ6ICcgKyB0ZXh0KTtcbiAgICAgICAgcmV0dXJuIHsgc3RlcElkOiBzdGVwLnN0ZXBJZCwgYWN0aW9uOiBhLCBzdGF0dXM6ICdvaycsIHJlc3VsdDogciwgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHQwIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IHN0ZXBJZDogc3RlcC5zdGVwSWQsIGFjdGlvbjogYSwgc3RhdHVzOiAndW5zdXBwb3J0ZWQnLCBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gdDAgfTtcblxuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICByZXR1cm4geyBzdGVwSWQ6IHN0ZXAuc3RlcElkLCBhY3Rpb246IGEsIHN0YXR1czogJ2Vycm9yJywgZXJyb3I6IGVyci5tZXNzYWdlLCBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gdDAgfTtcbiAgICB9XG4gIH1cblxuICAvLyDilIDilIAgQ2hhaW4gcnVubmVyIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBhc3luYyBmdW5jdGlvbiBzdGFydFJ1bihydW5JZDogc3RyaW5nLCBwYXlsb2FkOiBhbnksIHBhcmFtczogUmVjb3JkPHN0cmluZywgYW55PiwgdGFiSWQ6IG51bWJlcikge1xuICAgIGNvbnN0IGNoYWluID0gcGF5bG9hZC5jaGFpbiB8fCBbXTtcbiAgICBjb25zdCBhYnN0cmFjdFRhcmdldHMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHBheWxvYWQuYWJzdHJhY3RUYXJnZXRzIHx8IHt9KSk7XG4gICAgY29uc3QgcnVuID0geyBydW5JZCwgcGF5bG9hZCwgcGFyYW1zLCB0YWJJZCwgYWJzdHJhY3RUYXJnZXRzLCBidWZmZXI6IHt9IGFzIGFueSwgc3RlcEluZGV4OiAwLCBzdGF0dXM6ICdydW5uaW5nJywgcmVzdWx0OiBudWxsIGFzIGFueSwgc3RlcFJlc3VsdHM6IFtdIGFzIGFueVtdLCByZXNvbHZlZFRhcmdldHM6IFtdIGFzIGFueVtdIH07XG4gICAgcnVucy5zZXQocnVuSWQsIHJ1bik7XG4gICAgY29uc3QgdDAgPSBEYXRlLm5vdygpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hhaW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgcnVuLnN0ZXBJbmRleCA9IGk7XG4gICAgICAgIGNvbnN0IHN0ZXAgPSBjaGFpbltpXTtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgZXhlY3V0ZVN0ZXAoc3RlcCwgcnVuKTtcbiAgICAgICAgcnVuLnN0ZXBSZXN1bHRzLnB1c2gocmVzKTtcblxuICAgICAgICBpZiAocmVzLnNlbGVjdG9yICYmIHJlcy5yZXNvbHZlZFZpYSAmJiBzdGVwLnRhcmdldCkge1xuICAgICAgICAgIHJ1bi5yZXNvbHZlZFRhcmdldHMucHVzaCh7IGFic3RyYWN0TmFtZTogc3RlcC50YXJnZXQsIHNlbGVjdG9yOiByZXMuc2VsZWN0b3IsIGNvbmZpZGVuY2U6IHJlcy5jb25maWRlbmNlIHx8IDAsIHJlc29sdmVkVmlhOiByZXMucmVzb2x2ZWRWaWEsIHJlc29sdmVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGVwLmFjdGlvbiA9PT0gJ2Fzc2Vzc19zdGF0ZScgJiYgIXJlcy5tYXRjaGVkICYmIHN0ZXAub25NaXNtYXRjaCkge1xuICAgICAgICAgIGNvbnN0IGJyYW5jaE5hbWUgPSBzdGVwLm9uTWlzbWF0Y2gucmVwbGFjZSgnYnJhbmNoOicsICcnKTtcbiAgICAgICAgICBjb25zdCBicmFuY2hTdGVwcyA9IHBheWxvYWQuYnJhbmNoZXM/LlticmFuY2hOYW1lXT8uc3RlcHMgfHwgcGF5bG9hZC5icmFuY2hlcz8uW2JyYW5jaE5hbWVdIHx8IFtdO1xuICAgICAgICAgIGZvciAoY29uc3QgYlN0ZXAgb2YgYnJhbmNoU3RlcHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGJSZXMgPSBhd2FpdCBleGVjdXRlU3RlcChiU3RlcCwgcnVuKTtcbiAgICAgICAgICAgIHJ1bi5zdGVwUmVzdWx0cy5wdXNoKGJSZXMpO1xuICAgICAgICAgICAgaWYgKGJSZXMuc3RhdHVzID09PSAnZXJyb3InKSB7XG4gICAgICAgICAgICAgIHJ1bi5zdGF0dXMgPSAnZmFpbGVkJztcbiAgICAgICAgICAgICAgcnVuLnJlc3VsdCA9IHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBiUmVzLmVycm9yLCBzdGVwc0V4ZWN1dGVkOiBydW4uc3RlcFJlc3VsdHMubGVuZ3RoLCBzdGVwUmVzdWx0czogcnVuLnN0ZXBSZXN1bHRzLCBidWZmZXI6IHJ1bi5idWZmZXIsIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSB0MCwgcmVzb2x2ZWRUYXJnZXRzOiBydW4ucmVzb2x2ZWRUYXJnZXRzIH07XG4gICAgICAgICAgICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW3J1bklkXTogcnVuLnJlc3VsdCB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXMuc3RhdHVzID09PSAnZXJyb3InKSB7XG4gICAgICAgICAgcnVuLnN0YXR1cyA9ICdmYWlsZWQnO1xuICAgICAgICAgIHJ1bi5yZXN1bHQgPSB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzLmVycm9yLCBzdGVwc0V4ZWN1dGVkOiBydW4uc3RlcFJlc3VsdHMubGVuZ3RoLCBzdGVwUmVzdWx0czogcnVuLnN0ZXBSZXN1bHRzLCBidWZmZXI6IHJ1bi5idWZmZXIsIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSB0MCwgcmVzb2x2ZWRUYXJnZXRzOiBydW4ucmVzb2x2ZWRUYXJnZXRzIH07XG4gICAgICAgICAgYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5zZXQoeyBbcnVuSWRdOiBydW4ucmVzdWx0IH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBydW4uc3RhdHVzID0gJ2NvbXBsZXRlJztcbiAgICAgIHJ1bi5yZXN1bHQgPSB7IHN1Y2Nlc3M6IHRydWUsIHN0ZXBzRXhlY3V0ZWQ6IHJ1bi5zdGVwUmVzdWx0cy5sZW5ndGgsIHN0ZXBSZXN1bHRzOiBydW4uc3RlcFJlc3VsdHMsIGJ1ZmZlcjogcnVuLmJ1ZmZlciwgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHQwLCByZXNvbHZlZFRhcmdldHM6IHJ1bi5yZXNvbHZlZFRhcmdldHMgfTtcbiAgICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW3J1bklkXTogcnVuLnJlc3VsdCB9KTtcblxuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICBydW4uc3RhdHVzID0gJ2ZhaWxlZCc7XG4gICAgICBydW4ucmVzdWx0ID0geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlLCBzdGVwc0V4ZWN1dGVkOiBydW4uc3RlcFJlc3VsdHMubGVuZ3RoLCBzdGVwUmVzdWx0czogcnVuLnN0ZXBSZXN1bHRzLCBidWZmZXI6IHJ1bi5idWZmZXIsIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSB0MCwgcmVzb2x2ZWRUYXJnZXRzOiBydW4ucmVzb2x2ZWRUYXJnZXRzIH07XG4gICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtydW5JZF06IHJ1bi5yZXN1bHQgfSk7XG4gICAgfVxuICB9XG5cbiAgLy8g4pSA4pSAIE1lc3NhZ2UgaGFuZGxlciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtc2csIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gICAgaWYgKG1zZy50eXBlID09PSAnc2tpbGxfcnVuJykge1xuICAgICAgY29uc3QgcnVuSWQgPSBjcnlwdG8ucmFuZG9tVVVJRCgpO1xuICAgICAgY29uc3QgdGFiSWQgPSBtc2cudGFiSWQgfHwgc2VuZGVyLnRhYj8uaWQ7XG4gICAgICBpZiAoIXRhYklkKSB7IHNlbmRSZXNwb25zZSh7IGVycm9yOiAnTm8gdGFiSWQnIH0pOyByZXR1cm4gdHJ1ZTsgfVxuICAgICAgc3RhcnRSdW4ocnVuSWQsIG1zZy5wYXlsb2FkLCBtc2cucGFyYW1zIHx8IHt9LCB0YWJJZCk7XG4gICAgICBzZW5kUmVzcG9uc2UoeyBydW5JZCwgc3RhdHVzOiAnc3RhcnRlZCcgfSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKG1zZy50eXBlID09PSAnZ2V0X3N0YXR1cycpIHtcbiAgICAgIGNvbnN0IHJ1biA9IHJ1bnMuZ2V0KG1zZy5ydW5JZCk7XG4gICAgICBpZiAocnVuKSB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN0YXR1czogcnVuLnN0YXR1cywgc3RlcEluZGV4OiBydW4uc3RlcEluZGV4LCB0b3RhbFN0ZXBzOiBydW4ucGF5bG9hZD8uY2hhaW4/Lmxlbmd0aCB8fCAwLCByZXN1bHQ6IHJ1bi5yZXN1bHQgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChtc2cucnVuSWQpLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGF0YVttc2cucnVuSWRdO1xuICAgICAgICAgIHNlbmRSZXNwb25zZShyZXN1bHQgPyB7IHN0YXR1czogJ2NvbXBsZXRlJywgcmVzdWx0IH0gOiB7IHN0YXR1czogJ25vdF9mb3VuZCcgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChtc2cudHlwZSA9PT0gJ2Fib3J0Jykge1xuICAgICAgY29uc3QgcnVuID0gcnVucy5nZXQobXNnLnJ1bklkKTtcbiAgICAgIGlmIChydW4pIHsgcnVuLnN0YXR1cyA9ICdhYm9ydGVkJzsgcnVucy5kZWxldGUobXNnLnJ1bklkKTsgfVxuICAgICAgc2VuZFJlc3BvbnNlKHsgYWJvcnRlZDogdHJ1ZSB9KTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAobXNnLnR5cGUgPT09ICdjb250ZW50X3JlYWR5JykgcmV0dXJuIGZhbHNlO1xuICB9KTtcbn0pO1xuIiwiLy8gI3JlZ2lvbiBzbmlwcGV0XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IGdsb2JhbFRoaXMuYnJvd3Nlcj8ucnVudGltZT8uaWRcbiAgPyBnbG9iYWxUaGlzLmJyb3dzZXJcbiAgOiBnbG9iYWxUaGlzLmNocm9tZTtcbi8vICNlbmRyZWdpb24gc25pcHBldFxuIiwiaW1wb3J0IHsgYnJvd3NlciBhcyBicm93c2VyJDEgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuLy8jcmVnaW9uIHNyYy9icm93c2VyLnRzXG4vKipcbiogQ29udGFpbnMgdGhlIGBicm93c2VyYCBleHBvcnQgd2hpY2ggeW91IHNob3VsZCB1c2UgdG8gYWNjZXNzIHRoZSBleHRlbnNpb25cbiogQVBJcyBpbiB5b3VyIHByb2plY3Q6XG4qXG4qIGBgYHRzXG4qIGltcG9ydCB7IGJyb3dzZXIgfSBmcm9tICd3eHQvYnJvd3Nlcic7XG4qXG4qIGJyb3dzZXIucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4qICAgLy8gLi4uXG4qIH0pO1xuKiBgYGBcbipcbiogQG1vZHVsZSB3eHQvYnJvd3NlclxuKi9cbmNvbnN0IGJyb3dzZXIgPSBicm93c2VyJDE7XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGJyb3dzZXIgfTtcbiIsIi8vIHNyYy9pbmRleC50c1xudmFyIF9NYXRjaFBhdHRlcm4gPSBjbGFzcyB7XG4gIGNvbnN0cnVjdG9yKG1hdGNoUGF0dGVybikge1xuICAgIGlmIChtYXRjaFBhdHRlcm4gPT09IFwiPGFsbF91cmxzPlwiKSB7XG4gICAgICB0aGlzLmlzQWxsVXJscyA9IHRydWU7XG4gICAgICB0aGlzLnByb3RvY29sTWF0Y2hlcyA9IFsuLi5fTWF0Y2hQYXR0ZXJuLlBST1RPQ09MU107XG4gICAgICB0aGlzLmhvc3RuYW1lTWF0Y2ggPSBcIipcIjtcbiAgICAgIHRoaXMucGF0aG5hbWVNYXRjaCA9IFwiKlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBncm91cHMgPSAvKC4qKTpcXC9cXC8oLio/KShcXC8uKikvLmV4ZWMobWF0Y2hQYXR0ZXJuKTtcbiAgICAgIGlmIChncm91cHMgPT0gbnVsbClcbiAgICAgICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBcIkluY29ycmVjdCBmb3JtYXRcIik7XG4gICAgICBjb25zdCBbXywgcHJvdG9jb2wsIGhvc3RuYW1lLCBwYXRobmFtZV0gPSBncm91cHM7XG4gICAgICB2YWxpZGF0ZVByb3RvY29sKG1hdGNoUGF0dGVybiwgcHJvdG9jb2wpO1xuICAgICAgdmFsaWRhdGVIb3N0bmFtZShtYXRjaFBhdHRlcm4sIGhvc3RuYW1lKTtcbiAgICAgIHZhbGlkYXRlUGF0aG5hbWUobWF0Y2hQYXR0ZXJuLCBwYXRobmFtZSk7XG4gICAgICB0aGlzLnByb3RvY29sTWF0Y2hlcyA9IHByb3RvY29sID09PSBcIipcIiA/IFtcImh0dHBcIiwgXCJodHRwc1wiXSA6IFtwcm90b2NvbF07XG4gICAgICB0aGlzLmhvc3RuYW1lTWF0Y2ggPSBob3N0bmFtZTtcbiAgICAgIHRoaXMucGF0aG5hbWVNYXRjaCA9IHBhdGhuYW1lO1xuICAgIH1cbiAgfVxuICBpbmNsdWRlcyh1cmwpIHtcbiAgICBpZiAodGhpcy5pc0FsbFVybHMpXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICBjb25zdCB1ID0gdHlwZW9mIHVybCA9PT0gXCJzdHJpbmdcIiA/IG5ldyBVUkwodXJsKSA6IHVybCBpbnN0YW5jZW9mIExvY2F0aW9uID8gbmV3IFVSTCh1cmwuaHJlZikgOiB1cmw7XG4gICAgcmV0dXJuICEhdGhpcy5wcm90b2NvbE1hdGNoZXMuZmluZCgocHJvdG9jb2wpID0+IHtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJodHRwXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzSHR0cE1hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImh0dHBzXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzSHR0cHNNYXRjaCh1KTtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJmaWxlXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzRmlsZU1hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImZ0cFwiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc0Z0cE1hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcInVyblwiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc1Vybk1hdGNoKHUpO1xuICAgIH0pO1xuICB9XG4gIGlzSHR0cE1hdGNoKHVybCkge1xuICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cDpcIiAmJiB0aGlzLmlzSG9zdFBhdGhNYXRjaCh1cmwpO1xuICB9XG4gIGlzSHR0cHNNYXRjaCh1cmwpIHtcbiAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSBcImh0dHBzOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG4gIH1cbiAgaXNIb3N0UGF0aE1hdGNoKHVybCkge1xuICAgIGlmICghdGhpcy5ob3N0bmFtZU1hdGNoIHx8ICF0aGlzLnBhdGhuYW1lTWF0Y2gpXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgaG9zdG5hbWVNYXRjaFJlZ2V4cyA9IFtcbiAgICAgIHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMuaG9zdG5hbWVNYXRjaCksXG4gICAgICB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLmhvc3RuYW1lTWF0Y2gucmVwbGFjZSgvXlxcKlxcLi8sIFwiXCIpKVxuICAgIF07XG4gICAgY29uc3QgcGF0aG5hbWVNYXRjaFJlZ2V4ID0gdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5wYXRobmFtZU1hdGNoKTtcbiAgICByZXR1cm4gISFob3N0bmFtZU1hdGNoUmVnZXhzLmZpbmQoKHJlZ2V4KSA9PiByZWdleC50ZXN0KHVybC5ob3N0bmFtZSkpICYmIHBhdGhuYW1lTWF0Y2hSZWdleC50ZXN0KHVybC5wYXRobmFtZSk7XG4gIH1cbiAgaXNGaWxlTWF0Y2godXJsKSB7XG4gICAgdGhyb3cgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQ6IGZpbGU6Ly8gcGF0dGVybiBtYXRjaGluZy4gT3BlbiBhIFBSIHRvIGFkZCBzdXBwb3J0XCIpO1xuICB9XG4gIGlzRnRwTWF0Y2godXJsKSB7XG4gICAgdGhyb3cgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQ6IGZ0cDovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG4gIH1cbiAgaXNVcm5NYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogdXJuOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcbiAgfVxuICBjb252ZXJ0UGF0dGVyblRvUmVnZXgocGF0dGVybikge1xuICAgIGNvbnN0IGVzY2FwZWQgPSB0aGlzLmVzY2FwZUZvclJlZ2V4KHBhdHRlcm4pO1xuICAgIGNvbnN0IHN0YXJzUmVwbGFjZWQgPSBlc2NhcGVkLnJlcGxhY2UoL1xcXFxcXCovZywgXCIuKlwiKTtcbiAgICByZXR1cm4gUmVnRXhwKGBeJHtzdGFyc1JlcGxhY2VkfSRgKTtcbiAgfVxuICBlc2NhcGVGb3JSZWdleChzdHJpbmcpIHtcbiAgICByZXR1cm4gc3RyaW5nLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcbiAgfVxufTtcbnZhciBNYXRjaFBhdHRlcm4gPSBfTWF0Y2hQYXR0ZXJuO1xuTWF0Y2hQYXR0ZXJuLlBST1RPQ09MUyA9IFtcImh0dHBcIiwgXCJodHRwc1wiLCBcImZpbGVcIiwgXCJmdHBcIiwgXCJ1cm5cIl07XG52YXIgSW52YWxpZE1hdGNoUGF0dGVybiA9IGNsYXNzIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihtYXRjaFBhdHRlcm4sIHJlYXNvbikge1xuICAgIHN1cGVyKGBJbnZhbGlkIG1hdGNoIHBhdHRlcm4gXCIke21hdGNoUGF0dGVybn1cIjogJHtyZWFzb259YCk7XG4gIH1cbn07XG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RvY29sKG1hdGNoUGF0dGVybiwgcHJvdG9jb2wpIHtcbiAgaWYgKCFNYXRjaFBhdHRlcm4uUFJPVE9DT0xTLmluY2x1ZGVzKHByb3RvY29sKSAmJiBwcm90b2NvbCAhPT0gXCIqXCIpXG4gICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4oXG4gICAgICBtYXRjaFBhdHRlcm4sXG4gICAgICBgJHtwcm90b2NvbH0gbm90IGEgdmFsaWQgcHJvdG9jb2wgKCR7TWF0Y2hQYXR0ZXJuLlBST1RPQ09MUy5qb2luKFwiLCBcIil9KWBcbiAgICApO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVIb3N0bmFtZShtYXRjaFBhdHRlcm4sIGhvc3RuYW1lKSB7XG4gIGlmIChob3N0bmFtZS5pbmNsdWRlcyhcIjpcIikpXG4gICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBgSG9zdG5hbWUgY2Fubm90IGluY2x1ZGUgYSBwb3J0YCk7XG4gIGlmIChob3N0bmFtZS5pbmNsdWRlcyhcIipcIikgJiYgaG9zdG5hbWUubGVuZ3RoID4gMSAmJiAhaG9zdG5hbWUuc3RhcnRzV2l0aChcIiouXCIpKVxuICAgIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKFxuICAgICAgbWF0Y2hQYXR0ZXJuLFxuICAgICAgYElmIHVzaW5nIGEgd2lsZGNhcmQgKCopLCBpdCBtdXN0IGdvIGF0IHRoZSBzdGFydCBvZiB0aGUgaG9zdG5hbWVgXG4gICAgKTtcbn1cbmZ1bmN0aW9uIHZhbGlkYXRlUGF0aG5hbWUobWF0Y2hQYXR0ZXJuLCBwYXRobmFtZSkge1xuICByZXR1cm47XG59XG5leHBvcnQge1xuICBJbnZhbGlkTWF0Y2hQYXR0ZXJuLFxuICBNYXRjaFBhdHRlcm5cbn07XG4iXSwieF9nb29nbGVfaWdub3JlTGlzdCI6WzAsMiwzLDRdLCJtYXBwaW5ncyI6Ijs7Q0FDQSxTQUFTLGlCQUFpQixLQUFLO0FBQzlCLE1BQUksT0FBTyxRQUFRLE9BQU8sUUFBUSxXQUFZLFFBQU8sRUFBRSxNQUFNLEtBQUs7QUFDbEUsU0FBTzs7OztDQ0hSLElBQUEscUJBQUEsdUJBQUE7QUFDRSxVQUFBLElBQUEscUNBQUE7QUFLQSxTQUFBLFFBQUEsWUFBQSxhQUFBLFlBQUE7QUFDRSxPQUFBLFFBQUEsV0FBQSxZQUFBLFFBQUEsV0FBQSxVQUNFLFFBQUEsS0FBQSxNQUFBLEVBQUEsUUFBQSxNQUFBLEdBQUEsU0FBQTtBQUNFLFNBQUEsU0FBQSxRQUFBO0FBQ0UsU0FBQSxJQUFBLE1BQUEsSUFBQSxPQUFBLENBQUEsSUFBQSxJQUFBLFdBQUEsWUFBQSxJQUFBLENBQUEsSUFBQSxJQUFBLFdBQUEsc0JBQUEsQ0FDRSxRQUFBLEtBQUEsT0FBQSxJQUFBLEdBQUE7Ozs7OztBQVlSLE9BQUEsT0FBQSxRQUFBLFNBQUEsUUFBQTtBQUNBLFVBQUEsSUFBQSxRQUFBLG1CQUFBLEdBQUEsTUFBQSxPQUFBLE1BQUEsR0FBQTs7OztBQWlDQSxPQUFBLGVBQUEsbUJBQUEsZUFBQSxvQkFBQSxNQUFBLE9BQUEsZUFBQTtxRUFFRTsrREFFRSxRQUFBOzs7Ozs7Ozs7QUFJSixRQUFBLE1BQUEsYUFBQSxRQUFBOztBQUVFLFNBQUEsTUFBQSxNQUFBLFNBQUEsaUJBQUEsV0FBQSxDQUNFLEtBQUEsR0FBQSxhQUFBLE1BQUEsQ0FBQSxhQUFBLENBQUEsU0FBQSxFQUFBLEVBQUE7O0FBRUUsU0FBQSxJQUFBLFFBQUE7Ozs7Ozs7O0FBR0osU0FBQSxNQUFBLE9BQUEsU0FBQSxpQkFBQSxxQkFBQSxDQUNFLEtBQUEsSUFBQSxhQUFBLE1BQUEsQ0FBQSxhQUFBLENBQUEsU0FBQSxFQUFBLElBQUEsQ0FBQSxJQUFBLGNBQUEsUUFBQSxFQUFBOztBQUVFLFlBQUEsS0FBQTs7QUFFRSxVQUFBLElBQUEsUUFBQTs7Ozs7OztBQUNBLFlBQUEsSUFBQTs7O0FBR0YsU0FBQSxJQUFBLFFBQUE7Ozs7Ozs7OztBQUlOLE9BQUEsZUFBQSxPQUFBLGNBQ0UsTUFBQSxNQUFBLE1BQUEsZUFBQSxNQUFBLGVBQUE7O0FBR0UsUUFBQSxJQUFBLFFBQUE7Ozs7Ozs7O0FBR0osUUFBQSxNQUFBLE9BQUEsZUFBQSxxQkFBQSxFQUFBLENBRUUsS0FBQSxTQUFBLGNBQUEsSUFBQSxDQUFBLFFBQUE7Ozs7OztBQUVGLFVBQUE7Ozs7Ozs7OztBQUtBLE9BQUEsQ0FBQSxNQUFBLFdBQ0UsTUFBQSxNQUFBLEtBQUEsU0FBQSxpQkFBQSw2QkFBQSxDQUFBLENBQUEsTUFBQSxNQUFBLEVBQUEsYUFBQSxNQUFBLENBQUEsYUFBQSxDQUFBLFNBQUEsV0FBQSxhQUFBLENBQUEsQ0FBQSxJQUFBO0FBR0YsT0FBQSxDQUFBLEdBQUEsUUFBQTs7OztBQUNBLE1BQUEsT0FBQTtBQUNBLFVBQUE7Ozs7OztBQUlBLFFBQUEsTUFBQSxPQUFBLGNBQUEsRUFBQSxFQUFBOztBQUVFLFFBQUEsR0FBQSxRQUFBOzs7Ozs7QUFFRixVQUFBOzs7Ozs7QUFJQSxPQUFBLENBQUEsWUFBQSxNQUFBLFFBQUEsRUFBQSxPQUFBLFdBQUE7QUFDQSxRQUFBLE1BQUEsQ0FBQSxNQUFBLFNBQUEsT0FBQSxRQUFBLFdBQUEsTUFBQSxFQUFBO0FBQ0UsUUFBQSxDQUFBLEtBQUEsU0FBQSxPQUFBO0FBT0EsUUFBQSxLQUFBLFFBQUEsT0FBQSxRQUFBO0FBTEUsU0FBQSxJQUFBLFNBQUEsY0FBQSxRQUFBLElBQUEsT0FBQSxJQUFBLFFBQUEsQ0FB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QUFBLElBQUE7QUFDQSxtQkFBQSxJQUFBLGNBQUE7OztBQUdGLFNBQUEsQ0FBQSxHQUFBLEdBQUEsT0FBQSxJQUFBLE1BQUEsR0FBQSxTQUFBLGVBQUE7QUFDQSxZQUFBOzs7Ozs7Ozs7O0FBR0YsUUFBQSxNQUFBLFlBQUE7Ozs7QUFJRSxZQUFBLEtBQUEsS0FBQSxHQUFBLFFBQUEsU0FBQTtBQUVFLFVBQUEsTUFBQSxVQUFBLFFBQUEsTUFBQSxDQUFBLENBQUEsU0FBQSxjQUFBLEVBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxDQUFBLFFBQUE7Ozs7Ozs7QUFDQSxZQUFBLElBQUEsU0FBQSxNQUFBLFdBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUYsV0FBQSxJQUFBLE1BQUEsdUJBQUEsSUFBQTs7QUFHRixRQUFBLE1BQUEsUUFBQTs7QUFHRSxTQUFBLEtBQUEsU0FBQSxRQUFBLEtBQUEsWUFBQSxHQUFBLFFBQUE7QUFDQSxZQUFBOzs7Ozs7Ozs7QUFHRixRQUFBLE1BQUEsZ0JBQUE7OztBQUlFLFlBQUE7Ozs7Ozs7OztBQUdGLFFBQUEsTUFBQSxNQUFBOztBQUdvRCxVQUFBO0FBQU0sY0FBQSxJQUFBLFNBQUEsRUFBQSxFQUFBOztBQUE0QyxjQUFBLEVBQUEsU0FBQSxFQUFBLFNBQUE7Ozs7OztBQUNwRyxTQUFBLEdBQUEsUUFBQSxPQUFBLElBQUEsTUFBQSxFQUFBLFFBQUE7QUFDQSxTQUFBLEtBQUEsU0FBQSxRQUFBLEtBQUEsWUFBQTtBQUNBLFlBQUE7Ozs7Ozs7O0FBR0YsUUFBQSxNQUFBLFlBQUE7Ozs7OztBQUdFLFNBQUEsQ0FBQSxHQUFBLE1BQUEsT0FBQSxJQUFBLE1BQUEsb0JBQUEsV0FBQTtBQUNBLFlBQUE7Ozs7Ozs7O0FBR0YsUUFBQSxNQUFBLGNBQUE7Ozs7OztBQUdFLFNBQUEsQ0FBQSxHQUFBLE1BQUEsT0FBQSxJQUFBLE1BQUEscUJBQUEsS0FBQTtBQUNBLFlBQUE7Ozs7Ozs7O0FBR0YsV0FBQTs7Ozs7OztBQUdBLFdBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVNGLFFBQUEs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