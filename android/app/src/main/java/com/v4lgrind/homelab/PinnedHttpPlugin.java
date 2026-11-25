package com.v4lgrind.homelab;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * HTTPS to a self-signed service on the LAN (Proxmox): the certificate chain is
 * not verified, but only a private IPv4 is accepted, and the leaf certificate's
 * fingerprint is pinned on first contact. A different fingerprint aborts the TLS
 * handshake, so no header (password, ticket) is ever sent to it.
 */
@CapacitorPlugin(name = "PinnedHttp")
public class PinnedHttpPlugin extends Plugin {

    private final ExecutorService executor = Executors.newCachedThreadPool();

    /** Thrown from the trust manager when the pin does not match. */
    private static final class PinMismatch extends CertificateException {
        final String received;

        PinMismatch(String received) {
            super("cert_mismatch");
            this.received = received;
        }
    }

    @PluginMethod
    public void request(PluginCall call) {
        executor.execute(() -> doRequest(call));
    }

    private void doRequest(PluginCall call) {
        String urlStr = call.getString("url");
        String method = call.getString("method", "GET");
        String data = call.getString("data");
        String pin = call.getString("pin");
        int timeout = call.getInt("timeoutMs", 12000);
        JSObject headers = call.getObject("headers", new JSObject());

        URL url;
        try {
            url = new URL(urlStr);
        } catch (Exception e) {
            call.reject("Adresse invalide", "not_private");
            return;
        }
        if (!"https".equalsIgnoreCase(url.getProtocol()) || !PinnedTls.isPrivateIpv4(url.getHost())) {
            call.reject("Proxmox se joint par son IP locale en https", "not_private");
            return;
        }

        final String[] seen = new String[1];
        X509TrustManager tm = new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                throw new CertificateException("client auth unsupported");
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                if (chain == null || chain.length == 0) throw new CertificateException("empty chain");
                String fp = PinnedTls.fingerprint(chain[0].getEncoded());
                seen[0] = fp;
                if (pin != null && !pin.isEmpty() && !pin.equalsIgnoreCase(fp)) throw new PinMismatch(fp);
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[0];
            }
        };

        HttpsURLConnection conn = null;
        try {
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[] { tm }, null);
            conn = (HttpsURLConnection) url.openConnection();
            conn.setSSLSocketFactory(ctx.getSocketFactory());
            // The host is a private IP literal checked above; the pin stands in
            // for hostname verification.
            conn.setHostnameVerifier((h, s) -> true);
            conn.setRequestMethod(method);
            conn.setConnectTimeout(timeout);
            conn.setReadTimeout(timeout);
            conn.setUseCaches(false);
            conn.setInstanceFollowRedirects(false);
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                conn.setRequestProperty(k, headers.getString(k));
            }
            if (data != null) {
                byte[] body = data.getBytes(StandardCharsets.UTF_8);
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body);
                }
            }

            int status = conn.getResponseCode();
            InputStream is = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String text = is == null ? "" : readAll(is);

            JSObject outHeaders = new JSObject();
            for (Map.Entry<String, List<String>> h : conn.getHeaderFields().entrySet()) {
                if (h.getKey() != null && h.getValue() != null && !h.getValue().isEmpty()) {
                    outHeaders.put(h.getKey(), h.getValue().get(0));
                }
            }
            JSObject res = new JSObject();
            res.put("status", status);
            res.put("headers", outHeaders);
            res.put("data", text);
            res.put("fingerprint", seen[0]);
            call.resolve(res);
        } catch (Exception e) {
            PinMismatch mismatch = findMismatch(e);
            if (mismatch != null) {
                JSObject d = new JSObject();
                d.put("fingerprint", mismatch.received);
                call.reject("Certificat changé", "cert_mismatch", d);
            } else {
                call.reject(e.getMessage() != null ? e.getMessage() : "erreur réseau", "network");
            }
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static PinMismatch findMismatch(Throwable t) {
        for (int i = 0; t != null && i < 10; i++, t = t.getCause()) {
            if (t instanceof PinMismatch) return (PinMismatch) t;
        }
        return null;
    }

    private static String readAll(InputStream is) throws IOException {
        try (InputStream in = is) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }
}
