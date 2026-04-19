'use server'

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import { Readable } from 'stream';

// Tipos y configuraciones
type FileType = 'imagen' | 'video' | 'audio' | 'documento';
type MimeType = string;

interface CompressionSettings {
  imagen: {
    jpeg: sharp.JpegOptions;
    png: sharp.PngOptions;
    webp: sharp.WebpOptions;
    gif: sharp.GifOptions;
  };
  video: {
    codec: string;
    bitrate: string;
    fps: number;
    size: string;
  };
  audio: {
    bitrate: string;
    channels: number;
  };
}


const validTypes: Record<FileType, MimeType[]> = {
  imagen: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/ogg'],
  documento: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

const compressionSettings: CompressionSettings = {
  imagen: {
    jpeg: { quality: 70, progressive: true },
    png: { quality: 70, compressionLevel: 6 },
    webp: { quality: 65 },
    gif: { colors: 128 }
  },
  video: {
    codec: 'libx264',
    bitrate: '800k',
    fps: 24,
    size: '640x?'
  },
  audio: {
    bitrate: '96k',
    channels: 1
  }
};


type PlainFile = {
  name: string;
  size: number;
  type: string;
  content: number[]; // array serializado de bytes
};

// Función principal
export async function optimizeFile(file: PlainFile): Promise<any> {
  const fileType = getFileType(file.type);

  try {
    switch (fileType) {
      case 'imagen':
        return await optimizeImage(file);
      case 'video':
        return await optimizeVideo(file);
      case 'audio':
        return await optimizeAudio(file);
      default:
        return file;
    }
  } catch (error) {
    console.error('Error optimizing file:', error);
    return file;
  }
}

// Detecta el tipo de archivo
function getFileType(mimeType: MimeType): FileType | null {
  for (const [type, mimes] of Object.entries(validTypes) as [FileType, MimeType[]][]) {
    if (mimes.includes(mimeType)) {
      return type;
    }
  }
  return null;
}

// Optimización de imágenes
async function optimizeImage(file: PlainFile): Promise<{ buffer: number[]; type: string }> {
  const buffer = Buffer.from(file.content);
  let optimizer = sharp(buffer);

  switch (file.type) {
    case 'image/jpeg':
      optimizer = optimizer.jpeg(compressionSettings.imagen.jpeg);
      break;
    case 'image/png':
      optimizer = optimizer.png(compressionSettings.imagen.png);
      break;
    case 'image/webp':
      optimizer = optimizer.webp(compressionSettings.imagen.webp);
      break;
    case 'image/gif':
      optimizer = optimizer.gif(compressionSettings.imagen.gif);
      break;
  }

  optimizer = optimizer.resize(1200, 1200, {
    fit: 'inside',
    withoutEnlargement: true
  });

  const optimizedBuffer = await optimizer.toBuffer();

  return {
    buffer: Array.from(optimizedBuffer), // 👈 array normal
    type: file.type
  };
}


// Optimización de videos al estilo de optimizeImage
async function optimizeVideo(file: PlainFile): Promise<{ buffer: number[]; type: string }> {
  const inputBuffer = Buffer.from(file.content);

  return new Promise((resolve, reject) => {
    const inputStream = new Readable({
      read() {
        this.push(inputBuffer);
        this.push(null);
      },
    });

    const outputStream = new PassThrough();
    const chunks: Uint8Array[] = [];

    outputStream.on('data', (chunk) => chunks.push(chunk));
    outputStream.on('end', () => {
      //calculamos tamaño final
      const totalLength = chunks.reduce((acc, curr) => acc + curr.length, 0);
      //creamos buffer final
      const optimizedBuffer = Buffer.allocUnsafe(totalLength);
      //copiamos manualmente
      let offset = 0;
      for (const chunk of chunks) {
        optimizedBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      resolve({ buffer: Array.from(optimizedBuffer), type: 'video/mp4' });
    });
    outputStream.on('error', reject);

    ffmpeg(inputStream)
      .outputOptions([
        '-vcodec libx264',
        '-preset veryfast',
        '-movflags +faststart',
        '-b:v 500k', // << bajamos el bitrate
        '-r 24', // frame rate bajo típico
        '-vf scale=480:-2', // << limita ancho máximo a 480px manteniendo aspecto
        '-crf 30', // << más compresión
        '-pix_fmt yuv420p',
        '-acodec aac', // << recomprime audio
        '-b:a 64k' // << audio muy reducido
      ])
      .format('mp4')
      .on('error', reject)
      .pipe(outputStream);
  });
}

// Optimización de audio
const optimizeAudio = async (file: PlainFile): Promise<Blob> => {
  const buffer = Buffer.from(file.content);
  const inputStream = new PassThrough();
  const outputStream = new PassThrough();

  const chunks: Uint8Array[] = [];
  outputStream.on('data', (chunk: Uint8Array) => chunks.push(chunk));

  return await new Promise((resolve, reject) => {
    outputStream.on('end', () => {
      resolve(new Blob(chunks, { type: 'audio/mpeg' }));
    });

    outputStream.on('error', reject);
    inputStream.end(buffer);

    ffmpeg(inputStream)
      .audioBitrate(compressionSettings.audio.bitrate)
      .audioChannels(compressionSettings.audio.channels)
      .format('mp3')
      .on('error', reject)
      .writeToStream(outputStream);
  });
};
