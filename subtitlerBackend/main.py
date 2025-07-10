import json
import os
from dotenv import load_dotenv
import torch
import whisperx
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import datetime
from pydantic import BaseModel
from pyannote.core import Segment as PyannoteSegment
from typing import List, Dict, Optional

load_dotenv()

# --- Pydantic Models for Data Validation (New) ---
class Segment(BaseModel):
    start: float
    end: float
    text: str
    speaker: Optional[str] = None

class RenameSpeakersRequest(BaseModel):
    segments: List[Segment]
    speaker_map: Dict[str, str]

# --- Application Setup ---
app = FastAPI()

# --- CORS Middleware ---
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods (GET, POST, etc.)
    allow_headers=["*"], # Allows all headers
)

# --- Configuration ---
HF_TOKEN = os.getenv("HF_TOKEN")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if torch.cuda.is_available() else "int8"
MODEL_SIZE = "large-v3"

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
    if not file.content_type.startswith(('audio/', 'video/')): # type: ignore
        raise HTTPException(status_code=400, detail="Invalid file type.")

    with tempfile.NamedTemporaryFile(delete=True, suffix=os.path.splitext(file.filename)[1]) as temp_file: # type: ignore
        content = await file.read()
        temp_file.write(content)
        temp_file.flush()

        try:
            audio = whisperx.load_audio(temp_file.name)
            result = models['whisper'].transcribe(audio, batch_size=16)
            
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
            raise HTTPException(status_code=500, detail=str(e))

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
    Returns both the newly timed segments and the SRT content.
    """
    if not file.content_type.startswith(('audio/', 'video/')): # type: ignore
        raise HTTPException(status_code=400, detail="Invalid file type.")

    with tempfile.NamedTemporaryFile(delete=True, suffix=os.path.splitext(file.filename)[1]) as temp_file: # type: ignore
        content = await file.read()
        temp_file.write(content)
        temp_file.flush()

        try:
            audio = whisperx.load_audio(temp_file.name)
            
            tiny_model = models['whisper_tiny']
            result = tiny_model.transcribe(audio, batch_size=16)
            language_code = result["language"]

            align_model, metadata = whisperx.load_align_model(language_code=language_code, device=DEVICE)
            
            transcript_segments = [{"text": line} for line in transcript.splitlines() if line.strip()]
            
            result_aligned = whisperx.align(transcript_segments, align_model, metadata, audio, DEVICE, return_char_alignments=False)
            
            del align_model
            torch.cuda.empty_cache()

            srt_output = generate_srt(result_aligned["segments"])
            
            # Return both SRT and the raw segments
            return {
                "srt_content": srt_output,
                "segments": result_aligned["segments"]
            }
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        
@app.post("/refine_diarization")
async def refine_diarization(file: UploadFile = File(...), segments_json: str = Form(...)):
    """
    Re-runs diarization and uses the user's corrected speaker labels to
    intelligently rename the new diarization output based on temporal overlap.
    """
    if not file.content_type.startswith(('audio/', 'video/')): # type: ignore
        raise HTTPException(status_code=400, detail="Invalid file type.")

    try:
        user_segments = json.loads(segments_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid segments_json format.")

    with tempfile.NamedTemporaryFile(delete=True, suffix=os.path.splitext(file.filename)[1]) as temp_file: # type: ignore
        content = await file.read()
        temp_file.write(content)
        temp_file.flush()

        try:
            audio = whisperx.load_audio(temp_file.name)
            diarize_model = models.get('diarize')
            if not diarize_model:
                raise HTTPException(status_code=500, detail="Diarization model not loaded.")

            # 1. Re-run diarization to get a fresh, accurate segmentation from the AI
            print("Running fresh diarization...")
            new_diarize_segments = diarize_model(audio)

            # 2. Build a mapping from AI labels ('SPEAKER_01') to user names ('Alice')
            speaker_map = {}
            print("Building speaker map from user edits...")
            for segment in user_segments:
                speaker_name = segment.get('speaker')
                # We only care about segments where the user has assigned a meaningful name
                if not speaker_name or speaker_name.startswith("SPEAKER_"):
                    continue

                segment_span = PyannoteSegment(segment['start'], segment['end'])
                
                # Find which AI speaker dominates the user-edited segment's timeframe
                overlapping_speakers = new_diarize_segments.crop(segment_span)
                
                if overlapping_speakers:
                    # Get total duration for each speaker within this cropped segment
                    speaker_durations = {label: overlapping_speakers.label_duration(label) for label in overlapping_speakers.labels()}
                    if speaker_durations:
                        # Find the AI speaker label with the maximum duration in the overlap
                        dominant_ai_speaker = max(speaker_durations, key=speaker_durations.get) # type: ignore
                        
                        # If we haven't mapped this AI speaker yet, add it to our map
                        if dominant_ai_speaker not in speaker_map:
                             print(f"Mapping AI label {dominant_ai_speaker} to user name '{speaker_name}'")
                             speaker_map[dominant_ai_speaker] = speaker_name

            # 3. Rename the labels in the new diarization using the map
            print(f"Applying new names: {speaker_map}")
            # The .rename_labels() method creates a new Annotation object.
            # We use .get as a generator to keep original labels if they're not in the map.
            final_diarization = new_diarize_segments.rename_labels(generator=speaker_map.get)
            
            # 4. Re-assign word-level speakers using the refined diarization and user's text
            result_no_speakers = {"segments": [{"text": s["text"], "start": s["start"], "end": s["end"]} for s in user_segments]}
            result_refined = whisperx.assign_word_speakers(final_diarization, result_no_speakers)

            srt_output = generate_srt(result_refined["segments"])
            
            return {
                "srt_content": srt_output,
                "segments": result_refined["segments"]
            }

        except Exception as e:
            import traceback
            print(traceback.format_exc()) # Log the full error for easier debugging
            raise HTTPException(status_code=500, detail=str(e))