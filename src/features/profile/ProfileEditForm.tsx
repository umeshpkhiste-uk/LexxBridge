import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COURT_OPTIONS } from "@/shared/data/courts";
import { BAR_COUNCILS, INDIA_STATES, STATE_NAMES } from "@/shared/data/indiaLocations";
import { SUPPORTED_LANGUAGES } from "@/shared/i18n/languages";
import { alertMessage } from "@/shared/lib/alert";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { isSameState, lookupPincode, PincodeOption, pincodesForCity } from "@/shared/lib/pincode";
import { enrolmentError, mobileError, normalizeEnrolment, normalizeIndianMobile, pincodeError } from "@/shared/lib/validation";
import { Button } from "@/shared/ui/Button";
import { DateField, fromDateOnly, toDateOnly } from "@/shared/ui/DateField";
import { ErrorNotice } from "@/shared/ui/ErrorNotice";
import { SelectField } from "@/shared/ui/SelectField";
import { TagInput } from "@/shared/ui/TagInput";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";
import { AdvocateProfile, EducationEntry, Gender, updateMyProfile, uploadProfilePhoto } from "./api";

const PRACTICE_AREA_IDEAS = [
  "Civil Litigation",
  "Criminal Law",
  "Family Law",
  "Corporate Law",
  "Arbitration",
  "Constitutional & Writs",
  "Property & Real Estate",
  "Taxation",
  "Labour & Employment",
  "Consumer Protection",
  "Intellectual Property",
  "Banking & Insolvency",
];
// Also the exact set the in-app Language setting can offer (settings.tsx /
// language.tsx) — an advocate can only switch the app's language to one
// they've listed here.
const LANGUAGE_IDEAS = SUPPORTED_LANGUAGES.map((l) => l.name);
const GENDERS: { key: Gender; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
  { key: "prefer_not_to_say", label: "Prefer not to say" },
];

type Props = {
  profile: AdvocateProfile;
  email: string | null;
  submitLabel: string;
  secondaryLabel: string;
  onSaved: (profile: AdvocateProfile) => void;
  onSecondary: () => void;
  /** Extra fields written with the save (e.g. onboarding completion). */
  extraOnSave?: Parameters<typeof updateMyProfile>[0];
};

export function ProfileEditForm({ profile, email, submitLabel, secondaryLabel, onSaved, onSecondary, extraOnSave }: Props) {
  const { colors, spacing, radius, typography } = useTheme();

  const [photoUrl, setPhotoUrl] = useState(profile.profile_photo_url);
  const [isUploading, setIsUploading] = useState(false);
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [about, setAbout] = useState(profile.about ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [state, setState] = useState(profile.state ?? "");
  const [years, setYears] = useState(profile.years_of_experience?.toString() ?? "");
  const [practiceAreas, setPracticeAreas] = useState(profile.practice_areas);
  const [courts, setCourts] = useState(profile.courts);
  const [languages, setLanguages] = useState(profile.languages);
  const [barCouncil, setBarCouncil] = useState(profile.bar_council_state ?? "");
  const [enrolment, setEnrolment] = useState(profile.bar_registration_number ?? "");
  const [education, setEducation] = useState<EducationEntry[]>(profile.education.length ? profile.education : []);
  const [memberships, setMemberships] = useState(profile.bar_memberships);
  const [chamber, setChamber] = useState(profile.chamber_address ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [dob, setDob] = useState<Date | null>(fromDateOnly(profile.date_of_birth));
  const [gender, setGender] = useState<Gender | null>(profile.gender);
  const [addressLine, setAddressLine] = useState(profile.address_line ?? "");
  const [pincode, setPincode] = useState(profile.pincode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Field-level errors show once a field has been left (or on save).
  const [touched, setTouched] = useState<{ fullName?: boolean; years?: boolean; phone?: boolean; enrolment?: boolean }>({});
  const [pinResult, setPinResult] = useState<{ key: string; options: PincodeOption[] } | null>(null);
  const [pinWarning, setPinWarning] = useState<string | null>(null);

  const fullNameError = touched.fullName && !fullName.trim() ? "Full name is required" : null;
  const yearsError = touched.years && years.trim() && !/^\d{1,2}$/.test(years.trim()) ? "Enter a number between 0 and 99" : null;
  const phoneError = touched.phone ? mobileError(phone) : null;
  const enrolError = touched.enrolment ? enrolmentError(enrolment) : null;
  const cityOptions = (INDIA_STATES[state] ?? []).map((c) => ({ value: c, label: c }));

  // PIN codes for the chosen city (India Post lookup), remembered per city.
  const pinKey = city && state ? `${state}|${city}` : null;
  const pinOptions = pinResult && pinResult.key === pinKey ? pinResult.options : [];
  const pinLoading = !!pinKey && pinResult?.key !== pinKey;
  useEffect(() => {
    if (!pinKey) return;
    let cancelled = false;
    const [forState, forCity] = pinKey.split("|");
    pincodesForCity(forCity, forState).then((options) => {
      if (!cancelled) setPinResult({ key: pinKey, options });
    });
    return () => {
      cancelled = true;
    };
  }, [pinKey]);

  const chooseState = (next: string) => {
    if (next === state) return;
    setState(next);
    setCity("");
    setPincode("");
    setPinWarning(null);
  };

  const chooseCity = (next: string) => {
    if (next === city) return;
    setCity(next);
    setPincode("");
    setPinWarning(null);
  };

  const choosePincode = async (next: string) => {
    setPincode(next);
    setPinWarning(null);
    if (pincodeError(next) || pinOptions.some((o) => o.pincode === next)) return;
    // Typed-in PIN: check it belongs to the chosen state (warn, don't block).
    const place = await lookupPincode(next);
    if (!place) setPinWarning("Couldn't verify this PIN code — please double-check it.");
    else if (state && !isSameState(place.state, state))
      setPinWarning(`This PIN code is in ${place.district}, ${place.state}, not ${state}.`);
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alertMessage("Photo access needed", "Allow photo library access to choose a profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    setIsUploading(true);
    try {
      setPhotoUrl(await uploadProfilePhoto(result.assets[0].uri, result.assets[0].mimeType));
    } catch (err) {
      alertMessage("Couldn't upload photo", friendlyErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const updateEducation = (index: number, patch: Partial<EducationEntry>) =>
    setEducation((list) => list.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const handleSave = async () => {
    const dobValue = toDateOnly(dob);
    const pin = pincode.trim();
    setTouched({ fullName: true, years: true, phone: true, enrolment: true });
    if (!fullName.trim()) return setError("Full name is required");
    if (years.trim() && !/^\d{1,2}$/.test(years.trim())) return setError("Years of practice: enter a number between 0 and 99");
    if (mobileError(phone)) return setError(`Mobile number: ${mobileError(phone)}`);
    if (enrolmentError(enrolment)) return setError(`Enrolment no.: ${enrolmentError(enrolment)}`);
    if (pincodeError(pin)) return setError(`PIN code: ${pincodeError(pin)}`);
    const phoneValue = phone.trim() ? normalizeIndianMobile(phone) : null;
    const enrolmentValue = enrolment.trim() ? normalizeEnrolment(enrolment) : null;

    const cleanEducation = education
      .map((e) => ({
        degree: e.degree.trim(),
        ...(e.institution?.trim() ? { institution: e.institution.trim() } : {}),
        ...(e.year?.trim() ? { year: e.year.trim() } : {}),
        ...(e.note?.trim() ? { note: e.note.trim() } : {}),
      }))
      .filter((e) => e.degree);

    const patch = {
      full_name: fullName.trim(),
      headline: headline.trim() || null,
      about: about.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      years_of_experience: years.trim() ? Number(years.trim()) : null,
      practice_areas: practiceAreas,
      courts,
      languages,
      bar_council_state: barCouncil.trim() || null,
      bar_registration_number: enrolmentValue,
      education: cleanEducation,
      bar_memberships: memberships,
      chamber_address: chamber.trim() || null,
      phone: phoneValue,
      date_of_birth: dobValue,
      gender,
      address_line: addressLine.trim() || null,
      pincode: pin || null,
      ...extraOnSave,
    };

    setError(null);
    setIsSaving(true);
    try {
      await updateMyProfile(patch);
      onSaved({ ...profile, ...patch, profile_photo_url: photoUrl });
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }];
  const title = (icon: keyof typeof Ionicons.glyphMap, text: string, note?: string) => (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.titleRow}>
        <Ionicons name={icon} size={20} color={colors.accent} />
        <Text style={[typography.subtitle, { color: colors.brand }]}>{text}</Text>
      </View>
      {note ? <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{note}</Text> : null}
    </View>
  );

  return (
    <View style={{ gap: spacing.md }}>
      {/* Identity */}
      <View style={card}>
        {title("person-circle-outline", "Identity", "How you appear to colleagues on the network.")}
        <Pressable onPress={pickPhoto} style={[styles.photoRow, { gap: spacing.md, marginBottom: spacing.md }]}>
          <View>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={[styles.photo, { backgroundColor: colors.surfaceAlt }]} />
            ) : (
              <View style={[styles.photo, styles.center, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="person" size={32} color={colors.brand} />
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: colors.brand, borderColor: colors.surface }]}>
              {isUploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="camera" size={14} color="#FFFFFF" />}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.brand }]}>{photoUrl ? "Change photo" : "Add a profile photo"}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>A clear, professional headshot works best.</Text>
          </View>
        </Pressable>
        <TextField
          label="Full name *"
          placeholder="e.g. Ramesh Kumar"
          value={fullName}
          onChangeText={setFullName}
          onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
          autoCapitalize="words"
          error={fullNameError ?? undefined}
        />
        <TextField
          label="Professional headline"
          placeholder="e.g. Advocate-on-Record | Commercial Disputes & Arbitration"
          value={headline}
          onChangeText={setHeadline}
        />
        <TextField
          label="About"
          placeholder="e.g. 10+ years practicing civil and property law before the Bombay High Court"
          value={about}
          onChangeText={setAbout}
          multiline
          style={{ minHeight: 88, paddingTop: spacing.sm, textAlignVertical: "top" }}
        />
      </View>

      {/* Practice */}
      <View style={card}>
        {title("scale-outline", "Practice & Jurisdiction")}
        <SelectField
          label="State"
          icon="map-outline"
          placeholder="Select state"
          value={state || null}
          options={STATE_NAMES.map((n) => ({ value: n, label: n }))}
          onChange={chooseState}
          searchable
        />
        <SelectField
          label="City"
          icon="business-outline"
          placeholder={state ? "Select city" : "Select a state first"}
          value={city || null}
          options={cityOptions}
          onChange={chooseCity}
          searchable
          allowCustom
          disabled={!state}
          hint={state ? "Not listed? Search and pick “Use …” to add your town." : undefined}
        />
        <TextField
          label="Years of practice"
          placeholder="e.g. 12"
          value={years}
          onChangeText={setYears}
          onBlur={() => setTouched((t) => ({ ...t, years: true }))}
          keyboardType="number-pad"
          maxLength={2}
          error={yearsError ?? undefined}
        />
        <TagInput
          label="Practice areas"
          values={practiceAreas}
          onChange={setPracticeAreas}
          placeholder="Add a practice area"
          suggestions={PRACTICE_AREA_IDEAS}
        />
        <TagInput
          label="Courts & tribunals (first is your primary court)"
          values={courts}
          onChange={setCourts}
          placeholder="Add a court"
          suggestions={COURT_OPTIONS}
        />
        <TagInput label="Languages" values={languages} onChange={setLanguages} placeholder="Add a language" suggestions={LANGUAGE_IDEAS} />
      </View>

      {/* Credentials */}
      <View style={card}>
        {title("school-outline", "Credentials & Associations", "Your enrolment number stays private.")}
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <SelectField
              label="Bar Council"
              placeholder="Select"
              value={barCouncil || null}
              options={BAR_COUNCILS.map((b) => ({ value: b, label: b }))}
              onChange={setBarCouncil}
              searchable
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Enrolment no."
              placeholder="e.g. MAH/1234/2015"
              value={enrolment}
              onChangeText={setEnrolment}
              onBlur={() => {
                setTouched((t) => ({ ...t, enrolment: true }));
                const tidy = normalizeEnrolment(enrolment);
                if (tidy) setEnrolment(tidy);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              error={enrolError ?? undefined}
            />
          </View>
        </View>

        <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Education</Text>
        {education.map((entry, i) => (
          <View
            key={i}
            style={[styles.eduCard, { borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm }]}
          >
            <View style={styles.eduHeader}>
              <TextInput
                value={entry.degree}
                onChangeText={(v) => updateEducation(i, { degree: v })}
                placeholder="Degree, e.g. LL.M (Commercial Law)"
                placeholderTextColor={colors.textSecondary}
                style={[typography.bodyStrong, { flex: 1, color: colors.textPrimary, paddingVertical: 6 }]}
              />
              <Pressable
                onPress={() => setEducation((list) => list.filter((_, idx) => idx !== i))}
                hitSlop={8}
                accessibilityLabel="Remove qualification"
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
            <TextInput
              value={entry.institution ?? ""}
              onChangeText={(v) => updateEducation(i, { institution: v })}
              placeholder="e.g. Government Law College, Mumbai"
              placeholderTextColor={colors.textSecondary}
              style={[typography.body, { color: colors.textPrimary, paddingVertical: 6 }]}
            />
            <View style={styles.twoCol}>
              <TextInput
                value={entry.year ?? ""}
                onChangeText={(v) => updateEducation(i, { year: v })}
                placeholder="e.g. 2015"
                keyboardType="number-pad"
                maxLength={4}
                placeholderTextColor={colors.textSecondary}
                style={[typography.body, { width: 70, color: colors.textPrimary, paddingVertical: 6 }]}
              />
              <TextInput
                value={entry.note ?? ""}
                onChangeText={(v) => updateEducation(i, { note: v })}
                placeholder="Honours / note (optional)"
                placeholderTextColor={colors.textSecondary}
                style={[typography.body, { flex: 1, color: colors.textPrimary, paddingVertical: 6 }]}
              />
            </View>
          </View>
        ))}
        <Pressable
          onPress={() => setEducation((list) => [...list, { degree: "" }])}
          style={[styles.addRow, { borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md }]}
        >
          <Ionicons name="add" size={18} color={colors.brand} />
          <Text style={[typography.label, { color: colors.brand }]}>Add qualification</Text>
        </Pressable>

        <TagInput
          label="Bar memberships"
          values={memberships}
          onChange={setMemberships}
          placeholder="e.g. Bombay Bar Association – Life Member"
        />
      </View>

      {/* Chambers & contact */}
      <View style={card}>
        {title("home-outline", "Chambers & Contact", "Private — only you can see these.")}
        <TextField
          label="Court chambers / office address"
          placeholder="e.g. Chamber No. 12, District Court Complex, Pune"
          value={chamber}
          onChangeText={setChamber}
          multiline
          style={{ minHeight: 64, paddingTop: spacing.sm, textAlignVertical: "top" }}
        />
        <TextField
          label="Mobile number"
          placeholder="e.g. 98765 43210"
          value={phone}
          onChangeText={setPhone}
          onBlur={() => {
            setTouched((t) => ({ ...t, phone: true }));
            const tidy = normalizeIndianMobile(phone);
            if (tidy) setPhone(tidy);
          }}
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={16}
          error={phoneError ?? undefined}
        />
        <TextField label="Email ID (login)" value={email ?? ""} editable={false} style={{ opacity: 0.6 }} />
      </View>

      {/* Personal */}
      <View style={card}>
        {title("id-card-outline", "Personal Details", "Private — never shown on your public profile.")}
        <DateField label="Date of birth" value={dob} onChange={setDob} maximumDate={new Date()} placeholder="Not added" optional />
        <SelectField<Gender>
          label="Gender"
          icon="person-outline"
          placeholder="Select gender (optional)"
          value={gender}
          options={GENDERS.map((g) => ({ value: g.key, label: g.label }))}
          onChange={setGender}
        />
        <TextField
          label="Home address"
          placeholder="e.g. 12, MG Road, Pune, Maharashtra"
          value={addressLine}
          onChangeText={setAddressLine}
          multiline
          style={{ minHeight: 64, paddingTop: spacing.sm, textAlignVertical: "top" }}
        />
        <SelectField
          label="PIN code"
          icon="location-outline"
          placeholder={city ? "Select PIN code" : "Select your city first (or type a PIN)"}
          value={pincode || null}
          options={pinOptions.map((o) => ({ value: o.pincode, label: o.label }))}
          onChange={choosePincode}
          searchable
          allowCustom
          searchKeyboard="number-pad"
          loading={pinLoading}
          error={pincodeError(pincode) ?? pinWarning}
          hint={city ? `PIN codes in ${city}. Not listed? Type yours in the search box.` : undefined}
        />
      </View>

      {error ? <ErrorNotice message={error} /> : null}

      <Button label={submitLabel} onPress={handleSave} loading={isSaving} pill />
      <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  center: { alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  photoRow: { flexDirection: "row", alignItems: "center" },
  photo: { width: 72, height: 72, borderRadius: 16 },
  cameraBadge: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  twoCol: { flexDirection: "row", gap: 10 },
  eduCard: { borderWidth: 1 },
  eduHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 10,
  },
});
