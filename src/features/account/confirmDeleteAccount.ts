import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { deleteMyAccount } from "./api";

/**
 * Two-step confirmation, then permanent deletion of the signed-in account:
 * profile, clients, cases, hearings, documents, transactions, posts, chats,
 * connections, notifications and every uploaded file. Signing out on success
 * sends the app back to the login screen.
 */
export function confirmDeleteAccount(setBusy: (busy: boolean) => void) {
  confirmAlert(
    "Delete your account?",
    "This permanently deletes your profile, clients, cases, hearings, documents, payments, posts, chats and connections, plus every file you've uploaded. It cannot be undone.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        style: "destructive",
        onPress: () =>
          confirmAlert("Are you absolutely sure?", "Your account and all its data will be erased and can't be recovered.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete permanently",
              style: "destructive",
              onPress: async () => {
                setBusy(true);
                try {
                  await deleteMyAccount();
                } catch (err) {
                  setBusy(false);
                  alertMessage("Couldn't delete account", friendlyErrorMessage(err));
                }
              },
            },
          ]),
      },
    ],
  );
}
