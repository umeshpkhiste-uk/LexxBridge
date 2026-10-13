import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "./theme";

export { fromDateOnly, toDateOnly } from "@/shared/lib/dateInput";

type Mode = "date" | "time" | "datetime";

type Props = {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  mode?: Mode;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Shows a clear (×) button once a value is picked. */
  optional?: boolean;
  error?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Local date/time formatted for an HTML date/time/datetime-local input's
 * value, min and max attributes (never UTC — see shared/lib/dateInput). */
function toInputValue(value: Date | undefined | null, mode: Mode): string {
  if (!value) return "";
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  if (mode === "date") return date;
  if (mode === "time") return time;
  return `${date}T${time}`;
}

function fromInputValue(raw: string, mode: Mode, previous: Date | null): Date | null {
  if (!raw) return null;
  if (mode === "time") {
    const [h, m] = raw.split(":").map(Number);
    const next = previous ? new Date(previous) : new Date();
    next.setHours(h, m, 0, 0);
    return next;
  }
  const [datePart, timePart] = raw.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const next = new Date(y, mo - 1, d);
  if (timePart) {
    const [h, m] = timePart.split(":").map(Number);
    next.setHours(h, m, 0, 0);
  } else if (previous) {
    next.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
  }
  return next;
}

/** Web build of DateField: the native `<DateTimePicker>` has no web
 * implementation (it renders null there), so this uses the browser's own
 * date/time input instead, styled to match the native field. */
export function DateField({ label, value, onChange, mode = "date", minimumDate, maximumDate, optional, error }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const inputType = mode === "time" ? "time" : mode === "datetime" ? "datetime-local" : "date";

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          {
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <Ionicons name={mode === "time" ? "time-outline" : "calendar-outline"} size={20} color={colors.brand} />
        {/* react-native-web passes unrecognized host elements straight to the DOM */}
        <input
          type={inputType}
          value={toInputValue(value, mode)}
          min={minimumDate ? toInputValue(minimumDate, mode) : undefined}
          max={maximumDate ? toInputValue(maximumDate, mode) : undefined}
          aria-label={label}
          onChange={(e: { target: { value: string } }) => onChange(fromInputValue(e.target.value, mode, value))}
          style={{
            flex: 1,
            minWidth: 0,
            height: 46,
            border: "none",
            outline: "none",
            background: "transparent",
            // react-native-web applies its default Text font only via a CSS
            // class on its own components, not globally — this raw <input>
            // inherits nothing, so without this it falls back to the
            // browser's serif default instead of matching the rest of the app.
            fontFamily: "-apple-system, Helvetica, Arial, sans-serif",
            fontSize: 16,
            color: value ? colors.textPrimary : colors.textSecondary,
          }}
        />
        {optional && value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityLabel={`Clear ${label}`}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: 4 }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderWidth: 1 },
});
