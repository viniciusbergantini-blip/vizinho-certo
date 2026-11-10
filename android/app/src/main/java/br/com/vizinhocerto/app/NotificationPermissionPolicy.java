package br.com.vizinhocerto.app;

final class NotificationPermissionPolicy {
    private NotificationPermissionPolicy() {}

    static boolean shouldRequest(int sdk, boolean granted, boolean asked, boolean explicitRequest) {
        return sdk >= 33 && !granted && (!asked || explicitRequest);
    }
}
