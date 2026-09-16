import json
import os
import shutil
from dotenv import load_dotenv
import torch
import whisperx
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import datetime
import traceback
from pydantic import BaseModel
from typing import Any, List, Dict, Optional
import re
from starlette.requests import ClientDisconnect, Request

load_dotenv()

# --- Pydantic Models for Data Validation (New) ---
class Word(BaseModel):
    start: Optional[float] = None
    end: Optional[float] = None
    word: str
    speaker: Optional[str] = None
    score: Optional[Any] = None

class Segment(BaseModel):
    start: float
    end: float
    text: str
    speaker: Optional[str] = None
    words: Optional[List[Word]] = None

class RenameSpeakersRequest(BaseModel):
  segments: List[Segment]
  speaker_map: Dict[str, str]


# --- Application Setup ---
app = FastAPI()

# --- CORS Middleware ---
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods (GET, POST, etc.)
    allow_headers=["*"], # Allows all headers
)

@app.middleware("http")
async def log_transcription_requests(request: Request, call_next):
    should_log = request.url.path in {"/transcribe", "/resync", "/refine_diarization"}
    if should_log:
        print(
            f"Incoming {request.method} {request.url.path}: "
            f"content_length={request.headers.get('content-length')}, "
            f"content_type={request.headers.get('content-type')}, "
            f"origin={request.headers.get('origin')}",
            flush=True,
        )

    try:
        response = await call_next(request)
    except ClientDisconnect:
        if should_log:
            print(f"Client disconnected during {request.method} {request.url.path}", flush=True)
        raise
    except Exception:
        if should_log:
            print(traceback.format_exc(), flush=True)
        raise

    if should_log:
        print(
            f"Completed {request.method} {request.url.path}: "
            f"status_code={response.status_code}",
            flush=True,
        )
    return response

# --- Configuration ---
HF_TOKEN = os.getenv("HF_TOKEN")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if torch.cuda.is_available() else "int8"
MODEL_SIZE = "large-v3"
TRANSCRIBE_BATCH_SIZE = int(os.getenv("WHISPERX_BATCH_SIZE", "4"))
TINY_BATCH_SIZE = int(os.getenv("WHISPERX_TINY_BATCH_SIZE", "8"))
SUPPORTED_MEDIA_EXTENSIONS = {
    ".aac",
    ".aiff",
    ".avi",
    ".flac",
    ".m4a",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".ogg",
    ".opus",
    ".wav",
    ".webm",
}

# --- Model Loading ---
models = {}

@app.on_event("startup")
def load_models():
    """Load all necessary models into memory when the server starts."""
    print(f"Loading models to device: {DEVICE}")
    models['whisper'] = whisperx.load_model(MODEL_SIZE, DEVICE, compute_type=COMPUTE_TYPE)
    models['whisper_tiny'] = whisperx.load_model("tiny", DEVICE, compute_type=COMPUTE_TYPE)
    
    if not HF_TOKEN or HF_TOKEN == "YOUR_HUGGING_FACE_TOKEN":
        print("Warning: Hugging Face token not set. Speaker diarization will fail.")
        models['diarize'] = None
    else:
        models['diarize'] = whisperx.diarize.DiarizationPipeline(use_auth_token=HF_TOKEN, device=DEVICE) # type: ignore
    
    print("Models loaded successfully.")

# --- Helper Functions ---
def format_time(seconds):
    delta = datetime.timedelta(seconds=seconds)
    hours, remainder = divmod(delta.seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    milliseconds = delta.microseconds // 1000
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

def generate_srt(segments: List[Dict]) -> str:
    """Formats a list of segments into an SRT string."""
    srt_content = ""
    for i, segment in enumerate(segments):
        start_time = format_time(segment['start'])
        end_time = format_time(segment['end'])
        speaker = segment.get('speaker', 'SPEAKER_UNKNOWN')
        text = segment['text'].strip()
        
        # Add speaker label to text if it exists
        line = f"[{speaker}]: {text}" if 'speaker' in segment else text

        srt_content += f"{i + 1}\n"
        srt_content += f"{start_time} --> {end_time}\n"
        srt_content += f"{line}\n\n"
        
    return srt_content

def is_supported_media_upload(file: UploadFile) -> bool:
    content_type = file.content_type or ""
    extension = os.path.splitext(file.filename or "")[1].lower()
    return content_type.startswith(("audio/", "video/")) or extension in SUPPORTED_MEDIA_EXTENSIONS

async def save_upload_to_temp(file: UploadFile, temp_file) -> None:
    await file.seek(0)
    shutil.copyfileobj(file.file, temp_file)
    temp_file.flush()

# --- API Endpoints ---
@app.get("/")
def read_root():
    return {"message": "WhisperX Subtitle Generator API is running!"}

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribes an audio/video file and returns both the raw segment data
    and the formatted SRT content.
    """
    if not is_supported_media_upload(file):
        raise HTTPException(status_code=400, detail="Invalid file type.")

    with tempfile.NamedTemporaryFile(delete=True, suffix=os.path.splitext(file.filename)[1]) as temp_file: # type: ignore
        print(
            f"Starting transcription: filename={file.filename!r}, "
            f"content_type={file.content_type!r}, batch_size={TRANSCRIBE_BATCH_SIZE}",
            flush=True,
        )
        await save_upload_to_temp(file, temp_file)

        try:
            audio = whisperx.load_audio(temp_file.name)
            result = models['whisper'].transcribe(audio, batch_size=TRANSCRIBE_BATCH_SIZE)
            
            language_code = result["language"]
            align_model, metadata = whisperx.load_align_model(language_code=language_code, device=DEVICE)
            result = whisperx.align(result["segments"], align_model, metadata, audio, DEVICE, return_char_alignments=False)
            del align_model
            torch.cuda.empty_cache()

            if diarize_model := models.get('diarize'):
                diarize_segments = diarize_model(audio)
                result = whisperx.assign_word_speakers(diarize_segments, result)
            
            # This part is updated
            srt_output = generate_srt(result["segments"])
            
            # Return both SRT and the raw segments
            return {
                "srt_content": srt_output,
                "segments": result["segments"]
            }

        except Exception as e:
            import traceback
            print(traceback.format_exc(), flush=True)
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            torch.cuda.empty_cache()

@app.post("/rename_speakers")
async def rename_speakers(request: RenameSpeakersRequest):
    """
    Takes segment data and a speaker map, returns the updated segments
    and a new SRT file with the names updated.
    """
    updated_segments = []
    for segment_model in request.segments:
        segment = segment_model.model_dump()
        if segment.get("speaker") in request.speaker_map:
            new_name = request.speaker_map[segment["speaker"]]
            if new_name:
                segment["speaker"] = new_name
        updated_segments.append(segment)

    new_srt = generate_srt(updated_segments)
    
    return {
        "srt_content": new_srt,
        "segments": updated_segments
    }


@app.post("/resync")
async def resynchronize(file: UploadFile = File(...), transcript: str = Form(...)):
    """
    Forces alignment of a given transcript to an audio/video file.
    This function now correctly handles raw text by performing a full alignment
    and then reconstructing the segments based on the user's line breaks.
    This version is more resilient to mismatches between user text and aligned words.
    """
    if not is_supported_media_upload(file):
        raise HTTPException(status_code=400, detail="Invalid file type.")

    with tempfile.NamedTemporaryFile(delete=True, suffix=os.path.splitext(file.filename)[1]) as temp_file: # type: ignore
        print(
            f"Starting resync: filename={file.filename!r}, "
            f"content_type={file.content_type!r}, batch_size={TINY_BATCH_SIZE}",
            flush=True,
        )
        await save_upload_to_temp(file, temp_file)

        try:
            audio = whisperx.load_audio(temp_file.name)
            
            # 1. Transcribe to get language and speech boundaries
            tiny_model = models['whisper_tiny']
            result = tiny_model.transcribe(audio, batch_size=TINY_BATCH_SIZE)
            language_code = result["language"]

            if not result["segments"]:
                 raise HTTPException(status_code=400, detail="No speech detected in audio for alignment.")

            # 2. Align the entire user-provided transcript at once
            align_model, metadata = whisperx.load_align_model(language_code=language_code, device=DEVICE)
            
            full_transcript = transcript.replace('\n', ' ').strip()
            segment_to_align = [{
                'text': full_transcript,
                'start': result['segments'][0]['start'],
                'end': result['segments'][-1]['end']
            }]
            
            aligned_result = whisperx.align(segment_to_align, align_model, metadata, audio, DEVICE, return_char_alignments=False)
            
            # 3. Reconstruct segments with new, more robust logic
            all_words = aligned_result["segments"][0].get("words", [])
            if not all_words:
                 raise HTTPException(status_code=500, detail="Alignment failed to produce word timings.")

            def normalize_text(text: str) -> str:
                """A more lenient text normalizer for comparison."""
                # Lowercase, strip whitespace, and remove common punctuation.
                text = text.lower().strip()
                return re.sub(r'[\s.,?!"]', '', text)

            user_lines = [line.strip() for line in transcript.splitlines() if line.strip()]
            final_segments = []
            word_cursor = 0

            for line in user_lines:
                if word_cursor >= len(all_words):
                    print(f"Warning: Ran out of aligned words. Cannot process line: '{line}'")
                    break

                line_start_idx = word_cursor
                best_match_end_idx = -1

                # Try to find a sequence of words that matches the current line
                for i in range(word_cursor, len(all_words)):
                    words_for_line = [w['word'] for w in all_words[line_start_idx : i + 1]]
                    reconstructed_text = "".join(words_for_line)

                    # Compare normalized versions to handle punctuation/casing differences
                    if normalize_text(reconstructed_text) == normalize_text(line):
                        best_match_end_idx = i
                        break

                # After checking all possibilities, see if we found a match for the line
                if best_match_end_idx != -1:
                    # Match found! Create the segment.
                    line_end_idx = best_match_end_idx
                    current_segment_words = all_words[line_start_idx : line_end_idx + 1]

                    segment_start = next((w.get('start') for w in current_segment_words if 'start' in w), None)
                    segment_end = next((w.get('end') for w in reversed(current_segment_words) if 'end' in w), None)

                    final_segments.append({
                        "text": line,
                        "start": segment_start,
                        "end": segment_end,
                        "words": current_segment_words
                    })
                    
                    # Move the cursor to the next word for the next line's search
                    word_cursor = line_end_idx + 1
                else:
                    # No match found for this line. Log it and continue to the next.
                    # This prevents the whole process from stopping on one bad line.
                    print(f"Warning: Could not find matching words for line: '{line}'. Omitting this segment.")
                    continue

            del align_model
            torch.cuda.empty_cache()

            srt_output = generate_srt(final_segments)
            
            return {
                "srt_content": srt_output,
                "segments": final_segments
            }
        
        except Exception as e:
            import traceback
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e))
        
@app.post("/refine_diarization")
async def refine_diarization(file: UploadFile = File(...), segments_json: str = Form(...)):
    """
    Re-runs diarization and uses the user's corrected speaker labels to
    intelligently rename the new diarization output based on temporal overlap.
    This version is updated to work with whisperx's DataFrame output.
    """
    if not is_supported_media_upload(file):
        raise HTTPException(status_code=400, detail="Invalid file type.")

    try:
        user_segments = json.loads(segments_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid segments_json format.")

    with tempfile.NamedTemporaryFile(delete=True, suffix=os.path.splitext(file.filename)[1]) as temp_file: # type: ignore
        print(
            f"Starting diarization refinement: filename={file.filename!r}, "
            f"content_type={file.content_type!r}",
            flush=True,
        )
        await save_upload_to_temp(file, temp_file)

        try:
            audio = whisperx.load_audio(temp_file.name)
            diarize_model = models.get('diarize')
            if not diarize_model:
                raise HTTPException(status_code=500, detail="Diarization model not loaded.")

            # 1. Re-run diarization to get a fresh, accurate segmentation from the AI
            print("Running fresh diarization...")
            # This now returns a pandas DataFrame
            new_diarize_segments_df = diarize_model(audio)

            # 2. Build a mapping from AI labels ('SPEAKER_01') to user names ('Alice')
            speaker_map = {}
            print("Building speaker map from user edits...")
            for segment in user_segments:
                speaker_name = segment.get('speaker')
                # We only care about segments where the user has assigned a meaningful name
                if not speaker_name or speaker_name.startswith("SPEAKER_"):
                    continue

                seg_start, seg_end = segment['start'], segment['end']
                
                # --- FIX START: Replace pyannote logic with pandas ---
                
                # Find speaker turns that overlap with the user-edited segment's timeframe
                overlapping_turns = new_diarize_segments_df[
                    (new_diarize_segments_df['start'] < seg_end) & (new_diarize_segments_df['end'] > seg_start)
                ]

                if not overlapping_turns.empty:
                    # Calculate the duration of the overlap for each turn
                    overlap_starts = overlapping_turns['start'].clip(lower=seg_start)
                    overlap_ends = overlapping_turns['end'].clip(upper=seg_end)
                    
                    # Create a copy to avoid SettingWithCopyWarning
                    overlapping_turns = overlapping_turns.copy()
                    overlapping_turns.loc[:, 'overlap_duration'] = overlap_ends - overlap_starts
                    
                    # Group by the AI's speaker label and sum the durations
                    speaker_durations = overlapping_turns.groupby('speaker')['overlap_duration'].sum()

                    if not speaker_durations.empty:
                        # Find the AI speaker label with the maximum duration in the overlap
                        dominant_ai_speaker = speaker_durations.idxmax()
                        
                        # If we haven't mapped this AI speaker yet, add it to our map
                        if dominant_ai_speaker not in speaker_map:
                            print(f"Mapping AI label {dominant_ai_speaker} to user name '{speaker_name}'")
                            speaker_map[dominant_ai_speaker] = speaker_name
            
            # --- FIX END ---

            # 3. Rename the labels in the new diarization using the map
            print(f"Applying new names: {speaker_map}")
            
            # --- FIX: Use pandas .map() to rename speakers in the DataFrame ---
            final_diarization_df = new_diarize_segments_df.copy()
            # Map the new names, and fill any unmapped speakers with their original names
            final_diarization_df['speaker'] = final_diarization_df['speaker'].map(speaker_map).fillna(final_diarization_df['speaker'])

            # 4. Re-assign word-level speakers using the refined diarization and user's text
            result_no_speakers = {"segments": [{"text": s["text"], "start": s["start"], "end": s["end"]} for s in user_segments]}
            # assign_word_speakers can accept the DataFrame directly
            result_refined = whisperx.assign_word_speakers(final_diarization_df, result_no_speakers)

            srt_output = generate_srt(result_refined["segments"])
            
            return {
                "srt_content": srt_output,
                "segments": result_refined["segments"]
            }

        except Exception as e:
            import traceback
            print(traceback.format_exc()) # Log the full error for easier debugging
            raise HTTPException(status_code=500, detail=str(e))
