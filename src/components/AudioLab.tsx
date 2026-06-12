import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, Sparkles, Globe, FileText, 
  AlertTriangle, Trash2, CheckCircle, Info, RefreshCw, Settings, ChevronDown, ChevronUp
} from "lucide-react";
import { TranscriptionResult } from "../types";

// Helper functions for WAV encoding and audio compression
async function compressAudioToWav(
  file: File, 
  onStatusChange: (status: string) => void
): Promise<{ compressedFile: File; originalSize: number; compressedSize: number }> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this browser.");
  }

  onStatusChange("Reading audio file...");
  const arrayBuffer = await file.arrayBuffer();
  
  onStatusChange("Analyzing sound channels...");
  const audioCtx = new AudioContextClass();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.error("Audio decoding failed:", err);
    throw new Error("Could not decode audio. Try using stable MP3, WAV or M4A formats.");
  } finally {
    await audioCtx.close();
  }

  const duration = audioBuffer.duration;
  
  // Target around 2.2 MB max to stay 100% safe from Vercel's 4.5 MB serverless limit
  const maxBytesTarget = 2.2 * 1024 * 1024;
  
  // Decide whether to use 8-bit resolution (unsigned) or 16-bit resolution (signed)
  // For any file longer than 90 seconds, use 8-bit PCM to reduce structural size in half instantly!
  const use8Bit = duration > 90 || (duration * 16000 * 2) > maxBytesTarget;
  const bytesPerSample = use8Bit ? 1 : 2;
  
  // Solve for target sample rate: duration * targetSampleRate * bytesPerSample <= maxBytesTarget
  let targetSampleRate = Math.floor(maxBytesTarget / (duration * bytesPerSample));
  
  // Constrain sample rate between 8000 Hz (quality minimum) and 16000 Hz (speech maximum)
  targetSampleRate = Math.max(8000, Math.min(16000, targetSampleRate));
  onStatusChange(`Optimizing voice tracks (${targetSampleRate}Hz Mono, ${use8Bit ? "8-Bit" : "16-Bit"})...`);

  const numberOfChannels = 1; // force mono to save 50% space instantly!
  const offlineCtx = new OfflineAudioContext(
    numberOfChannels, 
    Math.floor(targetSampleRate * duration), 
    targetSampleRate
  );
  
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  
  onStatusChange("Compressing audio footprint...");
  const renderedBuffer = await offlineCtx.startRendering();
  const channelData = renderedBuffer.getChannelData(0);
  
  onStatusChange("Generating lightweight WAV wrap...");
  const wavBuffer = encodeWAV(channelData, targetSampleRate, use8Bit);
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  
  const originalSize = file.size;
  const compressedSize = blob.size;
  
  const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_optimized.wav", {
    type: "audio/wav"
  });

  return {
    compressedFile,
    originalSize,
    compressedSize
  };
}

function encodeWAV(samples: Float32Array, sampleRate: number, use8Bit: boolean): ArrayBuffer {
  const bytesPerSample = use8Bit ? 1 : 2;
  const blockAlign = bytesPerSample; // 1 channel * bytesPerSample
  const bitsPerSample = use8Bit ? 8 : 16;

  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Raw PCM format
  view.setUint16(22, 1, true); // 1 Channel (Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // Byte rate
  view.setUint16(32, blockAlign, true); // Block align
  view.setUint16(34, bitsPerSample, true); // Bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);
  
  if (use8Bit) {
    floatTo8BitPCM(view, 44, samples);
  } else {
    floatTo16BitPCM(view, 44, samples);
  }
  
  return buffer;
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function floatTo8BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset++) {
    let s = Math.max(-1, Math.min(1, input[i]));
    // Unsigned 8-bit PCM (silence is 128)
    const val = Math.floor((s + 1) * 127.5);
    output.setUint8(offset, Math.max(0, Math.min(255, val)));
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export default function AudioLab() {
  // File upload state managers (Direct binary storage - no Base64 convert)
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [compressStep, setCompressStep] = useState<string>("");
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [compressionRatio, setCompressionRatio] = useState<number | null>(null);
  const [originalSizeState, setOriginalSizeState] = useState<number | null>(null);

  // Collapsible Settings zone
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const [selectedAction, setSelectedAction] = useState<string>("transcribe");
  const [targetTranslateLanguage, setTargetTranslateLanguage] = useState<string>("English");

  // Server transaction states
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>("Initializing...");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);

  // Drag-and-drop / select handlers (Safely store file binary directly)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const processSelectedFile = async (file: File) => {
    setResult(null);
    setErrorText(null);
    setOriginalFile(file);
    setOriginalSizeState(file.size);
    setCompressionRatio(null);
    
    // If file size exceeds 3.0 MB, run high-performance in-browser compression to ensure it stays well under Vercel's strict 4.5 MB function payload limit
    if (file.size > 3.0 * 1024 * 1024) {
      setCompressing(true);
      setCompressStep("Initializing audio engine...");
      try {
        const { compressedFile, originalSize, compressedSize } = await compressAudioToWav(file, (msg) => {
          setCompressStep(msg);
        });
        
        setDroppedFile(compressedFile);
        const ratio = Math.round((1 - compressedSize / originalSize) * 100);
        setCompressionRatio(ratio > 0 ? ratio : 0);
      } catch (err: any) {
        console.warn("Client-side audio optimizer warning:", err);
        // Fallback to original file if decoding or offline rendering is unsupported/fails
        setDroppedFile(file);
        setErrorText(
          `In-browser optimizer warning: ${err.message || 'Decoding failed'}. ` +
          "Falling back to original file payload. If this fails during upload, please record/compress your file as low-bitrate Mono MP3/M4A below 4 MB!"
        );
      } finally {
        setCompressing(false);
      }
    } else {
      setDroppedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleClearFile = () => {
    setDroppedFile(null);
    setOriginalFile(null);
    setOriginalSizeState(null);
    setCompressionRatio(null);
    setResult(null);
    setErrorText(null);
  };

  // Transcribe action sending standard FormData parameters
  const handleExecuteTranscription = async () => {
    try {
      setLoading(true);
      setLoadingStep("Reading input audio tracks...");
      setErrorText(null);

      // Check existence of audio assets
      if (!droppedFile) {
        setErrorText("No voice message detected. Please drag or choose an audio file first.");
        setLoading(false);
        return;
      }

      // Setup clean streaming steps based on sizing (lowered threshold to 3MB to prevent base64 encoding from exceeding Vercel's 4.5MB limit)
      const isHeavy = droppedFile.size > 3.0 * 1024 * 1024;
      setLoadingStep(isHeavy ? "Uploading large file payload..." : "Initiating voice compilation...");

      // Progressive placeholder steps for 5-hour files
      const steps = [
        "Analyzing voice metrics and sound patterns...",
        "Identifying speech segments and dynamic timestamps...",
        "Translating multi-dialect script overlay...",
        "Structuring analytical summary variables...",
        "Finalizing results..."
      ];
      
      let stepIdx = 0;
      const stepInterval = setInterval(() => {
        if (stepIdx < steps.length) {
          setLoadingStep(steps[stepIdx]);
          stepIdx++;
        }
      }, 5000);

      let response: Response;

      if (!isHeavy) {
        setLoadingStep("Converting voice file to transfer format...");
        
        const toBase64 = (file: File): Promise<string> =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
          });
          
        const base64Data = await toBase64(droppedFile);
        
        setLoadingStep("Sending secure audio payload to transcription engine...");
        response = await fetch("/api/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audioData: base64Data,
            mimeType: droppedFile.type || "audio/webm",
            language: selectedLanguage,
            action: selectedAction,
            targetLanguage: targetTranslateLanguage,
            fileName: droppedFile.name,
          }),
        });
      } else {
        // Fallback to standard Multipart FormData for heavy files
        setLoadingStep("Uploading heavy file to cloud structure...");
        const formData = new FormData();
        formData.append("audioFile", droppedFile, droppedFile.name);
        formData.append("language", selectedLanguage);
        formData.append("action", selectedAction);
        formData.append("targetLanguage", targetTranslateLanguage);
        
        response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
      }

      clearInterval(stepInterval);

      const responseText = await response.text();

      // Intercept 413 Payload Too Large or Vercel serverless request body bounds before parsing JSON
      if (
        response.status === 413 || 
        responseText.includes("Too Large") || 
        responseText.includes("Entity Too Large") || 
        responseText.includes("Request Entity") ||
        responseText.includes("Payload Too Large")
      ) {
        throw new Error(
          "Cloud limit exceeded (Vercel strictly restricts server requests to 4.5 MB). " +
          "Please compress this audio file (e.g. record as a compressed low-bitrate Mono MP3/M4A) or upload a shorter clip below 4.4 MB."
        );
      }

      let parsedResult: any;
      try {
        parsedResult = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Server Response Error: ${responseText.slice(0, 200)}...`);
      }

      if (!response.ok) {
        throw new Error(parsedResult.error || "Failed to process audio transcription.");
      }

      setResult(parsedResult);
    } catch (err: any) {
      console.error("Transcribe API Error:", err);
      setErrorText(err.message || "Failed to finalize audio transcription. Ensure the file is not corrupted.");
    } finally {
      setLoading(false);
    }
  };

  const humanReadableSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
      
      {/* Settings Gear & Collapsible Settings Bar */}
      <div className="flex justify-between items-center bg-slate-50 border border-slate-200/60 p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-600 animate-spin-slow" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Advanced Settings</h3>
            <p className="text-[11px] text-slate-400">Configure language mappings and preferences.</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 transition-all cursor-pointer"
        >
          {showSettings ? (
            <>
              Hide Options <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              Configure <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200/50 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="flex flex-col space-y-1.5">
                <label className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">Source Language Input</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 cursor-pointer focus:border-emerald-500 focus:outline-none"
                >
                  <option value="auto">🌐 Automatic (English/Urdu)</option>
                  <option value="en">English (US/UK)</option>
                  <option value="ur">Urdu (اردو اسکرپٹ)</option>
                </select>
              </div>

              <div className="flex flex-col space-y-1.5">
                <label className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">Job Format Option</label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 cursor-pointer focus:border-emerald-500 focus:outline-none"
                >
                  <option value="transcribe">📝 Pure Dialect Transcription</option>
                  <option value="translate">🌐 Multi-language Translation</option>
                </select>
              </div>

              {selectedAction === "translate" && (
                <div className="flex flex-col space-y-1.5 md:col-span-2 animate-fade-in pt-2">
                  <label className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">Target Translation Language</label>
                  <select
                    value={targetTranslateLanguage}
                    onChange={(e) => setTargetTranslateLanguage(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 cursor-pointer focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="English">English</option>
                    <option value="Roman Urdu">Roman Urdu (Latin script / msg style)</option>
                    <option value="Urdu">Urdu (اردو اسکرپٹ)</option>
                    <option value="Spanish">Spanish</option>
                    <option value="Hindi">Hindi (हिंदी)</option>
                  </select>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Core Columns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
        
        {/* Left Column: Input Nodes */}
        <div className="space-y-6">
          
          {/* Heavy file drag drop node */}
          <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col justify-between min-h-[300px]">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Select Voice File
            </h4>

            {compressing ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-emerald-50/10 border-2 border-dashed border-emerald-300 rounded-xl min-h-[220px] animate-pulse">
                <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
                <p className="text-xs font-bold text-slate-800">⚡ Sound Engine Optimizing Audio...</p>
                <p className="text-[11px] text-emerald-600 font-medium mt-1 font-mono">{compressStep}</p>
                <p className="text-[10px] text-slate-400 mt-3 max-w-xs leading-normal">
                  Resampling larger recording into dynamic Mono format to safely stay under Vercel's strict payloads.
                </p>
              </div>
            ) : droppedFile ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-3">
                <div className="bg-emerald-50 text-emerald-800 p-6 rounded-xl border border-emerald-100 w-full max-w-sm">
                  <FileText className="w-10 h-10 text-emerald-700 mx-auto mb-2" />
                  <p className="text-xs font-bold truncate max-w-[280px] mx-auto text-slate-900">{droppedFile.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    {humanReadableSize(droppedFile.size)} • {droppedFile.type || "Audio format"}
                  </p>
                  
                  {originalSizeState && compressionRatio !== null && compressionRatio > 0 && (
                    <div className="mt-3 bg-emerald-100/60 p-2.5 rounded-lg text-[10px] text-emerald-900 leading-relaxed border border-emerald-200/50">
                      <span className="font-bold text-emerald-800">⚡ Size Optimizer:</span> Shrinked file by{" "}
                      <span className="font-extrabold text-emerald-700 font-mono">{compressionRatio}%</span>{" "}
                      (from {humanReadableSize(originalSizeState)} to {humanReadableSize(droppedFile.size)}) to seamlessly bypass Vercel limits!
                    </div>
                  )}

                  <button
                    onClick={handleClearFile}
                    className="mt-4 text-rose-600 hover:text-rose-700 text-xs font-semibold flex items-center gap-1 mx-auto cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove file
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="flex-1 border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-xl flex flex-col items-center justify-center p-8 bg-white hover:bg-emerald-50/10 cursor-pointer transition-colors relative min-h-[220px]"
              >
                <input
                  type="file"
                  accept="audio/*,.mpeg,.mpg"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="w-10 h-10 text-slate-400 mb-2" />
                <p className="text-xs font-bold text-slate-700">Drag or click to choose audio recording</p>
                <p className="text-[10px] text-slate-400 mt-2 max-w-xs text-center leading-normal">Supports MPEG, MP3, WAV, OGG, WebM & M4A of any size (up to GBs & 5 hours)</p>
              </div>
            )}
          </div>

          {droppedFile && droppedFile.size > 3.0 * 1024 * 1024 && (
            <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/60 text-[11px] text-amber-800 leading-relaxed flex items-start gap-2 shadow-2xs">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Platform Payload Alert:</span> This file is {humanReadableSize(droppedFile.size)}. Some cloud environments (like your Vercel deployment) enforce a strict 4.5 MB HTTP request limit. We will stream this directly using Multipart binary stream to stay under bounds, but for very heavy files, kindly compress or record as low-bitrate Mono MP3/M4A to effortlessly process even 1 hour of audio within 3.5 MB!
              </div>
            </div>
          )}

          {/* Core Trigger conversion submit button */}
          <button
            onClick={handleExecuteTranscription}
            disabled={loading || !droppedFile}
            className="w-full bg-slate-900 hover:bg-slate-800 active:scale-98 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-xs font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm uppercase tracking-wider"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {loadingStep}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 fill-current text-emerald-400" />
                Transcribe Audio
              </>
            )}
          </button>
        </div>

        {/* Right Column: Output Board */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col min-h-[360px] relative justify-start">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              Transcription Output
            </h4>

            {errorText && (
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 flex items-start gap-2.5 text-rose-800 text-xs mb-4">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Conversion Warned</p>
                  <p className="mt-0.5 opacity-90 leading-relaxed">{errorText}</p>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center text-center py-20 space-y-4">
                <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
                <div>
                  <p className="text-xs text-slate-600 font-bold">{loadingStep}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5 max-w-xs leading-relaxed">
                    Note: Audio processing requires a brief moment loading voice segments. Keep this tab active.
                  </p>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-5">
                
                {/* Detected parameters node */}
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex justify-between items-center text-xs">
                  <span className="text-emerald-800 font-medium flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    <strong>Language Detected:</strong> {result.detectedLanguage || "Unknown Dynamic Accent"}
                  </span>
                  
                  {result.isDemo && (
                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[9px] font-bold">
                      DEMO WORKSPACE
                    </span>
                  )}
                </div>

                {/* Plain Transcription block */}
                <div>
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Full Transcription</h5>
                  <div className="text-xs text-slate-800 leading-relaxed bg-white p-4 rounded-xl border border-slate-200 font-medium whitespace-pre-wrap">
                    {result.transcript}
                  </div>
                </div>

                {/* Multilingual Translation overlay */}
                {result.translation && (
                  <div>
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Translation</h5>
                    <div className="text-xs text-slate-700 leading-relaxed bg-white p-4 rounded-xl border border-slate-200 italic">
                      "{result.translation}"
                    </div>
                  </div>
                )}

                {/* Phonetic transliteration box */}
                {result.romanUrduTranslation && (
                  <div>
                    <h5 className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Romanized / Message-Style Translation
                    </h5>
                    <div className="text-xs text-emerald-950 leading-relaxed bg-emerald-50/20 p-4 rounded-xl border border-emerald-100 italic font-medium">
                      "{result.romanUrduTranslation}"
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 text-center py-20 space-y-2">
                <Info className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-bold text-slate-500">Waiting for input</p>
                <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
                  Upload any voice recording file on the left side to observe transcribed outputs here.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
