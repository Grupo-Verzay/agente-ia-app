import { Client } from 'minio';

export const minioClient = new Client({
  endPoint: process.env.S3_ENDPOINT || 'localhost',
  port: 443, // HTTPS por default si es necesario
  useSSL: true, // true si usas HTTPS
  accessKey: process.env.S3_ACCESS_KEY || '',
  secretKey: process.env.S3_SECRET_KEY || '',
});
