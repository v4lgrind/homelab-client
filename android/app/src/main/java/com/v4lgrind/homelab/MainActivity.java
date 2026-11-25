package com.v4lgrind.homelab;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(PinnedHttpPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
