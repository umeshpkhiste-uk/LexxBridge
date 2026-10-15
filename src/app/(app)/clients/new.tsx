import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Client, ClientType, createClientRecord, getClient, updateClient, uploadClientPhoto } from "@/features/clients/api";
import { ClientAvatar } from "@/features/clients/ClientAvatar";
import { mobileError, normalizeIndianMobile } from "@/shared/lib/validation";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

/** New client, or — with ?id= — edit an existing client's details and photo. */
export default function NewClientScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const { colors, spacing, typography } = useTheme();
  const [existing, setExisting] = useState<Client | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; mimeType: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [clientType, setClientType] = useState<ClientType>("individual");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ fullName?: boolean; phone?: boolean }>({});

  const isOrganization = clientType === "organization";
  const fullNameError = touched.fullName && !fullName.trim() ? "Client name is required" : null;
  const phoneErr = touched.phone ? mobileError(phone) : null;

  useEffect(() => {
    if (!id) return;
    getClient(id)
      .then((c) => {
        setExisting(c);
        setFullName(c.full_name);
        setClientType(c.client_type);
        setPhone(c.phone ?? "");
        setEmail(c.email ?? "");
        setAddress(c.address ?? "");
        setNotes(c.notes ?? "");
        setPrivateNotes(c.private_notes ?? "");
        setContactPersonName(c.contact_person_name ?? "");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load this client"));
  }, [id]);

  const handleSave = async () => {
    setTouched({ fullName: true, phone: true });
    if (!fullName.trim()) {
      setError("Client name is required");
      return;
    }
    if (mobileError(phone)) {
      setError("Enter a valid mobile number, or leave it blank");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const phoneValue = phone.trim() ? normalizeIndianMobile(phone) : null;
    try {
      if (existing) {
        await updateClient(existing.id, {
          fullName,
          clientType,
          phone: phoneValue,
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          privateNotes: privateNotes.trim() || null,
          contactPersonName: isOrganization ? contactPersonName.trim() || null : null,
        });
        if (photo) {
          await uploadClientPhoto(existing, photo.uri, photo.mimeType).catch(() =>
            Alert.alert("Photo not saved", "The details were saved, but the photo couldn't be uploaded. Please try again."),
          );
        }
        router.back();
        return;
      }
      const client = await createClientRecord({
        fullName,
        clientType,
        phone: phoneValue ?? "",
        email,
        address,
        notes,
        privateNotes,
        contactPersonName,
      });
      if (photo) {
        // The client is saved either way; a failed photo can be added later.
        await uploadClientPhoto(client, photo.uri, photo.mimeType).catch(() =>
          Alert.alert(
            "Photo not saved",
            "The client was added, but the photo couldn't be uploaded. You can add it from the client's page.",
          ),
        );
      }
      router.replace(`/(app)/cases/new?clientId=${client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission needed", "Allow photo access in Settings to add a client photo.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" });
  };

  if (isEdit && !existing) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Edit client" }} />
        {loadError ? <Text style={{ color: colors.danger }}>{loadError}</Text> : <ActivityIndicator color={colors.brand} />}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: isEdit ? "Edit client" : "New client" }} />
      <Pressable onPress={pickPhoto} style={{ alignItems: "center", marginBottom: spacing.md }} accessibilityLabel="Add client photo">
        <View>
          <ClientAvatar
            name={fullName || "?"}
            photoPath={existing?.photo_path ?? null}
            clientType={clientType}
            localUri={photo?.uri}
            size={84}
          />
          <View
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="camera" size={15} color={colors.textInverse} />
          </View>
        </View>
        <Text style={[typography.caption, { color: colors.brand, marginTop: spacing.xs }]}>
          {photo || existing?.photo_path ? "Change photo" : "Add photo (optional)"}
        </Text>
      </Pressable>
      <SegmentedControl
        segments={[
          { key: "individual", label: "Individual" },
          { key: "organization", label: "Organization" },
        ]}
        value={clientType}
        onChange={(key) => setClientType(key as ClientType)}
        disabled={isEdit}
      />
      {isEdit ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.md }]}>
          Client type can&apos;t be changed after the client is created.
        </Text>
      ) : null}
      <TextField
        label={isOrganization ? "Organization name" : "Full name"}
        placeholder={isOrganization ? "e.g. Sharma Traders Pvt. Ltd." : "e.g. Ramesh Kumar"}
        value={fullName}
        onChangeText={setFullName}
        onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
        autoCapitalize="words"
        error={fullNameError ?? undefined}
      />
      {isOrganization ? (
        <TextField
          label="Contact person name"
          placeholder="e.g. Priya Mehta"
          value={contactPersonName}
          onChangeText={setContactPersonName}
          autoCapitalize="words"
        />
      ) : null}
      <TextField
        label="Phone"
        placeholder="e.g. 98765 43210"
        value={phone}
        onChangeText={setPhone}
        onBlur={() => {
          setTouched((t) => ({ ...t, phone: true }));
          const tidy = normalizeIndianMobile(phone);
          if (tidy) setPhone(tidy);
        }}
        keyboardType="phone-pad"
        maxLength={20}
        error={phoneErr ?? undefined}
      />
      <TextField
        label="Email"
        placeholder="e.g. ramesh@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextField
        label="Address"
        placeholder="e.g. 12, MG Road, Pune, Maharashtra"
        value={address}
        onChangeText={setAddress}
        multiline
        numberOfLines={2}
      />
      <TextField
        label="Notes"
        placeholder="e.g. Prefers WhatsApp updates after 6 PM"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
      />
      <TextField
        label="Private notes (only visible to you)"
        placeholder="e.g. Changed advocates before, payment disputes"
        value={privateNotes}
        onChangeText={setPrivateNotes}
        multiline
        numberOfLines={3}
      />

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

      <Button label={isEdit ? "Save changes" : "Save client"} onPress={handleSave} loading={isSubmitting} />
    </ScreenContainer>
  );
}
