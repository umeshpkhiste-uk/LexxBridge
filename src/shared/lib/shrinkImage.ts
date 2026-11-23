import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Longest side, in pixels, for each kind of uploaded photo. Avatars are
 * shown small; receipts stay larger so the small print stays readable. */
export const IMAGE_MAX_SIDE = { avatar: 512, photo: 1600, receipt: 2000 } as const;

type Picked = { uri: string; width?: number; height?: number; mimeType?: string | null };

/** Resizes a picked photo so its longest side is at most `maxSide` and
 * re-encodes it as a 70% JPEG before upload — a 12 MP phone photo drops
 * from several MB to a few hundred KB, which saves the user's data, our
 * storage, and load time for everyone who views it.
 *
 * Never blocks an upload: if anything goes wrong it hands back the
 * original image unchanged. */
export async function shrinkImage(asset: Picked, maxSide: number): Promise<{ uri: string; mimeType: string; width?: number; height?: number }> {
  const original = { uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg", width: asset.width, height: asset.height };
  // GIFs would lose their animation if re-encoded.
  if (original.mimeType === "image/gif") return original;
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const { width = 0, height = 0 } = asset;
    if (width > maxSide || height > maxSide) {
      context.resize(width >= height ? { width: maxSide } : { height: maxSide });
    }
    // Size unknown (some web pickers): only re-compress — resizing blind
    // could enlarge a small image.
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return { uri: saved.uri, mimeType: "image/jpeg", width: saved.width, height: saved.height };
  } catch {
    return original;
  }
}
