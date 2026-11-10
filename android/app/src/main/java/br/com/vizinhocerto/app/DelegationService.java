package br.com.vizinhocerto.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;

import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;

import com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler;


public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public boolean onNotifyNotificationWithChannel(@NonNull String platformTag, int platformId,
            @NonNull Notification notification, @NonNull String channelName) {
        CharSequence title = notification.extras == null ? null
                : notification.extras.getCharSequence(Notification.EXTRA_TITLE);
        if (!SosNotificationPolicy.isSosTitle(title)) {
            return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
        }
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()
                || !super.onAreNotificationsEnabled(channelName)) return false;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        // Resource name, rather than numeric resource ID, stays stable across app updates.
        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/raw/sos_alert");
        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        Notification.Builder builder = Notification.Builder.recoverBuilder(this, notification)
                .setCategory(Notification.CATEGORY_EVENT)
                .setPriority(Notification.PRIORITY_HIGH)
                .setGroup(null)
                .setOnlyAlertOnce(false)
                .setDefaults(0)
                .setSound(sound, audio)
                .setVibrate(SosNotificationPolicy.vibration());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(SosNotificationPolicy.CHANNEL_ID,
                    SosNotificationPolicy.CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Pedidos de ajuda de vizinhos próximos e testes de som do SOS.");
            channel.setSound(sound, audio);
            channel.enableVibration(true);
            channel.setVibrationPattern(SosNotificationPolicy.vibration());
            // Creating an existing channel preserves the user's sound, mute and DND choices.
            manager.createNotificationChannel(channel);
            if (manager.getNotificationChannel(SosNotificationPolicy.CHANNEL_ID).getImportance()
                    == NotificationManager.IMPORTANCE_NONE) return false;
            builder.setChannelId(SosNotificationPolicy.CHANNEL_ID)
                    .setGroupAlertBehavior(Notification.GROUP_ALERT_ALL);
        }
        try {
            manager.notify(platformTag, platformId, builder.build());
            return true;
        } catch (SecurityException denied) {
            return false;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();

        
            registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());
        
            registerExtraCommandHandler(new DigitalGoodsRequestHandler(getApplicationContext()));
        
    }
}

