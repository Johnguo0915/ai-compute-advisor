/**
 * The product entry point deliberately stays at the repository root.
 * The calculator itself is self-contained so that it can also be opened
 * directly from the static build under GitHub Pages.
 */
export default function App() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return (
    <main
      aria-label="AI Compute Advisor"
      style={{ minHeight: "100dvh", background: "#111827" }}
    >
      <iframe
        title="AI Compute Advisor live calculator"
        src={`${import.meta.env.BASE_URL}live-deployment-calculator.html${search}`}
        style={{ display: "block", width: "100%", minHeight: "100dvh", border: 0 }}
      />
    </main>
  );
}
