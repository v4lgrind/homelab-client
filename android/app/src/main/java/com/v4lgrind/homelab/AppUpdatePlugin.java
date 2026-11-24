package com.v4lgrind.homelab;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Self-update outside the Play Store: downloads a newer Homelab APK into the
 * cache and hands it to the system package installer. Android still asks the
 * user to confirm, and refuses an APK whose signature doesn't match the
 * installed app (see scripts/sign-android-apk.sh for the key rotation).
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String TAG = "AppUpdatePlugin";
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final long PROGRESS_INTERVAL_MS = 250L;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;

    private File updateDir() {
        return new File(getContext().getCacheDir(), "updates");
    }

    private File updateFile() {
        return new File(updateDir(), "homelab-update.apk");
    }

    /** Leftovers of an earlier download: the update is either installed or stale. */
    @Override
    public void load() {
        executor.execute(() -> deleteRecursively(updateDir()));
    }

    /** Whether the user has let Homelab install apps ("Install unknown apps"). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        call.resolve(new JSObject().put("allowed", allowed));
    }

    /** Opens the system screen where the user allows Homelab to install apps. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
        }
        call.resolve();
    }

    /** Downloads the APK at `url` (https), emitting `downloadProgress`, then checks it. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("An https URL is required", "insecure_url");
            return;
        }
        cancelled = false;
        executor.execute(() -> downloadAndCheck(url, call));
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    /** Starts the system installer on the downloaded APK. */
    @PluginMethod
    public void install(PluginCall call) {
        File file = updateFile();
        if (!file.exists()) {
            call.reject("No downloaded update", "no_update");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, APK_MIME)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(intent);
        call.resolve();
    }

    private void downloadAndCheck(String url, PluginCall call) {
        File target = updateFile();
        try {
            updateDir().mkdirs();
            fetch(url, target);
            String reason = rejectReason(target);
            if (reason != null) {
                target.delete();
                call.reject("Downloaded APK rejected: " + reason, reason);
                return;
            }
            call.resolve();
        } catch (Exception e) {
            target.delete();
            String code = cancelled ? "cancelled" : "download_failed";
            Log.w(TAG, "Update download failed (" + code + ")", e);
            call.reject(e.getMessage() != null ? e.getMessage() : code, code);
        }
    }

    private void fetch(String url, File target) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status > 299) throw new IOException("HTTP " + status);
            copyWithProgress(connection, target);
        } finally {
            connection.disconnect();
        }
    }

    private void copyWithProgress(HttpURLConnection connection, File target) throws IOException {
        long total = connection.getContentLengthLong();
        long received = 0;
        long lastEmit = 0;
        try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            while (true) {
                if (cancelled) throw new IOException("cancelled");
                int read = input.read(buffer);
                if (read < 0) break;
                output.write(buffer, 0, read);
                received += read;
                long now = SystemClock.elapsedRealtime();
                if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
                    lastEmit = now;
                    emitProgress(received, total);
                }
            }
        }
        emitProgress(received, total);
    }

    private void emitProgress(long received, long total) {
        notifyListeners("downloadProgress", new JSObject().put("received", received).put("total", total));
    }

    private String rejectReason(File apk) throws PackageManager.NameNotFoundException {
        PackageManager pm = getContext().getPackageManager();
        long installed = PackageInfoCompat.getLongVersionCode(pm.getPackageInfo(getContext().getPackageName(), 0));
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getPath(), 0);
        return UpdateApkCheck.rejectReason(
            getContext().getPackageName(),
            installed,
            archive != null ? archive.packageName : null,
            archive != null ? PackageInfoCompat.getLongVersionCode(archive) : null
        );
    }

    private static void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }
}
