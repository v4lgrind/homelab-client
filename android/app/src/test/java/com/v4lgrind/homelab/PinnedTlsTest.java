package com.v4lgrind.homelab;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Proxmox is reached with an unverified certificate only on a private IPv4. */
public class PinnedTlsTest {

    @Test
    public void acceptsRfc1918Addresses() {
        assertTrue(PinnedTls.isPrivateIpv4("10.0.0.1"));
        assertTrue(PinnedTls.isPrivateIpv4("172.16.0.1"));
        assertTrue(PinnedTls.isPrivateIpv4("172.31.255.255"));
        assertTrue(PinnedTls.isPrivateIpv4("192.168.1.10"));
    }

    @Test
    public void rejectsPublicAddressesHostnamesAndMalformedInput() {
        assertFalse(PinnedTls.isPrivateIpv4("172.32.0.1"));
        assertFalse(PinnedTls.isPrivateIpv4("172.15.0.1"));
        assertFalse(PinnedTls.isPrivateIpv4("8.8.8.8"));
        assertFalse(PinnedTls.isPrivateIpv4("pve.local"));
        assertFalse(PinnedTls.isPrivateIpv4("192.168.1"));
        assertFalse(PinnedTls.isPrivateIpv4("192.168.1.256"));
        assertFalse(PinnedTls.isPrivateIpv4("::1"));
        assertFalse(PinnedTls.isPrivateIpv4(null));
    }

    @Test
    public void fingerprintIsUppercaseColonSeparatedSha256() {
        // SHA-256("abc") = ba7816bf 8f01cfea 414140de 5dae2223 b00361a3 96177a9c b410ff61 f20015ad
        String fp = PinnedTls.fingerprint("abc".getBytes());
        assertEquals(95, fp.length());
        assertTrue(fp.startsWith("BA:78:16:BF:"));
        assertTrue(fp.endsWith(":F2:00:15:AD"));
    }
}
