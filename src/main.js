import {
	createSSRApp
} from "vue";
import App from "./App.vue";
import { applyStoredTheme } from "./utils/theme.js";
import { installPageTransitions } from "./utils/page-transitions.js";
export function createApp() {
	// #ifdef H5
	applyStoredTheme();
	// #endif
	installPageTransitions();
	const app = createSSRApp(App);
	return {
		app,
	};
}
