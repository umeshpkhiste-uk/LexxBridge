import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useState } from "react";
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { createPost, MAX_ATTACHMENT_BYTES, MAX_VIDEO_BYTES, PickedFile } from "@/features/posts/api";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

export default function NewPostScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [content, setContent] = useState("");
  const [image, setImage] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [video, setVideo] = useState<{ uri: string; mimeType?: string; size?: number } | null>(null);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contentTouched, setContentTouched] = useState(false);

  const contentError = contentTouched && !content.trim() ? "Write something to post" : null;

  // A post's files are separate from its one photo/video — e.g. a slide
  // deck or a spreadsheet shared alongside an update.
  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const tooLarge = result.assets.find((a) => a.size && a.size > MAX_ATTACHMENT_BYTES);
    if (tooLarge) {
      Alert.alert("File too large", `${tooLarge.name} is over the 20 MB attachment limit.`);
      return;
    }
    setFiles((prev) => [...prev, ...result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size }))]);
    setError(null);
  };

  const removeFile = (uri: string) => setFiles((prev) => prev.filter((f) => f.uri !== uri));

  // Gallery asks for photo access; camera asks for camera access.
  const pickImage = async (source: "library" | "camera") => {
    const permission =
      source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        source === "camera" ? "Camera access needed" : "Photo access needed",
        source === "camera"
          ? "Allow camera access in Settings to take a photo for your post."
          : "Allow photo library access in Settings to attach an image.",
        permission.canAskAgain ? [{ text: "OK" }] : [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
      );
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets?.[0];
    if (asset) {
      setImage({ uri: asset.uri, mimeType: asset.mimeType });
      setVideo(null);
      setError(null);
    }
  };

  // A post carries one attachment: a photo or a video (under 50 MB).
  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo library access in Settings to attach a video.",
        permission.canAskAgain ? [{ text: "OK" }] : [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    let size = asset.fileSize;
    if (!size) {
      const info = await FileSystem.getInfoAsync(asset.uri);
      size = info.exists ? info.size : undefined;
    }
    if (size && size > MAX_VIDEO_BYTES) {
      Alert.alert("Video too large", `This video is ${(size / 1024 / 1024).toFixed(0)} MB. Please choose a video under 50 MB, or trim it first.`);
      return;
    }
    setVideo({ uri: asset.uri, mimeType: asset.mimeType ?? "video/mp4", size });
    setImage(null);
    setError(null);
  };

  const handlePost = async () => {
    setContentTouched(true);
    if (!content.trim()) {
      setError("Write something to post");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await createPost({ content, imageUri: image?.uri, imageMimeType: image?.mimeType, video, files });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <TextField
        label="Share a professional update"
        placeholder="e.g. Successfully argued for a stay order in the High Court today"
        value={content}
        onChangeText={setContent}
        onBlur={() => setContentTouched(true)}
        multiline
        numberOfLines={6}
        style={{ height: 140, paddingTop: spacing.sm, textAlignVertical: "top" }}
        error={contentError ?? undefined}
      />

      {video ? (
        <View style={[styles.preview, { borderColor: colors.border, borderRadius: radius.lg, marginBottom: spacing.md }]}>
          <LocalVideoPreview uri={video.uri} />
          <View style={[styles.previewActions, { padding: spacing.sm, backgroundColor: colors.surface }]}>
            <Text style={[typography.caption, { color: colors.textSecondary, alignSelf: "center" }]}>
              {video.size ? `${(video.size / 1024 / 1024).toFixed(1)} MB` : "Video"}
            </Text>
            <Pressable onPress={pickVideo} style={styles.previewAction} accessibilityLabel="Choose another video">
              <Ionicons name="videocam-outline" size={18} color={colors.brand} />
              <Text style={[typography.label, { color: colors.brand }]}>Replace</Text>
            </Pressable>
            <Pressable onPress={() => setVideo(null)} style={styles.previewAction} accessibilityLabel="Remove video">
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[typography.label, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : image ? (
        <View style={[styles.preview, { borderColor: colors.border, borderRadius: radius.lg, marginBottom: spacing.md }]}>
          <Image source={{ uri: image.uri }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
          <View style={[styles.previewActions, { padding: spacing.sm, backgroundColor: colors.surface }]}>
            <Pressable onPress={() => pickImage("camera")} style={styles.previewAction} accessibilityLabel="Retake photo">
              <Ionicons name="camera-outline" size={18} color={colors.brand} />
              <Text style={[typography.label, { color: colors.brand }]}>Retake</Text>
            </Pressable>
            <Pressable onPress={() => pickImage("library")} style={styles.previewAction} accessibilityLabel="Choose another image">
              <Ionicons name="images-outline" size={18} color={colors.brand} />
              <Text style={[typography.label, { color: colors.brand }]}>Replace</Text>
            </Pressable>
            <Pressable onPress={() => setImage(null)} style={styles.previewAction} accessibilityLabel="Remove image">
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[typography.label, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
          {(
            [
              { source: "library", icon: "image-outline", label: "Upload image" },
              { source: "camera", icon: "camera-outline", label: "Take photo" },
              { source: "video", icon: "videocam-outline", label: "Upload video" },
            ] as const
          ).map((b) => (
            <Pressable
              key={b.source}
              onPress={() => (b.source === "video" ? pickVideo() : pickImage(b.source))}
              accessibilityLabel={b.label}
              style={({ pressed }) => [
                styles.pickButton,
                { borderColor: colors.border, borderRadius: radius.lg, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
              ]}
            >
              <Ionicons name={b.icon} size={24} color={colors.brand} />
              <Text style={[typography.label, { color: colors.textPrimary }]}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!image && !video ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: -spacing.xs, marginBottom: spacing.md }]}>
          Add one photo or one video (up to 50 MB).
        </Text>
      ) : null}

      <Pressable
        onPress={pickFiles}
        accessibilityLabel="Attach files"
        style={({ pressed }) => [
          styles.attachRow,
          { borderColor: colors.border, borderRadius: radius.sm, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, marginBottom: spacing.md },
        ]}
      >
        <Ionicons name="attach-outline" size={20} color={colors.brand} />
        <Text style={[typography.label, { color: colors.textPrimary }]}>Attach files (PDF, slides, spreadsheets…)</Text>
      </Pressable>

      {files.length ? (
        <View style={{ gap: spacing.xs, marginBottom: spacing.md }}>
          {files.map((f) => (
            <View
              key={f.uri}
              style={[styles.fileRow, { borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface }]}
            >
              <Ionicons name="document-attach-outline" size={18} color={colors.brand} />
              <Text style={[typography.label, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                {f.name}
              </Text>
              <Pressable onPress={() => removeFile(f.uri)} hitSlop={8} accessibilityLabel={`Remove ${f.name}`}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

      <Button label={isSubmitting && video ? "Uploading video…" : "Post"} onPress={handlePost} loading={isSubmitting} pill />
    </ScreenContainer>
  );
}

/** Preview of the picked (not yet uploaded) video. */
function LocalVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", height: 200, backgroundColor: "#000000" }} />;
}

const styles = StyleSheet.create({
  pickButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, paddingHorizontal: 4, borderWidth: 1, borderStyle: "dashed" },
  preview: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth * 2 },
  previewActions: { flexDirection: "row", justifyContent: "space-around" },
  previewAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  attachRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderStyle: "dashed" },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth },
});
