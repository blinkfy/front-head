package ftx.map;

import android.content.Context;
import java.io.Closeable;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;

/** Adapts app-packaged map assets to the loopback HTTP server. */
public final class AndroidMapAssetService {
    private static final String INDEX_SUFFIX = "static/app-map/index.html";
    private static final Map<String, LoopbackMapServer> SERVERS = new HashMap<>();

    private AndroidMapAssetService() {}

    public static synchronized String start(Context context, String indexPath) {
        if (context == null || indexPath == null || indexPath.isEmpty()) return "";
        final Context appContext = context.getApplicationContext();
        if (appContext == null) return "";
        final AssetRoot root;
        try {
            root = AssetRoot.from(indexPath);
            Resources resources = new Resources(appContext, root);
            // Validate startup-critical files without reading their contents.
            for (String path : new String[] { "index.html", "host.mjs", "renderer.mjs" }) {
                try (InputStream ignored = resources.open(path)) {
                    // Opening the stream is the validation.
                }
            }
            LoopbackMapServer server = new LoopbackMapServer(resources);
            String baseUrl = server.getBaseUrl();
            if (baseUrl == null || baseUrl.isEmpty()) {
                server.close();
                return "";
            }
            SERVERS.put(baseUrl, server);
            return baseUrl;
        } catch (Throwable ignored) {
            return "";
        }
    }

    public static synchronized void stop(String baseUrl) {
        LoopbackMapServer server = SERVERS.remove(baseUrl);
        if (server == null) return;
        try {
            server.close();
        } catch (Throwable ignored) {
            // Closing is best effort; repeated stop calls remain harmless.
        }
    }

    private static final class Resources implements LoopbackMapServer.Resources {
        private final Context context;
        private final AssetRoot root;

        Resources(Context context, AssetRoot root) {
            this.context = context;
            this.root = root;
        }

        @Override
        public InputStream open(String path) throws IOException {
            final String relative;
            if ("index.html".equals(path) || "host.mjs".equals(path) || "renderer.mjs".equals(path)) {
                relative = "static/app-map/" + path;
            } else if ("static/normal-marker.png".equals(path)
                    || "static/smart-marker.png".equals(path)
                    || "static/pending-bin-marker.png".equals(path)) {
                relative = path;
            } else {
                throw new IOException("Unknown map asset: " + path);
            }
            if (root.assets) return context.getAssets().open(root.path + relative);
            return new FileInputStream(new File(root.path, relative));
        }
    }

    private static final class AssetRoot {
        final boolean assets;
        final String path;

        AssetRoot(boolean assets, String path) {
            this.assets = assets;
            this.path = path;
        }

        static AssetRoot from(String rawPath) throws IOException {
            String path = rawPath;
            if (path.startsWith("file:///android_asset/")) {
                path = path.substring("file:///android_asset/".length());
                return fromAssetPath(path);
            }
            if (path.startsWith("/android_asset/")) {
                return fromAssetPath(path.substring("/android_asset/".length()));
            }
            if (path.startsWith("file://")) {
                try {
                    path = new File(URI.create(path)).getPath();
                } catch (RuntimeException error) {
                    throw new IOException("Invalid map index file URI", error);
                }
            }
            String normalized = path.replace('\\', '/');
            int suffix = normalized.lastIndexOf(INDEX_SUFFIX);
            if (suffix < 0 || suffix + INDEX_SUFFIX.length() != normalized.length()) {
                throw new IOException("Map index path does not end in " + INDEX_SUFFIX);
            }
            String root = normalized.substring(0, suffix);
            if (root.isEmpty()) root = File.separator;
            else if (root.endsWith(":")) root += "/";
            return new AssetRoot(false, root);
        }

        private static AssetRoot fromAssetPath(String assetPath) throws IOException {
            String normalized = assetPath.replace('\\', '/');
            int suffix = normalized.lastIndexOf(INDEX_SUFFIX);
            if (suffix < 0 || suffix + INDEX_SUFFIX.length() != normalized.length()) {
                throw new IOException("Map asset path does not end in " + INDEX_SUFFIX);
            }
            String root = normalized.substring(0, suffix);
            if (!root.isEmpty() && !root.endsWith("/")) root += "/";
            return new AssetRoot(true, root);
        }
    }
}
