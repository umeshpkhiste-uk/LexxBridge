-- Verification IDs must be PNG or JPEG/JPG only — no PDFs, HEIC, or any
-- other format. Storage itself now rejects anything else (the strongest
-- layer: enforced even if a client bypasses the app's own picker/API
-- checks), matching the client-side allowlist added alongside this
-- migration.

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg']
where id = 'verification-documents';
