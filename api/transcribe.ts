import { IncomingMessage } from "http";
import { GoogleGenAI } from "@google/genai";
import formidable from "formidable";
import fs from "fs";
import os from "os";

const parseForm = (req: IncomingMessage) => {
  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    const form = formidable({
      uploadDir: os.tmpdir(),
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024 * 1024, // 10 GB
      allowEmptyFiles: false,
      multiples: false,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        resolve({ fields, files });
      }
    });
  });
};

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Please add it to your Vercel Environment Variables.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function sendJson(res: any, statusCode: number, payload: any) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  let tempFilePath: string | undefined;
  try {
    const { fields, files } = await parseForm(req);
    const { language, action, targetLanguage } = fields || {};

    const uploadedFile = files?.audioFile as formidable.File | undefined;
    const tempFilePath = uploadedFile?.filepath;
    const hasUploadedFile = !!uploadedFile && uploadedFile.size > 0;

    if (!hasUploadedFile) {
      return sendJson(res, 400, { error: "No audio file uploaded." });
    }

    let client;
    try {
      client = createGeminiClient();
    } catch (error: any) {
      return sendJson(res, 200, {
        isDemo: true,
        transcript: "[DEMO MODE] Audio upload received. Configure GEMINI_API_KEY in Vercel Environment Variables to enable live transcription.",
        translation: "Please set your Gemini API key to enable live transcription and translation.",
        detectedLanguage: "Unknown",
        summary: "Demo response served because the Gemini API key is not configured.",
        sentiment: "Neutral",
        success: true,
      });
    }

    const systemPrompt = [
      "You are an advanced voice transcription assistant.",
      "1. Transcribe the attached audio file with accurate punctuation, capitalization, and speaker clarity.",
      "2. Detect the spoken language.",
      action === "translate" && targetLanguage
        ? `3. Provide a natural and highly accurate translation of the transcript into ${targetLanguage}.`
        : "3. Provide a natural English translation if the message is in a non-English language.",
      "4. If the source language is Urdu or Hindi, provide a phonetic Roman Urdu translation in the 'romanUrduTranslation' field.",
      "5. Provide a 1-sentence quick summary of the main points in the voice note.",
      "6. Detect the speaker sentiment.",
      "Return the result as a strictly valid JSON object with fields: transcript, detectedLanguage, translation, romanUrduTranslation, summary, sentiment.",
    ]
      .filter(Boolean)
      .join("\n");

    const mediaFileRef = await client.files.upload({
      file: uploadedFile.filepath,
      config: {
        mimeType: uploadedFile.mimetype || "audio/webm",
      },
    });

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          parts: [
            mediaFileRef,
            { text: systemPrompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    let parsedResult: any = {};
    if (response.text) {
      parsedResult = JSON.parse(response.text);
    }

    sendJson(res, 200, { ...parsedResult, isDemo: false, success: true });

    if (mediaFileRef?.name) {
      try {
        await client.files.delete({ name: mediaFileRef.name });
      } catch {
        // ignore cleanup failure
      }
    }
  } catch (error: any) {
    console.error("/api/transcribe error:", error);
    sendJson(res, 500, {
      success: false,
      error: error.message || "Internal server error.",
      details: "Ensure the audio file is valid and the Gemini API key is configured.",
    });
  } finally {
    // Clean up uploaded temp files if any
    try {
      if (typeof tempFilePath === "string" && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {
      // ignore cleanup failure
    }
  }
}
