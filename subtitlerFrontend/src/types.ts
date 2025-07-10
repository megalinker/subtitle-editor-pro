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