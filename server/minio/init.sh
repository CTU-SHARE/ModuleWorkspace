#!/bin/sh
set -eu
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; do sleep 2; done
mc mb --ignore-existing "local/${S3_BUCKET:-module-workspace}"
mc anonymous set none "local/${S3_BUCKET:-module-workspace}"
mc version enable "local/${S3_BUCKET:-module-workspace}"
