import { useState } from "react";
import { Text } from "react-native";
import { countWords, FEEDBACK_MAX_WORDS, submitFeedback } from "@/features/feedback/api";
import { alertMessage } from "@/shared/lib/alert";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

export default function HelpSupportScreen() {
  const { colors, spacing, typography } = useTheme();
  const [comment, setComment] = useState("");
  const [isSending, setIsSending] = useState(false);

  const wordCount = countWords(comment);
  const overLimit = wordCount > FEEDBACK_MAX_WORDS;

  const handleSend = async () => {
    setIsSending(true);
    try {
      await submitFeedback(comment);
      setComment("");
      alertMessage("Thanks!", "Your comment has been sent. We read every one.");
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
        style={{ minHeight: 160, textAlignVertical: "top" }}
        error={overLimit ? `Please keep it under ${FEEDBACK_MAX_WORDS} words.` : undefined}
      />

      <Text
        style={[
          typography.caption,
          { color: overLimit ? colors.danger : colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.lg, textAlign: "right" },
        ]}
      >
        {wordCount} / {FEEDBACK_MAX_WORDS} words
      </Text>

      <Button label="Send" onPress={handleSend} loading={isSending} disabled={!comment.trim() || overLimit} />
    </ScreenContainer>
  );
}
