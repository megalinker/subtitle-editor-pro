export interface Word {
  word: string;
  start?: number;
  end?: number;
  speaker?: string;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words?: Word[];
}

export interface FileSignature {
  name: string;
  size: number;
  lastModified: number;
}

export interface Project {
  id: string;
  name: string;
  fileSignature: FileSignature;
  segments: Segment[];
  speakerMap: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}