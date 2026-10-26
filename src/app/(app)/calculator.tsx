import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/shared/ui/theme";

// Fixed (not width-derived off aspectRatio) so the keypad's total height is
// bounded and never pushes the display off-screen on a wide viewport.
const KEY_HEIGHT = 72;

type Operator = "+" | "−" | "×" | "÷";

function compute(a: number, b: number, op: Operator): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
  }
}

const DECIMAL_PLACES = 4;

/** Formats for display: at most 4 decimal places (trailing zeros trimmed so
 * whole numbers stay whole), caps length so it never overflows the screen. */
function formatValue(value: number): string {
  if (Number.isNaN(value)) return "Error";
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 10 ** DECIMAL_PLACES) / 10 ** DECIMAL_PLACES;
  let str = rounded.toFixed(DECIMAL_PLACES);
  if (str.includes(".")) str = str.replace(/0+$/, "").replace(/\.$/, "");
  return str.length > 14 ? rounded.toExponential(DECIMAL_PLACES) : str;
}

type ButtonSpec = { label: string; kind: "digit" | "op" | "action" | "equals"; span?: 2 };

const KEYPAD: ButtonSpec[][] = [
  [
    { label: "AC", kind: "action" },
    { label: "+/−", kind: "action" },
    { label: "%", kind: "action" },
    { label: "÷", kind: "op" },
  ],
  [
    { label: "7", kind: "digit" },
    { label: "8", kind: "digit" },
    { label: "9", kind: "digit" },
    { label: "×", kind: "op" },
  ],
  [
    { label: "4", kind: "digit" },
    { label: "5", kind: "digit" },
    { label: "6", kind: "digit" },
    { label: "−", kind: "op" },
  ],
  [
    { label: "1", kind: "digit" },
    { label: "2", kind: "digit" },
    { label: "3", kind: "digit" },
    { label: "+", kind: "op" },
  ],
  [
    { label: "0", kind: "digit", span: 2 },
    { label: ".", kind: "digit" },
    { label: "=", kind: "equals" },
  ],
];

/** Plain general-purpose calculator, styled to the app's theme. Local-only — no backend. */
export default function CalculatorScreen() {
  const { colors, spacing, radius, typography } = useTheme();

  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Operator | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [expression, setExpression] = useState("");

  const inputDigit = (digit: string) => {
    if (overwrite) {
      // No pending operator means this digit starts a brand-new number —
      // after "=" (or on a fresh calculator) the old "a + b =" line above
      // must clear, or it's left stuck next to an unrelated new number.
      if (pendingOp === null) setExpression("");
      setDisplay(digit === "." ? "0." : digit);
      setOverwrite(false);
      return;
    }
    if (digit === "." && display.includes(".")) return;
    setDisplay((prev) => (prev === "0" && digit !== "." ? digit : prev + digit));
  };

  const applyOperator = (op: Operator) => {
    const current = Number(display);
    if (stored !== null && pendingOp && !overwrite) {
      const result = compute(stored, current, pendingOp);
      setStored(result);
      setDisplay(formatValue(result));
      setExpression(`${formatValue(result)} ${op}`);
    } else {
      setStored(current);
      setExpression(`${display} ${op}`);
    }
    setPendingOp(op);
    setOverwrite(true);
  };

  const equals = () => {
    if (stored === null || pendingOp === null) return;
    const current = Number(display);
    const result = compute(stored, current, pendingOp);
    setExpression(`${expression} ${display} =`);
    setDisplay(formatValue(result));
    setStored(null);
    setPendingOp(null);
    setOverwrite(true);
  };

  const clear = () => {
    setDisplay("0");
    setStored(null);
    setPendingOp(null);
    setOverwrite(true);
    setExpression("");
  };

  const toggleSign = () => setDisplay((prev) => (prev.startsWith("-") ? prev.slice(1) : prev === "0" ? prev : `-${prev}`));
  const percent = () => setDisplay(formatValue(Number(display) / 100));

  /** Removes the last entered digit — fixes a wrong tap without clearing the whole entry. */
  const backspace = () => {
    if (overwrite) return;
    setDisplay((prev) => {
      const next = prev.length > 1 ? prev.slice(0, -1) : "0";
      return next === "-" ? "0" : next;
    });
  };

  const onPress = (key: ButtonSpec) => {
    if (key.kind === "digit") return inputDigit(key.label);
    if (key.kind === "op") return applyOperator(key.label as Operator);
    if (key.kind === "equals") return equals();
    if (key.label === "AC") return clear();
    if (key.label === "+/−") return toggleSign();
    if (key.label === "%") return percent();
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["bottom"]}>
      <View style={[styles.display, { paddingHorizontal: spacing.lg }]}>
        <View style={styles.displayTopRow}>
          <Text numberOfLines={1} style={[typography.body, { flex: 1, textAlign: "right", color: colors.textSecondary, minHeight: 22 }]}>
            {expression}
          </Text>
          <Pressable
            onPress={backspace}
            disabled={overwrite}
            hitSlop={10}
            accessibilityLabel="Delete last digit"
            style={{ marginLeft: spacing.sm, opacity: overwrite ? 0.35 : 1 }}
          >
            <Ionicons name="backspace-outline" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[typography.display, { color: colors.textPrimary, fontSize: 56, lineHeight: 64 }]}
        >
          {display}
        </Text>
      </View>

      <View style={[styles.keypad, { padding: spacing.md, paddingBottom: spacing.xl }]}>
        {KEYPAD.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.row, { height: KEY_HEIGHT, gap: spacing.sm, marginBottom: spacing.sm }]}>
            {row.map((key) => {
              const isEquals = key.kind === "equals";
              const isOp = key.kind === "op";
              const isAction = key.kind === "action";
              const bg = isEquals || isOp ? colors.brand : isAction ? colors.surfaceAlt : colors.surface;
              const fg = isEquals || isOp ? colors.textInverse : isAction ? colors.brand : colors.textPrimary;

              return (
                <Pressable
                  key={key.label}
                  onPress={() => onPress(key)}
                  style={({ pressed }) => [
                    styles.key,
                    key.span === 2 && styles.keyWide,
                    {
                      backgroundColor: bg,
                      borderRadius: radius.lg,
                      borderWidth: isAction || key.kind === "digit" ? StyleSheet.hairlineWidth * 2 : 0,
                      borderColor: colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={[typography.title, { color: fg }]}>{key.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  display: { flex: 1, alignItems: "flex-end", justifyContent: "flex-end" },
  displayTopRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  keypad: {},
  row: { flexDirection: "row" },
  key: { flex: 1, alignItems: "center", justifyContent: "center" },
  keyWide: { flex: 2.08 },
});
