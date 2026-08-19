import { NextRequest, NextResponse } from "next/server";
import { getAllOverviewFiles, insertOverviewFile } from "@/lib/db";

export async function GET() {
  try {
    const files = await getAllOverviewFiles();
    const formattedFiles = files.map((file: any) => ({
      ...file,
      uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
    }));
    return NextResponse.json({ files: formattedFiles });
  } catch (error) {
    console.error("Error fetching overview files:", error);
    return NextResponse.json(
      { error: "Failed to fetch overview files" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const file = await request.json();
    await insertOverviewFile({
      name: file.name,
      platform: file.platform,
      orderCount: file.orderCount,
      uploadedAt: file.uploadedAt,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving overview file:", error);
    return NextResponse.json(
      { error: "Failed to save overview file" },
      { status: 500 }
    );
  }
}
