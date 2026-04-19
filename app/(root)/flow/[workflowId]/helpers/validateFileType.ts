export const ACCEPT_TYPES: Record<string, string[]> = {
    image: [
        'image/jpeg',      // .jpg, .jpeg
        'image/png',       // .png
        'image/gif',       // .gif
        'image/webp',      // .webp
        'image/svg+xml',   // .svg
        'image/tiff',      // .tif, .tiff
        'image/bmp',       // .bmp
        'image/x-icon',    // .ico
    ],
    video: [
        'video/mp4',       // .mp4
        'video/webm',      // .webm
        'video/ogg',       // .ogv
        'video/quicktime', // .mov
        'video/x-msvideo', // .avi
        'video/x-matroska',// .mkv
        'video/x-flv',     // .flv
        'application/ogg', // .ogx
    ],
    audio: [
        'audio/mp3',       // .mp3
        'audio/mpeg',      // .mp3
        'audio/ogg',       // .ogg, .oga
        'audio/wav',       // .wav
        'audio/webm',      // .weba
        'audio/aac',       // .aac
        'audio/x-m4a',     // .m4a
        'audio/x-ms-wma',  // .wma
        'audio/x-flac',    // .flac
        'application/ogg', // .opus
    ],
    document: [
        'application/pdf', // .pdf
        'application/msword', // .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.ms-excel', // .xls
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-powerpoint', // .ppt
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
        'text/plain',      // .txt
        'text/csv',        // .csv
        'application/rtf', // .rtf
        'application/zip', // .zip
        'application/x-rar-compressed', // .rar
        'application/x-7z-compressed', // .7z
    ],
    '*': ['*/*'] // Para aceptar cualquier tipo de archivo
};

export const validateFileType = (file: File, nodeType: string): boolean => {
    // Si el tipo es wildcard o no está definido, aceptamos cualquier archivo
    if (nodeType === '*' || !ACCEPT_TYPES[nodeType]) return true;

    // Verificación especial para archivos OGG que pueden tener diferentes MIME types
    const isOggFile = file.name.toLowerCase().endsWith('.ogg') ||
        file.name.toLowerCase().endsWith('.ogv') ||
        file.name.toLowerCase().endsWith('.oga');

    if (isOggFile && (nodeType === 'audio' || nodeType === 'video')) {
        return ACCEPT_TYPES[nodeType].some(type =>
            type.includes('ogg') || type === 'application/ogg'
        );
    }

    // Verificación estándar
    return ACCEPT_TYPES[nodeType].includes(file.type) ||
        (file.type === '' && ACCEPT_TYPES[nodeType].some(type =>
            file.name.toLowerCase().endsWith(`.${type.split('/')[1]}`)
        ));
};

// Versión mejorada con mensajes de error descriptivos
export const getAcceptTypeString = (nodeType: string): string => {
    if (!ACCEPT_TYPES[nodeType]) return '*';

    return ACCEPT_TYPES[nodeType]
        .map(type => {
            const [category, subtype] = type.split('/');
            return subtype === '*' ? '' : `.${subtype.split('+')[0].replace('x-', '')}`;
        })
        .filter(ext => ext !== '')
        .join(', ');
};