import Svg, { G, Line, Path } from "react-native-svg";

/** A slanted pushpin (point down-left) for pinned chats, drawn to match the
 * app's outline icon style. `filled` marks something that is pinned; `off`
 * adds a slash for the "Unpin" action. */
export function PinIcon({
  size = 16,
  color,
  filled = false,
  off = false,
  cutoutColor,
}: {
  size?: number;
  color: string;
  filled?: boolean;
  off?: boolean;
  /** The background behind the icon, so the "off" slash cuts cleanly through the pin. */
  cutoutColor?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G rotation={45} origin="12, 12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Line x1={12} y1={17} x2={12} y2={22} />
        <Path
          d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"
          fill={filled ? color : "none"}
        />
      </G>
      {off ? (
        <>
          {cutoutColor ? <Line x1={3} y1={3} x2={21} y2={21} stroke={cutoutColor} strokeWidth={5} strokeLinecap="round" /> : null}
          <Line x1={3} y1={3} x2={21} y2={21} stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : null}
    </Svg>
  );
}
