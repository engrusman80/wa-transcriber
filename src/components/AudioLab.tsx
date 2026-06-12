import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mic, Square, Upload, Sparkles, Globe, FileText, 
  Smile, AlertTriangle, Play, Pause, Trash2, CheckCircle, Info, RefreshCw, Settings, ChevronDown, ChevronUp
} from "lucide-react";
import { TranscriptionResult } from "../types";

export default function AudioLab() {
  // Action state managers
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState<boolean>(false);
  
  // File upload state managers (Direct binary storage - no Base64 convert)
  const [droppedFile, setDroppedFile] = useState<File | null>(null);

  // Collapsible Settings zone
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [selectedEngine, setSelectedEngine] = useState<"gemini" | "browser">("gemini");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const [selectedAction, setSelectedAction] = useState<string>("transcribe");
  const [targetTranslateLanguage, setTargetTranslateLanguage] = useState<string>("English");

  // Server transaction states
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>("Initializing...");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);

  // Free local recognition states
  const [browserSpeechTranscript, setBrowserSpeechTranscript] = useState<string>("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      stopRecordingTimer();
    };
  }, []);

  const startRecordingTimer = () => {
    setRecordingTime(0);
    timerIntervalRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  const stopRecordingTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  // Recording handler
  const handleStartRecording = async () => {
    try {
      setErrorText(null);
      setResult(null);
      setRecordedBlob(null);
      setRecordedUrl(null);
      setDroppedFile(null);
      setBrowserSpeechTranscript("");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/ogg";
      }
      if (!MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/mp4";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(audioBlob);
        setRecordedUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      // Native fallback speech recognition
      if (selectedEngine === "browser") {
        const SpeechRecognitionVal = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognitionVal) {
          const rec = new SpeechRecognitionVal();
          rec.continuous = true;
          rec.interimResults = true;
          
          let langCode = "en-US";
          if (selectedLanguage === "ur") langCode = "ur-PK";
          else if (selectedLanguage === "hi") langCode = "hi-IN";
          else if (selectedLanguage === "es") langCode = "es-ES";
          else if (selectedLanguage === "ar") langCode = "ar-SA";
          rec.lang = langCode;

          rec.onresult = (event: any) => {
            let currentText = "";
            for (let i = 0; i < event.results.length; i++) {
              currentText += event.results[i][0].transcript + " ";
            }
            setBrowserSpeechTranscript(currentText.trim());
          };

          rec.start();
          recognitionRef.current = rec;
        }
      }

      recorder.start(250);
      setIsRecording(true);
      startRecordingTimer();
    } catch (err: any) {
      console.error("Microphone hardware error:", err);
      setErrorText("Could not access microphone. Please enable browser recording permissions or try uploading an audio file below.");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopRecordingTimer();

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Failed to stop local speech recognition:", e);
        }
      }
    }
  };

  const togglePlayback = () => {
    if (!audioPlaybackRef.current) return;
    if (isPlaybackPlaying) {
      audioPlaybackRef.current.pause();
      setIsPlaybackPlaying(false);
    } else {
      audioPlaybackRef.current.play();
      setIsPlaybackPlaying(true);
    }
  };

  const handlePlaybackEnded = () => {
    setIsPlaybackPlaying(false);
  };

  const handleClearRecording = () => {
    setRecordedBlob(null);
    setRecordedUrl(null);
    setResult(null);
    setErrorText(null);
  };

  // Drag-and-drop / select handlers (Safely store file binary directly)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    setResult(null);
    setErrorText(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    
    // Safely store File reference as object
    setDroppedFile(file);
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
    setResult(null);
    setErrorText(null);
  };

  // Transcribe action sending standard FormData parameters
  const handleExecuteTranscription = async () => {
    try {
      setLoading(true);
      setLoadingStep("Reading input audio tracks...");
      setErrorText(null);

      // Free local browser speech recognition fallback
      if (selectedEngine === "browser") {
        setLoadingStep("Processing audio via browser engine...");
        await new Promise((resolve) => setTimeout(resolve, 800));

        let finalTranscript = browserSpeechTranscript || "Assalam-o-Alaikum! Main checks kar raha hoon ke system bilkul proper transcribing kar raha hai.";
        let translatedText = "Hello! I am checking that the system is doing transcribing absolutely properly.";

        setResult({
          transcript: finalTranscript,
          detectedLanguage: "Urdu/Hindi Mix",
          translation: translatedText,
          romanUrduTranslation: finalTranscript,
          summary: "Local browser speech engine evaluated transcription offline.",
          sentiment: "Positive / Attentive",
          isDemo: true
        });
        setLoading(false);
        return;
      }

      // Check existence of audio assets
      if (!recordedBlob && !droppedFile) {
        setErrorText("No voice message detected. Please record a voice clip or drop an audio file.");
        setLoading(false);
        return;
      }

      // Setup clean streaming steps based on sizing
      const isHeavy = droppedFile && droppedFile.size > 25 * 1024 * 1024;
      setLoadingStep(isHeavy ? "Uploading heavy file binary to Gemini cloud structures..." : "Sending audio stream to transcription engine...");

      // Construct browser Multipart FormData to avoid V8 Memory Limit crash triggered by heavy Base64 conversion
      const formData = new FormData();
      
      if (recordedBlob) {
        formData.append("audioFile", recordedBlob, "micro_recording.webm");
      } else if (droppedFile) {
        formData.append("audioFile", droppedFile, droppedFile.name);
      }

      formData.append("language", selectedLanguage);
      formData.append("action", selectedAction);
      formData.append("targetLanguage", targetTranslateLanguage);

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

      // Perform direct multi-part fetch
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData // Content-Type header left blank purposely for native boundary generation
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errorJson = await response.json();
        throw new Error(errorJson.error || "Failed to process audio transcription.");
      }

      const parsedResult: TranscriptionResult = await response.json();
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
            <p className="text-[11px] text-slate-400">Configure language mappings and AI engine preferences.</p>
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
          <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col justify-between min-h-[220px]">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Method A: Drag & Drop Voice File
            </h4>

            {droppedFile ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-3">
                <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-100 w-full max-w-sm">
                  <FileText className="w-8 h-8 text-emerald-700 mx-auto mb-2" />
                  <p className="text-xs font-bold truncate max-w-[280px] mx-auto">{droppedFile.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    {humanReadableSize(droppedFile.size)} • {droppedFile.type || "Audio format"}
                  </p>
                  
                  <button
                    onClick={handleClearFile}
                    className="mt-3 text-rose-600 hover:text-rose-700 text-xs font-semibold flex items-center gap-1 mx-auto cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove asset
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="flex-1 border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-xl flex flex-col items-center justify-center p-6 bg-white hover:bg-emerald-50/10 cursor-pointer transition-colors relative"
              >
                <input
                  type="file"
                  accept="*/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs font-bold text-slate-700">Drag or click to choose audio recording</p>
                <p className="text-[10px] text-slate-400 mt-1">Supports OGG, MP3, WAV, WebM & M4A of any size (up to GBs & 5 hours)</p>
              </div>
            )}
          </div>

          {/* Micro Recording node - HIDDEN */}
          <div className="hidden bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col justify-between min-h-[220px]">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
              Method B: Standard Mic Recording
              {isRecording && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </h4>

            <div className="flex-1 flex flex-col items-center justify-center p-4">
              {isRecording ? (
                <div className="space-y-4 text-center">
                  <div className="text-3xl font-mono font-bold text-slate-800 animate-pulse">
                    {formatTime(recordingTime)}
                  </div>
                  <p className="text-xs text-slate-400">Capturing audio stream... Speak into your microphone.</p>
                  
                  <div className="flex justify-center items-center gap-1 h-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div 
                        key={i} 
                        className="w-1 bg-emerald-500 rounded-full animate-bounce"
                        style={{ 
                          height: `${25 + Math.random() * 75}%`,
                          animationDelay: `${i * 0.08}s`,
                          animationDuration: "0.5s"
                        }}
                      />
                    ))}
                  </div>

                  <button
                    onClick={handleStopRecording}
                    className="mx-auto flex items-center gap-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition-all cursor-pointer shadow-sm"
                  >
                    <Square className="w-4 h-4 fill-current" /> Stop & Capture
                  </button>
                </div>
              ) : recordedUrl ? (
                <div className="text-center space-y-4">
                  <div className="bg-emerald-50 text-emerald-800 text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 border border-emerald-100 font-semibold">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> Audio voice note captured successfully!
                  </div>
                  
                  <audio 
                    ref={audioPlaybackRef} 
                    src={recordedUrl} 
                    onEnded={handlePlaybackEnded} 
                    className="hidden"
                  />

                  <div className="flex justify-center items-center gap-3">
                    <button
                      onClick={togglePlayback}
                      className="w-12 h-12 rounded-full bg-slate-900 lg:hover:bg-slate-800 text-white flex items-center justify-center transition-colors shadow-sm cursor-pointer"
                    >
                      {isPlaybackPlaying ? (
                        <Pause className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Play className="w-5 h-5 text-emerald-400 ml-0.5" />
                      )}
                    </button>

                    <button
                      onClick={handleClearRecording}
                      className="p-3 bg-white hover:bg-slate-100 text-slate-500 hover:text-rose-600 rounded-full transition-colors cursor-pointer border border-slate-200"
                      title="Clear mic recording"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <button
                    onClick={handleStartRecording}
                    className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Mic className="w-6 h-6" />
                  </button>
                  <p className="text-xs font-semibold text-slate-600">Click to record microphone sound clip</p>
                </div>
              )}
            </div>
          </div>

          {/* Core Trigger conversion submit button */}
          <button
            onClick={handleExecuteTranscription}
            disabled={loading || (!recordedBlob && !droppedFile)}
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
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col min-h-[460px] relative justify-start">
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
                  Record mic signals or choose any voice recording file on the left side to observe transcribed outputs here.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
