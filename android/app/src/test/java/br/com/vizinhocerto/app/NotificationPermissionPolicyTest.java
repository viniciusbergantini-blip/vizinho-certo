package br.com.vizinhocerto.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class NotificationPermissionPolicyTest {
    @Test public void requestsOnFirstAndroid13LaunchWhenNotGranted() {
        assertTrue(NotificationPermissionPolicy.shouldRequest(33, false, false, false));
        assertTrue(NotificationPermissionPolicy.shouldRequest(36, false, false, false));
    }
    @Test public void respectsDenialUntilUserExplicitlyRequestsAgain() {
        assertFalse(NotificationPermissionPolicy.shouldRequest(36, false, true, false));
        assertTrue(NotificationPermissionPolicy.shouldRequest(36, false, true, true));
    }
    @Test public void doesNotAskIfAlreadyGrantedOrOnOlderAndroid() {
        assertFalse(NotificationPermissionPolicy.shouldRequest(36, true, false, true));
        assertFalse(NotificationPermissionPolicy.shouldRequest(32, false, false, true));
    }
}
