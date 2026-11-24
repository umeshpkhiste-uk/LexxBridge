import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useIsSlow } from "@/shared/hooks/useIsSlow";
import { ImageRetry } from "@/shared/ui/RemoteImage";
import { getPublicVideoUrl } from "./api";

/** Inline video for a post, with the platform's own playback controls and
 * full-screen button. Nothing plays until the viewer taps play. */
export function PostVideo({ path, height = 220, borderRadius = 8 }: { path: string; height?: number; borderRadius?: number }) {
  const url = getPublicVideoUrl(path);
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const isSlow = useIsSlow(status === "loading");

  return (
    <View style={[styles.video, { height, borderRadius }]}>
      <VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} style={StyleSheet.absoluteFill} />
      {status === "loading" ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color="#FFFFFF" />
          {isSlow ? <Text style={styles.note}>Network is slow. Still loading…</Text> : null}
        </View>
      ) : null}
      {status === "error" ? <ImageRetry what="video" onRetry={() => player.replaceAsync(url).catch(() => {})} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  video: { width: "100%", backgroundColor: "#000000", overflow: "hidden" },
  center: { alignItems: "center", justifyContent: "center", gap: 8 },
  note: { color: "#FFFFFF", fontSize: 13 },
});
