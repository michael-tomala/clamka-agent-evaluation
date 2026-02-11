/**
 * Whisper Wrapper Service dla testing/
 *
 * Wrapper obsługujący 3 backendy transkrypcji:
 * - whisper-cpp (lokalna CLI)
 * - OpenAI Whisper API (wymaga: npm install openai)
 * - ElevenLabs Scribe API (wymaga: npm install @elevenlabs/elevenlabs-js)
 *
 * Zwraca ujednolicony format TranscriptionOutput.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type {
  TranscriptionBackend,
  TranscriptionEvalOptions,
  TranscriptionOutput,
  TranscriptionSegmentOutput,
} from '../types/transcription-eval';

// ============================================================================
// WHISPER-CPP BACKEND
// ============================================================================

/** Parsuje timestamp whisper-cli (HH:MM:SS,mmm → sekundy) */
function parseWhisperTimestamp(ts: string): number {
  const parts = ts.split(':');
  const secParts = parts[2].split(',');
  return (
    parseFloat(parts[0]) * 3600 +
    parseFloat(parts[1]) * 60 +
    parseFloat(secParts[0]) +
    parseFloat(secParts[1]) / 1000
  );
}

async function transcribeWithWhisperCpp(
  audioPath: string,
  language: string,
  options: TranscriptionEvalOptions
): Promise<TranscriptionOutput> {
  const startTime = Date.now();
  const model = options.model || 'medium';
  const enableVAD = options.enableVAD !== false;

  const modelPath = path.join(os.homedir(), '.whisper-cpp-models', `ggml-${model}.bin`);
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Whisper model not found: ${modelPath}. Install: brew install whisper-cpp && download model.`);
  }

  const outputFile = path.join(os.tmpdir(), `whisper-eval-${Date.now()}`);

  const whisperArgs = [
    '-m', modelPath,
    '-l', language,
    '-oj', '-ojf',
    '-of', outputFile,
    '-et', '2.4',
    '--max-context', '64',
    '-bs', '5',
    '-f', audioPath,
  ];

  if (options.prompt) {
    whisperArgs.push('--prompt', options.prompt);
  }

  if (enableVAD) {
    const vadModelPath = path.join(os.homedir(), '.whisper-cpp-models', 'ggml-silero-v6.2.0.bin');
    if (fs.existsSync(vadModelPath)) {
      whisperArgs.push('--vad', '--vad-model', vadModelPath);
    }
  }

  // Spawn whisper-cli
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('whisper-cli', whisperArgs, { stdio: 'pipe' });

    proc.stderr.on('data', (data: Buffer) => {
      // Logi whisper
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`whisper-cli failed with code ${code}`));
    });

    proc.on('error', (err: Error) => {
      reject(new Error(`whisper-cli not found. Install: brew install whisper-cpp. Error: ${err.message}`));
    });
  });

  // Parsuj JSON output
  const jsonFile = outputFile + '.json';
  if (!fs.existsSync(jsonFile)) {
    return { text: '', segments: [], backend: 'whisper-cpp', durationMs: Date.now() - startTime };
  }

  const whisperOutput = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  fs.unlinkSync(jsonFile);

  const segments: TranscriptionSegmentOutput[] = [];
  let fullText = '';

  if (whisperOutput.transcription) {
    for (const seg of whisperOutput.transcription) {
      const startSec = parseWhisperTimestamp(seg.offsets.from);
      const endSec = parseWhisperTimestamp(seg.offsets.to);

      segments.push({
        text: seg.text.trim(),
        startMs: startSec * 1000,
        endMs: endSec * 1000,
      });
    }
    fullText = whisperOutput.transcription.map((s: { text: string }) => s.text).join('').trim();
  }

  return {
    text: fullText,
    segments,
    backend: 'whisper-cpp',
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// OPENAI BACKEND
// ============================================================================

async function transcribeWithOpenAI(
  audioPath: string,
  language: string,
  options: TranscriptionEvalOptions
): Promise<TranscriptionOutput> {
  const startTime = Date.now();

  // Dynamic import - openai musi być zainstalowane w testing/api
  let OpenAI: any;
  try {
    // Spróbuj z desktop-app (wspólne node_modules w monorepo)
    OpenAI = (await import('openai')).default;
  } catch {
    throw new Error('OpenAI SDK not found. Install: cd testing/api && npm install openai');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  const client = new OpenAI({ apiKey });

  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    language,
    response_format: 'verbose_json',
    temperature: options.temperature,
  });

  const segments: TranscriptionSegmentOutput[] = [];
  if (response.segments) {
    for (const seg of response.segments) {
      segments.push({
        text: seg.text.trim(),
        startMs: seg.start * 1000,
        endMs: seg.end * 1000,
      });
    }
  }

  return {
    text: response.text,
    segments,
    backend: 'openai',
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// ELEVENLABS BACKEND
// ============================================================================

/** Mapowanie ISO 639-1 → ISO 639-2 (ElevenLabs wymaga 3-literowych kodów) */
const LANGUAGE_CODE_MAP: Record<string, string> = {
  pl: 'pol', en: 'eng', de: 'deu', fr: 'fra', es: 'spa',
  it: 'ita', pt: 'por', nl: 'nld', ru: 'rus', ja: 'jpn',
  ko: 'kor', zh: 'cmn', ar: 'arb', hi: 'hin', cs: 'ces',
  uk: 'ukr', sv: 'swe', da: 'dan', fi: 'fin', nb: 'nob',
};

async function transcribeWithElevenLabs(
  audioPath: string,
  language: string,
  options: TranscriptionEvalOptions
): Promise<TranscriptionOutput> {
  const startTime = Date.now();

  let ElevenLabsClient: any;
  try {
    const mod = await import('@elevenlabs/elevenlabs-js');
    ElevenLabsClient = mod.ElevenLabsClient || mod.default;
  } catch {
    throw new Error('ElevenLabs SDK not found. Install: cd testing/api && npm install @elevenlabs/elevenlabs-js');
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable not set');
  }

  const client = new ElevenLabsClient({ apiKey });
  const diarize = options.diarize !== false;
  const langCode = LANGUAGE_CODE_MAP[language] || language;

  const response = await client.speechToText.convert({
    file: fs.createReadStream(audioPath),
    modelId: 'scribe_v1',
    diarize,
    languageCode: langCode,
  });

  // Agreguj słowa do segmentów
  const segments: TranscriptionSegmentOutput[] = [];

  if (response.words && response.words.length > 0) {
    const MAX_GAP_SECONDS = 2.0;
    let currentSegment: { words: string[]; start: number; end: number; speakerId?: string } | null = null;

    for (const word of response.words) {
      const shouldStartNew =
        !currentSegment ||
        (diarize && word.speaker_id !== currentSegment.speakerId) ||
        (word.start - currentSegment.end > MAX_GAP_SECONDS);

      if (shouldStartNew) {
        if (currentSegment) {
          segments.push({
            text: currentSegment.words.join(' ').trim(),
            startMs: currentSegment.start * 1000,
            endMs: currentSegment.end * 1000,
            speakerId: currentSegment.speakerId,
          });
        }
        currentSegment = {
          words: [word.text],
          start: word.start,
          end: word.end,
          speakerId: word.speaker_id,
        };
      } else {
        currentSegment!.words.push(word.text);
        currentSegment!.end = word.end;
      }
    }

    if (currentSegment) {
      segments.push({
        text: currentSegment.words.join(' ').trim(),
        startMs: currentSegment.start * 1000,
        endMs: currentSegment.end * 1000,
        speakerId: currentSegment.speakerId,
      });
    }
  }

  return {
    text: response.text || segments.map(s => s.text).join(' '),
    segments,
    backend: 'elevenlabs',
    durationMs: Date.now() - startTime,
  };
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

class WhisperWrapperService {

  /**
   * Transkrybuj plik audio wybranym backendem
   */
  async transcribe(
    audioPath: string,
    backend: TranscriptionBackend,
    language: string = 'pl',
    options: TranscriptionEvalOptions = {}
  ): Promise<TranscriptionOutput> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    console.log(`[WhisperWrapper] Transcribing with ${backend}: ${path.basename(audioPath)} (lang: ${language})`);

    switch (backend) {
      case 'whisper-cpp':
        return transcribeWithWhisperCpp(audioPath, language, options);
      case 'openai':
        return transcribeWithOpenAI(audioPath, language, options);
      case 'elevenlabs':
        return transcribeWithElevenLabs(audioPath, language, options);
      default:
        throw new Error(`Unknown backend: ${backend}`);
    }
  }

  /**
   * Sprawdź dostępność backendu
   */
  async checkBackendAvailability(backend: TranscriptionBackend): Promise<{ available: boolean; error?: string }> {
    switch (backend) {
      case 'whisper-cpp': {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          await execAsync('whisper-cli --help', { timeout: 5000 });
          return { available: true };
        } catch {
          return { available: false, error: 'whisper-cli not found. Install: brew install whisper-cpp' };
        }
      }
      case 'openai': {
        if (!process.env.OPENAI_API_KEY) {
          return { available: false, error: 'OPENAI_API_KEY not set' };
        }
        try {
          await import('openai');
          return { available: true };
        } catch {
          return { available: false, error: 'openai package not installed' };
        }
      }
      case 'elevenlabs': {
        if (!process.env.ELEVENLABS_API_KEY) {
          return { available: false, error: 'ELEVENLABS_API_KEY not set' };
        }
        try {
          await import('@elevenlabs/elevenlabs-js');
          return { available: true };
        } catch {
          return { available: false, error: '@elevenlabs/elevenlabs-js package not installed' };
        }
      }
    }
  }

  /**
   * Sprawdź dostępność wszystkich backendów
   */
  async checkAllBackends(): Promise<Record<TranscriptionBackend, { available: boolean; error?: string }>> {
    const [whisperCpp, openai, elevenlabs] = await Promise.all([
      this.checkBackendAvailability('whisper-cpp'),
      this.checkBackendAvailability('openai'),
      this.checkBackendAvailability('elevenlabs'),
    ]);
    return { 'whisper-cpp': whisperCpp, openai, elevenlabs };
  }
}

// Singleton
export const whisperWrapperService = new WhisperWrapperService();
