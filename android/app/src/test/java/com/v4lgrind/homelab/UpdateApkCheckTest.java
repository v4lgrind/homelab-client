package com.v4lgrind.homelab;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** A downloaded update is only handed to the installer when it is a newer Homelab build. */
public class UpdateApkCheckTest {

    private static final String PKG = "com.v4lgrind.homelab";

    @Test
    public void acceptsANewerBuildOfTheSameApp() {
        assertNull(UpdateApkCheck.rejectReason(PKG, 1L, PKG, 2010000L));
    }

    @Test
    public void rejectsAnUnreadableApk() {
        assertEquals("invalid_apk", UpdateApkCheck.rejectReason(PKG, 1L, null, null));
    }

    @Test
    public void rejectsAnotherApp() {
        assertEquals("wrong_package", UpdateApkCheck.rejectReason(PKG, 1L, "com.evil.app", 2010000L));
    }

    @Test
    public void rejectsTheSameOrAnOlderBuild() {
        assertEquals("not_newer", UpdateApkCheck.rejectReason(PKG, 2010000L, PKG, 2010000L));
        assertEquals("not_newer", UpdateApkCheck.rejectReason(PKG, 2010000L, PKG, 20000L));
    }
}
