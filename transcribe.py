#!/usr/bin/env python3
"""
Whisper-based audio transcription script.
Reads audio file from CLI argument and outputs JSON transcription.
Uses faster-whisper for optimized local transcription.
"""

import sys
import json
import os
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "faster-whisper not installed. Run: pip install faster-whisper"
    }), file=sys.stderr)
    sys.exit(1)


def transcribe_audio(audio_path: str, language: str = None) -> dict:
    """
    Transcribe audio file using OpenAI Whisper (faster-whisper implementation).
    
    Args:
        audio_path: Path to audio file
        language: Language code (e.g., 'ur', 'en', 'hi'). None = auto-detect.
    
    Returns:
        Dictionary with transcription results
    """
    
    if not os.path.exists(audio_path):
        return {
            "success": False,
            "error": f"Audio file not found: {audio_path}"
        }
    
    try:
        # Load model (base model = ~140MB, fast on CPU)
        # Models: tiny, base, small, medium, large
        model = WhisperModel("base", device="cpu", compute_type="int8")
        
        # Transcribe
        segments, info = model.transcribe(
            audio_path,
            language=language,
            beam_size=5,
            best_of=5,
            temperature=0.0,
            condition_on_previous_text=True,
            verbose=False
        )
        
        # Extract transcript
        transcript_lines = []
        for segment in segments:
            transcript_lines.append(segment.text.strip())
        
        full_transcript = " ".join(transcript_lines).strip()
        
        if not full_transcript:
            full_transcript = "[Silent audio detected - no speech found]"
        
        # Get detected language
        detected_language = info.language if info else "unknown"
        language_names = {
            'en': 'English',
            'ur': 'Urdu',
            'hi': 'Hindi',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'ar': 'Arabic',
            'pt': 'Portuguese',
            'zh': 'Chinese',
            'ja': 'Japanese',
        }
        detected_lang_name = language_names.get(detected_language, detected_language.upper())
        
        return {
            "success": True,
            "transcript": full_transcript,
            "detectedLanguage": detected_lang_name,
            "translation": full_transcript,  # Whisper doesn't translate, return transcript
            "romanUrduTranslation": full_transcript,
            "summary": "Audio transcribed successfully using Whisper.",
            "sentiment": "Neutral",
            "isDemo": False
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "details": "Ensure the audio file is a valid audio format (MP3, WAV, M4A, WebM, OGG)"
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: transcribe.py <audio_file_path> [language_code]"
        }), file=sys.stderr)
        sys.exit(1)
    
    audio_file = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = transcribe_audio(audio_file, language)
    print(json.dumps(result))
