package br.com.vizinhocerto.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;

/** Requests the app permission before launching Chrome; it is separate from web push consent. */
public class NotificationPermissionActivity extends Activity {
    private static final int REQUEST_NOTIFICATIONS = 41;
    private static final int OPEN_SETTINGS = 42;
    private boolean settingsOnly;
    private boolean awaitingPermission;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Uri uri = getIntent().getData();
        settingsOnly = uri != null && "vizinhocerto".equals(uri.getScheme())
                && "notificacoes".equals(uri.getHost());
        awaitingPermission = state != null && state.getBoolean("awaiting_permission", false);
        if (awaitingPermission) return;
        boolean asked = getPreferences(MODE_PRIVATE).getBoolean("notifications_asked", false);
        boolean granted = Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        if (NotificationPermissionPolicy.shouldRequest(Build.VERSION.SDK_INT, granted, asked, settingsOnly)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("notifications_asked", true).apply();
            awaitingPermission = true;
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQUEST_NOTIFICATIONS);
        } else if (settingsOnly) {
            showStatus();
        } else {
            continueToApp();
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("awaiting_permission", awaitingPermission);
        super.onSaveInstanceState(state);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != REQUEST_NOTIFICATIONS) return;
        awaitingPermission = false;
        if (settingsOnly && !NotificationManagerCompat.from(this).areNotificationsEnabled()) showStatus();
        else continueToApp();
    }

    private void showStatus() {
        boolean enabled = NotificationManagerCompat.from(this).areNotificationsEnabled();
        new AlertDialog.Builder(this)
                .setTitle(enabled ? "Notificações permitidas no Android" : "Notificações bloqueadas no Android")
                .setMessage(enabled ? "A permissão do aparelho está ativa. Volte ao Perfil e ative o recebimento para testar."
                        : "Permita as notificações do Vizinho Certo para receber publicações e alertas SOS.")
                .setPositiveButton("Abrir configurações", (dialog, which) -> {
                    Intent intent;
                    if (Build.VERSION.SDK_INT >= 26) {
                        intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    } else {
                        intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:" + getPackageName()));
                    }
                    startActivityForResult(intent, OPEN_SETTINGS);
                })
                .setNegativeButton("Voltar ao app", (dialog, which) -> continueToApp())
                .setOnCancelListener(dialog -> continueToApp()).show();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OPEN_SETTINGS) continueToApp();
    }

    private void continueToApp() {
        startActivity(new Intent(this, LauncherActivity.class));
        finish();
    }
}
