package br.com.vizinhocerto.app;

/** Explicit titles produced by our backend; ordinary posts cannot select the SOS channel. */
final class SosNotificationPolicy {
    static final String CHANNEL_ID = "vc_sos_v1";
    static final String CHANNEL_NAME = "Alertas SOS";

    private SosNotificationPolicy() {}

    static boolean isSosTitle(CharSequence title) {
        if (title == null) return false;
        String value = title.toString();
        return value.equals("🆘 ALERTA DE EMERGÊNCIA!")
                || value.equals("🆘 Teste de som do SOS");
    }

    static long[] vibration() {
        return new long[] { 0, 350, 120, 350, 120, 700 };
    }
}
