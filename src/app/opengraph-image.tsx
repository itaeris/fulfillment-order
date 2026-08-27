import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Order Dashboard — From This Island";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadPoppins() {
  const res = await fetch(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-SemiBold.ttf"
  );
  if (!res.ok) {
    throw new Error(`Gagal unduh Poppins (${res.status})`);
  }
  return res.arrayBuffer();
}

export default async function OpenGraphImage() {
  const [fontData, logoData] = await Promise.all([
    loadPoppins(),
    readFile(join(process.cwd(), "public/logo/FTI_Logogram_White.png")),
  ]);

  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #5C2E1E 0%, #3D2319 48%, #2C1810 100%)",
          position: "relative",
          fontFamily: "Poppins",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -90,
            top: 20,
            width: 420,
            height: 420,
            borderRadius: 999,
            background: "rgba(122, 66, 50, 0.5)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -80,
            bottom: -70,
            width: 460,
            height: 460,
            borderRadius: 999,
            background: "rgba(168, 145, 126, 0.22)",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            zIndex: 1,
          }}
        >
          <img src={logoSrc} width={108} height={108} alt="" />
          <div
            style={{
              marginTop: 20,
              color: "rgba(251, 248, 245, 0.72)",
              fontSize: 18,
              letterSpacing: 7,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            From This Island
          </div>
          <div
            style={{
              marginTop: 8,
              color: "rgba(251, 248, 245, 0.42)",
              fontSize: 14,
              letterSpacing: 5,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            Order Dashboard
          </div>
          <div
            style={{
              marginTop: 40,
              color: "#FBF8F5",
              fontSize: 58,
              fontWeight: 600,
              lineHeight: 1.15,
              textAlign: "center",
              display: "flex",
            }}
          >
            Your fulfillment workspace.
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 42,
            color: "rgba(251, 248, 245, 0.45)",
            fontSize: 16,
            display: "flex",
          }}
        >
          From This Island
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Poppins", data: fontData, style: "normal", weight: 600 }],
    }
  );
}
