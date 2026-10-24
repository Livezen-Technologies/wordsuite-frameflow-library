<?php

namespace App\Libraries\Storage;

use Config\Library;

/** Blob store from config: S3/R2 when LIBRARY_S3_BUCKET is set, else a local folder. */
final class StorageFactory
{
    public static function fromConfig(Library $cfg): BlobStoreInterface
    {
        if ($cfg->s3Bucket !== '') {
            return new S3BlobStore($cfg->s3Endpoint, $cfg->s3Bucket, $cfg->s3AccessKeyId, $cfg->s3SecretAccessKey, $cfg->s3Region, $cfg->s3Prefix);
        }

        return new FileBlobStore($cfg->dataDir);
    }
}
