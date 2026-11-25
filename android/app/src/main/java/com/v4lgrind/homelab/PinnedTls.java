package com.v4lgrind.homelab;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Pure helpers behind {@link PinnedHttpPlugin}: which hosts may skip certificate
 * verification, and how a certificate's fingerprint is written.
 */
final class PinnedTls {

    private PinnedTls() {}

    /** True for a dotted IPv4 literal in 10/8, 172.16/12 or 192.168/16. */
    static boolean isPrivateIpv4(String host) {
        if (host == null) return false;
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] o = new int[4];
        for (int i = 0; i < 4; i++) {
            String p = parts[i];
            if (p.isEmpty() || p.length() > 3) return false;
            for (int j = 0; j < p.length(); j++) {
                if (!Character.isDigit(p.charAt(j))) return false;
            }
            o[i] = Integer.parseInt(p);
            if (o[i] > 255) return false;
        }
        if (o[0] == 10) return true;
        if (o[0] == 172 && o[1] >= 16 && o[1] <= 31) return true;
        return o[0] == 192 && o[1] == 168;
    }

    /** SHA-256 of the DER bytes as "AB:CD:…", the form Proxmox's GUI shows. */
    static String fingerprint(byte[] der) {
        byte[] digest;
        try {
            digest = MessageDigest.getInstance("SHA-256").digest(der);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
        StringBuilder sb = new StringBuilder(digest.length * 3);
        for (int i = 0; i < digest.length; i++) {
            if (i > 0) sb.append(':');
            sb.append(String.format("%02X", digest[i] & 0xff));
        }
        return sb.toString();
    }
}
