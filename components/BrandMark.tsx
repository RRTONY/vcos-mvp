/** Visual Chief of Staff brand tile - gold "VC" mark used in the top bar and auth pages. */
export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="grid place-items-center font-display font-extrabold text-navy flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        fontSize: Math.round(size * 0.42),
        background: "linear-gradient(145deg, #E9D18F, #C9A24B)",
        boxShadow: "0 4px 10px -2px rgba(0,0,0,.35)",
      }}
    >
      VC
    </div>
  );
}
