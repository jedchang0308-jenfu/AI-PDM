const { google } = require("googleapis");

/**
 * Google Cloud Function / Cloud Run Function for handling drawing release.
 * 
 * Flow:
 * 1. Verify API Token (Shared Secret in authorization: Bearer <API_TOKEN>).
 * 2. Connect to Google Drive using Application Default Credentials (ADC).
 * 3. Process each file:
 *    - Check if it's already in the Released folder and has correct appProperties (Idempotency).
 *    - Move file from its current parent(s) (or pendingFolderId) to releasedFolderId.
 *    - Write anti-counterfeiting metadata (appProperties) to ALL files.
 */
exports.releaseHandler = async (req, res) => {
  // 1. HTTP Method validation
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // 2. Token verification
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "";
  const expectedToken = process.env.API_TOKEN || "";

  if (expectedToken && token !== expectedToken) {
    console.warn("Unauthorized attempt: Token mismatch");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 3. Payload extraction
  const {
    submissionId,
    approvedBy,
    drawingNumber,
    revision,
    files,
    pendingFolderId,
    releasedFolderId,
    approvedAt
  } = req.body;

  if (!submissionId || !approvedBy || !drawingNumber || !revision || !files || !releasedFolderId) {
    return res.status(400).json({
      error: "Missing required fields in payload (submissionId, approvedBy, drawingNumber, revision, files, releasedFolderId)"
    });
  }

  try {
    // 4. Drive API Client Initialization
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/drive"]
    });
    const drive = google.drive({ version: "v3", auth });

    const processedFiles = [];

    // 5. Iterate through files
    for (const file of files) {
      const { fileRole, gdriveFileId, originalFilename } = file;

      if (!gdriveFileId) {
        console.warn(`File ${originalFilename} is missing gdriveFileId, skipping.`);
        continue;
      }

      console.log(`Processing file: ${originalFilename} (ID: ${gdriveFileId}, Role: ${fileRole})`);

      try {
        // Fetch current file parents and appProperties
        const fileMeta = await drive.files.get({
          fileId: gdriveFileId,
          fields: "parents, appProperties"
        });

        const currentParents = fileMeta.data.parents || [];
        const currentAppProps = fileMeta.data.appProperties || {};

        const inReleasedFolder = currentParents.includes(releasedFolderId);
        const metadataMatches = 
          currentAppProps.Status === "Official" &&
          currentAppProps.SubmissionId === submissionId &&
          currentAppProps.DrawingNumber === drawingNumber &&
          currentAppProps.Revision === revision &&
          currentAppProps.ApprovedBy === approvedBy &&
          currentAppProps.ApprovedAt === approvedAt;

        // Idempotency: If already moved and metadata matches, skip
        if (inReleasedFolder && metadataMatches) {
          console.log(`File ${originalFilename} is already in the Released folder and has correct metadata. (Idempotent skip)`);
          processedFiles.push({
            originalFilename,
            gdriveFileId,
            status: "already_released"
          });
          continue;
        }

        const updateRequestBody = {
          appProperties: {
            Status: "Official",
            SubmissionId: submissionId,
            DrawingNumber: drawingNumber,
            Revision: revision,
            ApprovedBy: approvedBy,
            ApprovedAt: approvedAt
          }
        };

        if (inReleasedFolder) {
          // Already in released folder, just update the metadata
          console.log(`File ${originalFilename} is in Released folder but metadata needs update.`);
          await drive.files.update({
            fileId: gdriveFileId,
            requestBody: updateRequestBody
          });
          processedFiles.push({
            originalFilename,
            gdriveFileId,
            status: "metadata_updated"
          });
        } else {
          // Not in released folder, perform full move and metadata write
          console.log(`Moving file ${originalFilename} to Released folder and writing metadata.`);
          const removeParentsList = currentParents.join(",");
          
          await drive.files.update({
            fileId: gdriveFileId,
            addParents: releasedFolderId,
            removeParents: removeParentsList || undefined,
            requestBody: updateRequestBody
          });

          processedFiles.push({
            originalFilename,
            gdriveFileId,
            status: "moved_and_metadata_written"
          });
        }
      } catch (fileError) {
        console.error(`Error processing file ${originalFilename}:`, fileError);
        throw new Error(`Failed to process file ${originalFilename}: ${fileError.message}`);
      }
    }

    // 6. Return success response
    return res.status(200).json({
      success: true,
      submissionId,
      message: `Successfully released ${processedFiles.length} file(s).`,
      files: processedFiles
    });

  } catch (error) {
    console.error("Release handler failed:", error);
    return res.status(500).json({
      error: error.message || "Unknown internal error in release handler"
    });
  }
};
