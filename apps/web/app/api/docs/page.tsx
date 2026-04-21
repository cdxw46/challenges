import Link from "next/link";

export default function ApiDocsPage() {
  return (
    <div style={{ padding: "40px", fontFamily: "Inter, Helvetica, Arial, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "#534AB7" }}>
          API Docs
        </p>
        <h1 style={{ fontSize: 48, lineHeight: 1, margin: "12px 0 16px" }}>SMURFX OpenAPI</h1>
        <p style={{ maxWidth: 720, color: "#52525B", lineHeight: 1.7 }}>
          Documentacion JSON para integraciones, admin y storefront. La especificacion completa
          esta disponible como recurso consumible en <code>/api/docs/openapi.json</code>.
        </p>
        <div
          style={{
            marginTop: 24,
            padding: 24,
            borderRadius: 24,
            border: "1px solid rgba(83,74,183,0.16)",
            background: "#F8F8FF",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Recursos</h2>
          <ul style={{ lineHeight: 2 }}>
            <li>
              <Link href="/api/docs/openapi.json">Descargar OpenAPI JSON</Link>
            </li>
            <li>
              <Link href="/api/auth/session">Sesion actual</Link>
            </li>
            <li>
              <Link href="/api/cart">Carrito actual</Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
