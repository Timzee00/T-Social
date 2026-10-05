# Security

Report suspected vulnerabilities privately to the project owner before publishing reproduction details. Do not send session cookies, provider tokens or real user content.

The server enforces authentication and resource ownership. SQL constraints enforce unique interactions and foreign keys; signed media URLs last two minutes. OAuth transactions expire after ten minutes and are atomically consumed. Sessions expire after seven days and can be revoked.

All mutating browser requests must carry the exact configured Origin. Provider secrets, session keys and database credentials must remain server-side. Application logs exclude query strings, cookies and provider responses. Disable public access to the database and S3 bucket.

See `docs/SECURITY-REVIEW.md` for the tested threat model, fixed issues and remaining operational requirements. A passing suite is not a guarantee against every vulnerability.
