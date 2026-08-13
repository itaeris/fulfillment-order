import { NextRequest, NextResponse } from "next/server";
import {
  getAllUploadedFiles,
  insertUploadedFile,
  deleteUploadedFile,
  deleteAllUploadedFiles,
} from "@/lib/db";

export async function GET() {
  try {
    const files = await getAllUploadedFiles();

    const formattedFiles = files.map((file: any) => ({
      ...file,
      uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
    }));

    return NextResponse.json({ files: formattedFiles });
  } catch (error) {
    console.error("Error fetching files:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const file = await request.json();
    await insertUploadedFile(file);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving file:", error);
    return NextResponse.json(
      { error: "Failed to save file" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("name");

    if (fileName) {
      await deleteUploadedFile(fileName);
    } else {
      await deleteAllUploadedFiles();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
