package app.lumenloop.game;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Google Play in-app review. Google decides whether the dialog is actually shown (quota), and the
 * result never says whether the player rated – so the call always resolves.
 */
@CapacitorPlugin(name = "InAppReview")
public class InAppReviewPlugin extends Plugin {

    @PluginMethod
    public void request(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || getActivity() == null) {
                call.resolve();
                return;
            }
            ReviewInfo info = task.getResult();
            manager.launchReviewFlow(getActivity(), info).addOnCompleteListener(done -> call.resolve());
        });
    }
}
