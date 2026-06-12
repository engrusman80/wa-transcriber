import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import os from "os";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Set up multer with native OS temp directory for efficient temporary disk buffering
  const upload = multer({ dest: os.tmpdir() });

  // Increase request size limits to handle base64 audio uploads cleanly as a fallback
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));

  // Dynamic initializer for the GoogleGenAI instance supporting real-time key modifications
  function getGeminiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null; // Optional: demo mode will be used
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

  // REST API for transcription supporting both standard file upload (FormData) and Base64 JSON
  app.post("/api/transcribe", upload.single("audioFile"), async (req, res) => {
    // Disable HTTP request & response timeouts to accommodate 5-hour long voice files
    req.setTimeout(0);
    res.setTimeout(0);

    let mediaFileRef: any = null;
    let useFilesApi = false;
    let client: GoogleGenAI | null = null;

    try {
      const { language, action, targetLanguage, audioData, mimeType } = req.body || {};
      
      // Determine if we have an uploaded file or base64 JSON payload
      const hasUploadedFile = !!req.file;
      const hasBase64Data = !!audioData;

      if (!hasUploadedFile && !hasBase64Data) {
        return res.status(400).json({ error: "No audio file uploaded or base64 data provided." });
      }

      // Retrieve Gemini SDK client (optional; demo mode used if absent)
      client = getGeminiClient();
      
      // Always use demo mode (free) - no API quotas
      console.log("Running in FREE DEMO MODE - no API quotas used");
      return res.status(200).json({
        isDemo: true,
        transcript: "Salam! Main thik hoon aur aap? Kaise chal raha hai kaam? Ummeed hai sab theek hai aur aap busy nahi ho.",
        translation: "Hello! I am fine and how are you? How is work going? I hope everything is fine and you are not too busy.",
        detectedLanguage: "Urdu (Roman/Phonetic)",
        romanUrduTranslation: "Salam! Main thik hoon aur aap? Kaise chal raha hai kaam? Ummeed hai sab theek hai aur aap busy nahi ho.",
        summary: "Friendly greeting and casual check-in about work status.",
        sentiment: "Friendly, Warm, Casual",
        success: true,
      });

      // NOTE: Gemini API code commented out - using FREE DEMO MODE only
      // To enable real transcription, uncomment the code below and ensure API quotas are available
    } catch (error: any) {
      console.error("Transcription operation failure:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "An error occurred during audio file processing.",
        details: "Ensure the audio codec is standard (WebM/WAV/MP3/OGG) and the file is not corrupted."
      });
    } finally {
      // Cleanup: delete local temp files
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.error("Failed to clear temp file:", e);
        }
      }
    }
  });

  // Mount Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const HOST = process.env.HOST || "127.0.0.1";
  app.listen(PORT, HOST, () => {
    console.log(`WhatsApp Voice Transcriber Server launched on http://${HOST}:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});
