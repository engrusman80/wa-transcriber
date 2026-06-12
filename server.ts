import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import os from "os";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up multer with native OS temp directory for efficient temporary disk buffering
  const upload = multer({ dest: os.tmpdir() });

  // Increase request size limits to handle base64 audio uploads cleanly as a fallback
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));

  // Dynamic initializer for the GoogleGenAI instance supporting real-time key modifications
  function getGeminiClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please add it to your secrets in Settings > Secrets.");
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
      const { language, action, targetLanguage, audioData, mimeType, fileName } = req.body || {};
      
      // Convert base64 data to a temporary file structure if provided, mimicking standard multipart file upload
      if (audioData && !req.file) {
        try {
          const cleanBase64 = audioData.includes(";base64,") ? audioData.split(";base64,")[1] : audioData;
          const buffer = Buffer.from(cleanBase64, "base64");
          const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_temp`);
          fs.writeFileSync(tempFilePath, buffer);
          
          req.file = {
            path: tempFilePath,
            size: buffer.length,
            originalname: fileName || "audio.webm",
            mimetype: mimeType || "audio/webm",
          } as any;
          console.log(`Bypassed upload stream constraints: decoded base64 successfully into a temp local file of ${buffer.length} bytes.`);
        } catch (convErr: any) {
          console.error("Failed to parse base64 audio data input:", convErr);
          return res.status(400).json({ error: `Invalid audio data input stream: ${convErr.message}` });
        }
      }

      // Determine if we have an uploaded file or base64 JSON payload
      const hasUploadedFile = !!req.file;
      const hasBase64Data = !!audioData;

      if (!hasUploadedFile && !hasBase64Data) {
        return res.status(400).json({ error: "No audio file uploaded or base64 data provided." });
      }

      // Retrieve Gemini SDK client
      try {
        client = getGeminiClient();
      } catch (err: any) {
        console.warn("Gemini Client initialization failed, serving simulated demo response:", err.message);
        return res.status(200).json({
          isDemo: true,
          transcript: `[DEMO MODE] Suna hai aapne voice recording upload ki hai! (Please configure your key in Settings > Secrets to enable live AI transcription and translation of this actual audio file.)`,
          translation: "I heard that you uploaded a voice recording! Please configure your API key to activate live translations.",
          detectedLanguage: "Urdu/Hindi (Romanized)",
          summary: "Voice note received under demo parameters pending system key configuration.",
          sentiment: "Warm Advice",
          success: true,
        });
      }

      // Assemble system-level prompt guidelines
      let promptText = "You are an advanced voice transcription assistant.\n";
      promptText += "1. Transcribe the attached audio file with accurate punctuation, capitalization, and speaker clarity.\n";
      promptText += `2. Detect the spoken language. Let us know what language was detected.\n`;
      
      if (action === "translate" && targetLanguage) {
        promptText += `3. Provide a natural and highly accurate translation of the transcript into ${targetLanguage}.\n`;
        if (targetLanguage.toLowerCase().includes("roman") || targetLanguage.toLowerCase().includes("urdu")) {
          promptText += "NOTE: For Roman Urdu, write the Urdu language phonetically using English/Latin alphabets (similar to text messaging style like 'Aap kaise hain? Subha ki meeting final ho gayi hai').\n";
        }
      } else {
        promptText += "3. Provide a natural English translation if the message is in Urdu, Spanish, Hindi, or any other non-English language.\n";
      }

      promptText += "4. If the source language is Urdu (Script) or Hindi, provide a phonetic Roman Urdu translation in the 'romanUrduTranslation' field (e.g. written in Latin script like 'Salam! Main thik hoon'). Otherwise, translate the content into Roman Urdu in that field.\n";
      promptText += "5. Provide a 1-sentence quick summary of the main points in the voice note.\n";
      promptText += "6. Detect the speaker sentiment (e.g., Happy, Calm, Hurried, Anxious, Angry).\n";
      promptText += "Please return the output as a valid JSON object matching the following fields exactly so we can display it cleanly in our UI:\n";
      promptText += "{\n";
      promptText += "  \"transcript\": \"...\",\n";
      promptText += "  \"detectedLanguage\": \"...\",\n";
      promptText += "  \"translation\": \"...\",\n";
      promptText += "  \"romanUrduTranslation\": \"...\",\n";
      promptText += "  \"summary\": \"...\",\n";
      promptText += "  \"sentiment\": \"...\"\n";
      promptText += "}";

      let contentParts: any[] = [];

      if (hasUploadedFile && req.file) {
        // Handle large files seamlessly using Gemini's native Files API
        useFilesApi = true;
        console.log(`Uploading heavy audio stream to Gemini Files API (${req.file.size} bytes)...`);
        
        // Resolve target mimeType accurately, ensuring MPEG codec mapping matches
        const originalName = req.file.originalname || "";
        const extension = path.extname(originalName).toLowerCase();
        let resolvedMimeType = req.file.mimetype || "audio/webm";

        if (
          !resolvedMimeType || 
          resolvedMimeType === "application/octet-stream" || 
          extension === ".mpeg" || 
          extension === ".mpg" || 
          extension === ".mp3"
        ) {
          if (extension === ".mpeg" || extension === ".mpg") {
            resolvedMimeType = "audio/mpeg";
          } else if (extension === ".mp3") {
            resolvedMimeType = "audio/mp3";
          } else if (extension === ".wav") {
            resolvedMimeType = "audio/wav";
          } else if (extension === ".ogg") {
            resolvedMimeType = "audio/ogg";
          } else if (extension === ".m4a") {
            resolvedMimeType = "audio/m4a";
          } else if (extension === ".mp4") {
            resolvedMimeType = "video/mp4";
          } else if (extension === ".webm") {
            resolvedMimeType = "audio/webm";
          }
        }
        
        mediaFileRef = await client.files.upload({
          file: req.file.path,
          config: {
            mimeType: resolvedMimeType,
          }
        });

        console.log(`Gemini Files API upload completed. File URI: ${mediaFileRef.uri}. Waiting for ACTIVE state...`);
        
        let fileStatus = await client.files.get({ name: mediaFileRef.name });
        let attempts = 0;
        while (fileStatus.state === "PROCESSING" && attempts < 30) {
          console.log(`[Attempt ${attempts + 1}/30] File state: ${fileStatus.state}. Waiting 2 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          fileStatus = await client.files.get({ name: mediaFileRef.name });
          attempts++;
        }

        console.log(`Final file state: ${fileStatus.state}`);
        if (fileStatus.state !== "ACTIVE") {
          throw new Error(`File processing failed or timed out with final state: ${fileStatus.state}`);
        }

        contentParts.push({
          fileData: {
            fileUri: mediaFileRef.uri,
            mimeType: mediaFileRef.mimeType || resolvedMimeType,
          }
        });
      } else {
        // Standardize mimetype for base64 inline body fallback
        const mediaMimeType = mimeType || "audio/webm";
        let cleanBase64 = audioData;
        if (audioData.includes(";base64,")) {
          cleanBase64 = audioData.split(";base64,")[1];
        }
        contentParts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: mediaMimeType,
          },
        });
      }

      // Add the system configuration prompt
      contentParts.push({ text: promptText });

      // Run structured voice annotation in a single robust execution turn
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            parts: contentParts,
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const resultText = response.text;
      if (!resultText) {
        throw new Error("Empty response received from Gemini model.");
      }

      // Send cleanly parsed results back to client
      let cleanText = resultText.trim();
      const firstBrace = cleanText.indexOf("{");
      const lastBrace = cleanText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
      const resultObj = JSON.parse(cleanText);
      return res.status(200).json({
        ...resultObj,
        isDemo: false,
        success: true,
      });

    } catch (error: any) {
      console.error("Transcription operation failure:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "An error occurred during audio file processing.",
        details: "Ensure the audio codec is standard (WebM/WAV/MP3/OGG) and the file is not corrupted."
      });
    } finally {
      // 1. Always purge local temporary disk files from the OS storage pool immediately
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.error("Failed to clear local uploaded temp storage file:", e);
        }
      }

      // 2. Always delete remote file references from Google Gemini storage after generation completes
      if (mediaFileRef && useFilesApi && client) {
        try {
          await client.files.delete({ name: mediaFileRef.name });
          console.log(`Pruned remote file ${mediaFileRef.name} from Gemini infrastructure.`);
        } catch (e) {
          console.error("Failed to delete remote file from Gemini infrastructure:", e);
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`WhatsApp Voice Transcriber Server launched on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});
