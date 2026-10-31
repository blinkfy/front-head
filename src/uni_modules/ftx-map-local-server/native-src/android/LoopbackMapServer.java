package ftx.map;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Small, read-only server for bundled map assets. Never exposes the app filesystem. */
public final class LoopbackMapServer implements Closeable {
    public interface Resources { InputStream open(String path) throws IOException; }
    private static final Set<String> FILES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        "index.html", "host.mjs", "renderer.mjs", "static/normal-marker.png",
        "static/smart-marker.png", "static/pending-bin-marker.png")));
    private final Resources resources;
    private final ServerSocket listener;
    private final String prefix = "/" + UUID.randomUUID().toString() + "/";
    private final Set<Socket> sockets = Collections.synchronizedSet(new HashSet<Socket>());
    private final ThreadPoolExecutor workers;
    private volatile boolean closed;

    public LoopbackMapServer(Resources resources) throws IOException {
        this.resources = resources;
        listener = new ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"));
        ThreadFactory factory = task -> { Thread t = new Thread(task, "ftx-map-http"); t.setDaemon(true); return t; };
        workers = new ThreadPoolExecutor(2, 2, 10, TimeUnit.SECONDS, new ArrayBlockingQueue<Runnable>(4), factory);
        workers.allowCoreThreadTimeOut(true);
        Thread acceptor = factory.newThread(() -> {
            while (!closed) {
                try {
                    final Socket socket = listener.accept();
                    sockets.add(socket);
                    if (closed) { release(socket); break; }
                    try { workers.execute(() -> serve(socket)); }
                    catch (RuntimeException rejected) { release(socket); }
                } catch (IOException error) { if (!closed) close(); }
            }
        });
        acceptor.start();
    }

    public String getBaseUrl() { return "http://127.0.0.1:" + listener.getLocalPort() + prefix; }

    private void serve(Socket socket) {
        try {
            socket.setSoTimeout(3000);
            InputStream input = socket.getInputStream();
            OutputStream output = socket.getOutputStream();
            String first = line(input, 4096);
            if (first == null) return;
            String[] request = first.split(" ");
            if (request.length != 3 || !request[2].startsWith("HTTP/1.")) { reply(output, 400); return; }
            String method = request[0];
            if (!method.equals("GET") && !method.equals("HEAD")) { reply(output, 405); return; }
            int headerBytes = first.length();
            String header;
            while ((header = line(input, 4096)) != null && !header.isEmpty()) {
                headerBytes += header.length();
                if (headerBytes > 8192) { reply(output, 431); return; }
            }
            // Match the literal URI path before any decoding. Only six fixed paths exist.
            URI uri;
            try { uri = new URI(request[1]); } catch (Exception error) { reply(output, 400); return; }
            String path = uri.getRawPath();
            if (uri.isAbsolute() || path == null || !path.startsWith(prefix)) { reply(output, 404); return; }
            String file = path.substring(prefix.length());
            if (!FILES.contains(file)) { reply(output, 404); return; }
            try (InputStream asset = resources.open(file)) {
                String mime = file.endsWith(".html") ? "text/html; charset=utf-8" :
                    file.endsWith(".mjs") ? "text/javascript; charset=utf-8" : "image/png";
                output.write(("HTTP/1.1 200 OK\r\nContent-Type: " + mime +
                    "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n").getBytes("US-ASCII"));
                if (method.equals("GET")) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while (!closed && (count = asset.read(buffer)) != -1) output.write(buffer, 0, count);
                }
                output.flush();
            } catch (IOException missing) { /* Closing the connection also bounds interrupted transfers. */ }
        } catch (IOException ignored) { /* A timed-out/closed client does not affect the listener. */ }
        finally { release(socket); }
    }

    private static String line(InputStream input, int limit) throws IOException {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i <= limit; i++) {
            int value = input.read();
            if (value == -1) return text.length() == 0 ? null : text.toString();
            if (value == '\n') return text.toString().replace("\r", "");
            text.append((char) value);
        }
        throw new IOException("Header limit");
    }

    private static void reply(OutputStream output, int code) throws IOException {
        output.write(("HTTP/1.1 " + code + " Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes("US-ASCII"));
    }

    private void release(Socket socket) {
        sockets.remove(socket);
        try { socket.close(); } catch (IOException ignored) { }
    }

    @Override public synchronized void close() {
        if (closed) return;
        closed = true;
        try { listener.close(); } catch (IOException ignored) { }
        workers.shutdownNow();
        synchronized (sockets) {
            for (Socket socket : sockets) try { socket.close(); } catch (IOException ignored) { }
            sockets.clear();
        }
    }
}
