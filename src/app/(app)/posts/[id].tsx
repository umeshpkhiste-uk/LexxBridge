import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { supabase } from "@/shared/lib/supabase";
import { addComment, deletePost, FeedPost, getPost, getPublicImageUrl, listComments, PostComment, toggleLike } from "@/features/posts/api";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { PostVideo } from "@/features/posts/PostVideo";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { LoadState } from "@/shared/ui/LoadState";
import { RemoteImage } from "@/shared/ui/RemoteImage";
import { useTheme } from "@/shared/ui/theme";
import { Ionicons } from "@expo/vector-icons";

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius, typography } = useTheme();

  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    Promise.all([getPost(id), listComments(id), supabase.auth.getUser()])
      .then(([postData, commentData, userResult]) => {
        setPost(postData);
        setComments(commentData);
        setMyId(userResult.data.user?.id ?? null);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggleLike = async () => {
    if (!post) return;
    setPost({ ...post, liked_by_me: !post.liked_by_me, likes_count: post.likes_count + (post.liked_by_me ? -1 : 1) });
    try {
      await toggleLike(post.id, post.liked_by_me);
    } catch (err) {
      setPost(post);
      alertMessage("Couldn't update", friendlyErrorMessage(err));
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setIsSubmittingComment(true);
    try {
      await addComment(id, commentText);
      setCommentText("");
      load();
    } catch (err) {
      alertMessage("Couldn't post comment", friendlyErrorMessage(err));
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeletePost = () => {
    confirmAlert("Delete post", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (post) await deletePost(post);
            router.back();
          } catch (err) {
            alertMessage("Couldn't delete post", friendlyErrorMessage(err));
          }
        },
      },
    ]);
  };

  if (isLoading || error || !post) {
    return (
      <ScreenContainer>
        <LoadState error={isLoading ? null : (error ?? "This post isn't available.")} onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View>
          <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{post.author?.full_name ?? "Advocate"}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            {new Date(post.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
          </Text>
        </View>
        {myId === post.author_id ? (
          <Text style={[typography.caption, { color: colors.danger }]} onPress={handleDeletePost}>
            Delete
          </Text>
        ) : (
          <Text
            style={[typography.caption, { color: colors.textSecondary }]}
            onPress={() => router.push(`/(app)/reports/new?targetType=post&targetId=${post.id}&label=post`)}
          >
            Report
          </Text>
        )}
      </View>

      <Text style={[typography.body, { color: colors.textPrimary, marginBottom: spacing.md }]}>{post.content}</Text>

      {post.image_path ? (
        <RemoteImage
          uri={getPublicImageUrl(post.image_path)}
          style={{ width: "100%", height: 220, borderRadius: 8, marginBottom: spacing.md, backgroundColor: colors.surfaceAlt }}
        />
      ) : null}
      {post.video_path ? (
        <View style={{ marginBottom: spacing.md }}>
          <PostVideo path={post.video_path} height={240} />
        </View>
      ) : null}

      <Pressable onPress={handleToggleLike} style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
        <Ionicons name={post.liked_by_me ? "thumbs-up" : "thumbs-up-outline"} size={20} color={post.liked_by_me ? colors.accent : colors.textSecondary} />
        <Text style={[typography.caption, { color: colors.textSecondary, marginLeft: 6 }]}>
          {post.likes_count} endorsement{post.likes_count === 1 ? "" : "s"}
        </Text>
      </Pressable>

      <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
        Comments ({comments?.length ?? 0})
      </Text>

      <TextField label="" placeholder="Write a comment" value={commentText} onChangeText={setCommentText} style={{ marginBottom: spacing.sm }} />
      <Button label="Comment" variant="secondary" onPress={handleAddComment} loading={isSubmittingComment} />

      <View style={{ height: spacing.md }} />

      {comments?.map((c) => (
        <View
          key={c.id}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.sm,
          }}
        >
          <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{c.author?.full_name ?? "Advocate"}</Text>
          <Text style={[typography.body, { color: colors.textSecondary }]}>{c.content}</Text>
        </View>
      ))}
    </ScreenContainer>
  );
}
