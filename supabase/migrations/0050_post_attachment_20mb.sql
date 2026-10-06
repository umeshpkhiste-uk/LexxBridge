-- Lower the post-attachments bucket's hard cap from 25 MB to 20 MB to
-- match the new client-side limit (src/features/posts/api.ts). Storage's
-- own file_size_limit is the real enforcement — the client check is just
-- there to fail fast with a friendly message before uploading anything.
update storage.buckets set file_size_limit = 20971520 where id = 'post-attachments';
