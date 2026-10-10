import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/shared/ui/theme";

export type PickedReceipt = { uri: string; mimeType: string };

/** "Take photo / Upload image" for a photo attachment (payment receipt,
 * identity document, etc.), then a preview with Retake / Replace / Remove. */
export function ReceiptPicker({
  value,
  onChange,
  label = "Receipt / payment screenshot (optional)",
}: {
  value: PickedReceipt | null;
  onChange: (value: PickedReceipt | null) => void;
  label?: string;
}) {
  const { colors, spacing, radius, typography } = useTheme();

  const pick = async (source: "camera" | "library") => {
    const permission =
      source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", `Allow ${source === "camera" ? "camera" : "photo"} access in Settings to attach a receipt.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (asset) onChange({ uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" });
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label}</Text>
      {value ? (
        <View style={[styles.preview, { borderColor: colors.border, borderRadius: radius.lg }]}>
          <Image source={{ uri: value.uri }} style={{ width: "100%", height: 200 }} contentFit="cover" />
          <View style={[styles.previewActions, { padding: spacing.sm, backgroundColor: colors.surface }]}>
            <Pressable onPress={() => pick("camera")} style={styles.previewAction} accessibilityLabel="Retake photo">
              <Ionicons name="camera-outline" size={18} color={colors.brand} />
              <Text style={[typography.label, { color: colors.brand }]}>Retake</Text>
            </Pressable>
            <Pressable onPress={() => pick("library")} style={styles.previewAction} accessibilityLabel="Choose another image">
              <Ionicons name="images-outline" size={18} color={colors.brand} />
              <Text style={[typography.label, { color: colors.brand }]}>Replace</Text>
            </Pressable>
            <Pressable onPress={() => onChange(null)} style={styles.previewAction} accessibilityLabel="Remove receipt">
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[typography.label, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {(
            [
              { source: "camera", icon: "camera-outline", label: "Take photo" },
              { source: "library", icon: "cloud-upload-outline", label: "Upload image" },
            ] as const
          ).map((b) => (
            <Pressable
              key={b.source}
              onPress={() => pick(b.source)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  pickButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 18, borderWidth: 1, borderStyle: "dashed" },
  preview: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth * 2 },
  previewActions: { flexDirection: "row", justifyContent: "space-around" },
  previewAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
});
