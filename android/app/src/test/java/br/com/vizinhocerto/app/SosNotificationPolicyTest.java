package br.com.vizinhocerto.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class SosNotificationPolicyTest {
    @Test public void routesRealSosAndPersonalTest() {
        assertTrue(SosNotificationPolicy.isSosTitle("🆘 ALERTA DE EMERGÊNCIA!"));
        assertTrue(SosNotificationPolicy.isSosTitle("🆘 Teste de som do SOS"));
    }

    @Test public void leavesPostsCommentsAndDigestOnNormalChannel() {
        assertFalse(SosNotificationPolicy.isSosTitle(null));
        assertFalse(SosNotificationPolicy.isSosTitle("📢 Nova publicação na sua rua!"));
        assertFalse(SosNotificationPolicy.isSosTitle("💬 🆘 ALERTA DE EMERGÊNCIA! comentou no seu post"));
        assertFalse(SosNotificationPolicy.isSosTitle("🏘️ Novidades perto de você"));
        assertFalse(SosNotificationPolicy.isSosTitle("🆘 qualquer publicação"));
    }

    @Test public void vibrationArraysCannotBeMutatedAcrossBinderCalls() {
        long[] first = SosNotificationPolicy.vibration();
        first[1] = 0;
        assertEquals(350, SosNotificationPolicy.vibration()[1]);
    }
}
