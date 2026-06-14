"use server";

import { db } from "@/lib/db";

export async function getTranscripts() {
  try {
    const transcripts = await db.transcript.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return transcripts.map(t => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      text: t.text,
      duration: t.duration,
      title: t.title,
    }));
  } catch (error) {
    console.error("Error fetching transcripts from database:", error);
    return [];
  }
}

export async function saveTranscript(text: string, duration: number, title: string) {
  try {
    const transcript = await db.transcript.create({
      data: {
        text,
        duration,
        title: title.trim() || null,
      },
    });
    return {
      id: transcript.id,
      createdAt: transcript.createdAt.toISOString(),
      text: transcript.text,
      duration: transcript.duration,
      title: transcript.title,
    };
  } catch (error: any) {
    console.error("Error saving transcript to database:", error);
    throw new Error(error.message || "Failed to save transcript");
  }
}

export async function deleteTranscript(id: string) {
  try {
    const deleted = await db.transcript.delete({
      where: {
        id,
      },
    });
    return {
      id: deleted.id,
      createdAt: deleted.createdAt.toISOString(),
      text: deleted.text,
      duration: deleted.duration,
      title: deleted.title,
    };
  } catch (error: any) {
    console.error("Error deleting transcript from database:", error);
    throw new Error(error.message || "Failed to delete transcript");
  }
}
