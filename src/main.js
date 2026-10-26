import {
	createSSRApp
} from "vue";
import App from "./App.vue";
import { rewriteLegacyDeviceScanLocation } from "./utils/device-qr-entry.mjs";
import { applyStoredTheme } from "./utils/theme.js";
import { installPageTransitions } from "./utils/page-transitions.js";
export function createApp() {
	// #ifdef H5
	if (typeof window !== "undefined") rewriteLegacyDeviceScanLocation(window.location, window.history);
	applyStoredTheme();
	// #endif
	installPageTransitions();
	const app = createSSRApp(App);
	return {
		app,
	};
}
