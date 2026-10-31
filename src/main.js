import {
	createSSRApp, nextTick
} from "vue";
import App from "./App.vue";
import { rewriteLegacyDeviceScanLocation } from "./utils/device-qr-entry.mjs";
import { applyStoredTheme } from "./utils/theme.js";
import { installPageTransitions } from "./utils/page-transitions.js";
import { markAppPageReady } from "./utils/app-page-ready.mjs";
// #ifdef H5
import { finishH5LoginLoading } from "./utils/h5-login-loading.mjs";
// #endif
export function createApp() {
	// #ifdef H5
	if (typeof window !== "undefined") {
		window.__ftxStartup?.frameworkReady();
		rewriteLegacyDeviceScanLocation(window.location, window.history);
	}
	applyStoredTheme();
	// #endif
	installPageTransitions();
	const app = createSSRApp(App);
	app.mixin({ onReady() {
		// #ifdef H5
		const page = this;
		nextTick(() => {
			window.__ftxStartup?.rendering();
			requestAnimationFrame(() => requestAnimationFrame(() => {
				const pages = getCurrentPages();
				const current = pages[pages.length - 1];
				// 主题/入口重定向可能已卸载旧页，只接受当前页的完成信号。
				if (!current || current.$page?.id !== page.$page?.id || page.$el?.isConnected === false) return;
				finishH5LoginLoading(current.route);
				window.__ftxStartup?.ready();
				markAppPageReady();
			}));
		});
		// #endif
		// #ifndef H5
		markAppPageReady();
		// #endif
	} });
	return {
		app,
	};
}
