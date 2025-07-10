import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000',
});

export const transcribeFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  return apiClient.post('/transcribe', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const resyncTranscript = (file: File, transcript: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('transcript', transcript);

  return apiClient.post('/resync', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const renameSpeakers = (segments: any[], speakerMap: Record<string, string>) => {
  return apiClient.post('/rename_speakers', {
    segments: segments,
    speaker_map: speakerMap,
  });
};

export const refineDiarization = (file: File, segments: any[]) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('segments_json', JSON.stringify(segments));

  return apiClient.post('/refine_diarization', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};