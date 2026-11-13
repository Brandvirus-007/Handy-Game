package app.lumenloop.game;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.leaderboard.LeaderboardScore;
import com.google.android.gms.games.leaderboard.LeaderboardScoreBuffer;
import com.google.android.gms.games.leaderboard.LeaderboardVariant;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import java.nio.charset.StandardCharsets;

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

    private static final String SAVE_NAME = "lumen-loop-save";

    /** Cloud save (Play Games "Saved Games"): returns the stored text or an empty string. */
    @PluginMethod
    public void loadSave(PluginCall call) {
        if (!configured) {
            call.reject("not_configured");
            return;
        }
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client
            .open(SAVE_NAME, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .addOnSuccessListener(result -> {
                Snapshot snap = result.getData();
                JSObject ret = new JSObject();
                if (snap == null) {
                    ret.put("data", "");
                    call.resolve(ret);
                    return;
                }
                try {
                    byte[] bytes = snap.getSnapshotContents().readFully();
                    ret.put("data", bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8));
                } catch (Exception e) {
                    ret.put("data", "");
                }
                client.discardAndClose(snap);
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    @PluginMethod
    public void saveSave(PluginCall call) {
        String data = call.getString("data");
        String description = call.getString("description", "LUMEN LOOP");
        if (!configured || data == null) {
            call.reject("not_configured");
            return;
        }
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client
            .open(SAVE_NAME, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .addOnSuccessListener(result -> {
                Snapshot snap = result.getData();
                if (snap == null) {
                    call.reject("conflict");
                    return;
                }
                snap.getSnapshotContents().writeBytes(data.getBytes(StandardCharsets.UTF_8));
                SnapshotMetadataChange change = new SnapshotMetadataChange.Builder().setDescription(description).build();
                client.commitAndClose(snap, change).addOnCompleteListener(done -> call.resolve());
            })
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    /** Top scores of a leaderboard (all time, public) plus the player's own entry. */
    @PluginMethod
    public void topScores(PluginCall call) {
        String id = call.getString("leaderboardId");
        int max = call.getInt("max", 10);
        if (!configured || id == null || id.isEmpty()) {
            call.reject("not_configured");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity())
            .loadTopScores(id, LeaderboardVariant.TIME_SPAN_ALL_TIME, LeaderboardVariant.COLLECTION_PUBLIC, max)
            .addOnSuccessListener(data -> {
                JSArray list = new JSArray();
                if (data.get() != null) {
                    LeaderboardScoreBuffer buf = data.get().getScores();
                    for (LeaderboardScore s : buf) {
                        JSObject row = new JSObject();
                        row.put("rank", s.getRank());
                        row.put("name", s.getScoreHolderDisplayName());
                        row.put("score", s.getRawScore());
                        list.put(row);
                    }
                    buf.release();
                }
                PlayGames.getLeaderboardsClient(getActivity())
                    .loadCurrentPlayerLeaderboardScore(id, LeaderboardVariant.TIME_SPAN_ALL_TIME, LeaderboardVariant.COLLECTION_PUBLIC)
                    .addOnCompleteListener(me -> {
                        JSObject ret = new JSObject();
                        ret.put("scores", list);
                        LeaderboardScore own = me.isSuccessful() ? me.getResult().get() : null;
                        if (own != null) {
                            JSObject o = new JSObject();
                            o.put("rank", own.getRank());
                            o.put("name", own.getScoreHolderDisplayName());
                            o.put("score", own.getRawScore());
                            ret.put("me", o);
                        }
                        call.resolve(ret);
                    });
            })
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    private void open(Intent intent, PluginCall call) {
        getActivity().startActivityForResult(intent, RC_UI);
        call.resolve();
    }
}
