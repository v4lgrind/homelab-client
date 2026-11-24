package com.v4lgrind.homelab;

/** Why a downloaded update can't be installed, or null when it can. */
final class UpdateApkCheck {

    private UpdateApkCheck() {}

    static String rejectReason(String expectedPackage, long installedCode, String apkPackage, Long apkCode) {
        if (apkPackage == null || apkCode == null) return "invalid_apk";
        if (!apkPackage.equals(expectedPackage)) return "wrong_package";
        if (apkCode <= installedCode) return "not_newer";
        return null;
    }
}
