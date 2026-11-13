package app.lumenloop.game;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;

/**
 * Minimal bridge to Google Play Games Services v2: sign-in state, leaderboards and achievements.
 * Stays switched off until a real Play Games app ID is set in res/values/strings.xml (games_app_id),
 * so debug builds without a Play Console setup never touch the SDK.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private static final int RC_UI = 9004;
    private boolean configured = false;

    @Override
    public void load() {
        String id = getContext().getString(R.string.games_app_id);
        configured = id != null && id.matches("\\d{6,}");
        if (configured) {
            PlayGamesSdk.initialize(getContext());
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("configured", configured);
        if (!configured) {
            ret.put("signedIn", false);
            call.resolve(ret);
            return;
        }
        PlayGames.getGamesSignInClient(getActivity()).isAuthenticated().addOnCompleteListener(task -> {
            ret.put("signedIn", task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!configured) {
            call.reject("not_configured");
            return;
        }
        PlayGames.getGamesSignInClient(getActivity()).signIn().addOnCompleteListener(task -> {
            JSObject ret = new JSObject();
            ret.put("signedIn", task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void submitScore(PluginCall call) {
        String id = call.getString("leaderboardId");
        Double score = call.getDouble("score");
        if (configured && id != null && !id.isEmpty() && score != null) {
            PlayGames.getLeaderboardsClient(getActivity()).submitScore(id, score.longValue());
        }
        call.resolve();
    }

    @PluginMethod
    public void unlockAchievement(PluginCall call) {
        String id = call.getString("achievementId");
        if (configured && id != null && !id.isEmpty()) {
            PlayGames.getAchievementsClient(getActivity()).unlock(id);
        }
        call.resolve();
    }

    @PluginMethod
    public void showLeaderboards(PluginCall call) {
        if (!configured) {
            call.reject("not_configured");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity())
            .getAllLeaderboardsIntent()
            .addOnSuccessListener(intent -> open(intent, call))
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    @PluginMethod
    public void showAchievements(PluginCall call) {
        if (!configured) {
            call.reject("not_configured");
            return;
        }
        PlayGames.getAchievementsClient(getActivity())
            .getAchievementsIntent()
            .addOnSuccessListener(intent -> open(intent, call))
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    private void open(Intent intent, PluginCall call) {
        getActivity().startActivityForResult(intent, RC_UI);
        call.resolve();
    }
}
