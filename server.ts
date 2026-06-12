import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { execSync, exec } from "child_process";
import os from "os";
import fs from "fs";
import dotenv from "dotenv";
import { promisify } from "util";

dotenv.config({ path: ".env.local" });

const execAsync = promisify(exec);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "127.0.0.1";

  // Set up multer with native OS temp directory
  const upload = multer({ dest: os.tmpdir() });

  // Increase request size limits for large audio uploads
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ limit: "500mb", extended: true }));

  /**
   * Transcribe audio using locally-hosted Whisper (faster-whisper via Python)
   * No API keys needed - fully offline capable
   */
  app.post("/api/transcribe", upload.single("audioFile"), async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);

    let tempFilePath: string | null = null;

    try {
      const { language, action, targetLanguage } = req.body || {};

      const hasUploadedFile = !!req.file;

      if (!hasUploadedFile) {
        return res.status(400).json({ 
          error: "No audio file uploaded or base64 data provided." 
        });
      }

      tempFilePath = req.file!.path;
      const langCode = language === "auto" ? null : language;

      console.log(`🎤 Transcribing audio: ${req.file!.originalname} (${req.file!.size} bytes)`);
      console.log(`📍 Language: ${langCode || "auto-detect"}`);

      // Call Python Whisper transcription script
      let pythonArgs = `"${tempFilePath}"`;
      if (langCode) {
        pythonArgs += ` "${langCode}"`;
      }

      const { stdout, stderr } = await execAsync(
        `python transcribe.py ${pythonArgs}`,
        { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 }
      );

      if (stderr && !stderr.includes("UserWarning")) {
        console.error("Whisper stderr:", stderr);
      }

      // Parse JSON response from Python script
      const result = JSON.parse(stdout);

      if (!result.success) {
        throw new Error(result.error || "Transcription failed");
      }

      console.log(`✅ Transcription complete: ${result.transcript.substring(0, 50)}...`);

      return res.status(200).json({
        ...result,
        isDemo: false,
        success: true,
      });

    } catch (error: any) {
      console.error("❌ Transcription error:", error.message || error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to transcribe audio",
        details: "Ensure the audio file is valid (MP3, WAV, M4A, WebM, OGG). Check that faster-whisper is installed: pip install faster-whisper"
      });
    } finally {
      // Clean up temporary files
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          console.warn("Failed to clean temp file:", e);
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

  app.listen(PORT, HOST, () => {
    console.log(`\n🎙️  WhatsApp Voice Transcriber (Whisper) launched on http://${HOST}:${PORT}`);
    console.log(`✨ Using: OpenAI Whisper (faster-whisper implementation)`);
    console.log(`📦 100% Open-Source • No API Keys Required • Fully Offline\n`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});
