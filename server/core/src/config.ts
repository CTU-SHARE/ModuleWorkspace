import 'dotenv/config';
import { z } from 'zod';
export const env=z.object({
 DATABASE_URL:z.string().min(1), PORT:z.coerce.number().default(4000),
 LOGTO_ISSUER:z.string().url(), LOGTO_JWKS_URL:z.string().url(), LOGTO_RESOURCE:z.string().default('https://api.sharebase.local'),
 INTERNAL_SECRET:z.string().min(32), CENTRIFUGO_SECRET:z.string().min(32), CENTRIFUGO_API_KEY:z.string().min(32),
 CENTRIFUGO_URL:z.string().url(), N8N_WEBHOOK_URL:z.string().url(),
 S3_ENDPOINT:z.string().url(), S3_ACCESS_KEY:z.string(), S3_SECRET_KEY:z.string(), S3_BUCKET:z.string().default('sharebase'),
 HASURA_URL:z.string().url(), HASURA_ADMIN_SECRET:z.string().min(32),
 MIGRATIONS_DIR:z.string().default('../db/migrations'), METADATA_FILE:z.string().default('../hasura/metadata.json')
}).parse(process.env);
