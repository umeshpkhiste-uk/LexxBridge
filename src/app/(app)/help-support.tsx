import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { countWords, FEEDBACK_MAX_CHARS, FEEDBACK_MAX_WORDS, submitFeedback } from "@/features/feedback/api";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

export default function HelpSupportScreen() {
  const { colors, spacing, typography } = useTheme();
  const [comment, setComment] = useState("");
  const [isSending, setIsSending] = useState(false);

  const wordCount = countWords(comment);
  const overWordLimit = wordCount > FEEDBACK_MAX_WORDS;
  const overCharLimit = comment.length > FEEDBACK_MAX_CHARS;
  const overLimit = overWordLimit || overCharLimit;

  const handleSend = async () => {
    setIsSending(true);
    try {
      await submitFeedback(comment);
      setComment("");
      // Tapping OK is what was leaving people stuck on this screen before —
      // go back to Profile right after they acknowledge it.
      confirmAlert("Thanks!", "Your comment has been sent. We read every one.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      alertMessage("Couldn't send", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        Have an idea, a complaint, or something that isn&apos;t working right? Tell us about it below and it&apos;ll
        go straight to the LexxBridge team.
      </Text>

      <TextField
        label="Your suggestion or comment"
        value={comment}
        onChangeText={setComment}
        placeholder="What's on your mind?"
        multiline
        numberOfLines={8}
        maxLength={FEEDBACK_MAX_CHARS}
        style={{ minHeight: 160, textAlignVertical: "top" }}
        error={
          overCharLimit
            ? `Please keep it under ${FEEDBACK_MAX_CHARS} characters.`
            : overWordLimit
              ? `Please keep it under ${FEEDBACK_MAX_WORDS} words.`
              : undefined
        }
      />

      <Text
        style={[
          typography.caption,
          { color: overLimit ? colors.danger : colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.lg, textAlign: "right" },
        ]}
      >
        {wordCount} / {FEEDBACK_MAX_WORDS} words · {comment.length} / {FEEDBACK_MAX_CHARS} characters
      </Text>

      <Button label="Send" onPress={handleSend} loading={isSending} disabled={!comment.trim() || overLimit} />
    </ScreenContainer>
  );
}
