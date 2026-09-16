import axios from 'axios';

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
};

const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
});

export const transcribeFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  return apiClient.post('/transcribe', formData);
};

export const resyncTranscript = (file: File, transcript: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('transcript', transcript);

  return apiClient.post('/resync', formData);
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

  return apiClient.post('/refine_diarization', formData);
};
